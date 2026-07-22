import type { withTenantContext } from '../../../kernel/db/tenant-context';
import { derivarSaude } from '../../cards/health/card-health.core';
import { calcularMarcos, type Marcos } from '../../phases/milestones/phase-milestones.core';
import type { ContextoEvento } from '../actions/action-revalidation.core';
import type {
  CampoSnapshotDef,
  CardSnapshot,
  RecordSnapshot,
  SnapshotAvaliacao,
} from '../conditions/condition-snapshot';

type Db = ReturnType<typeof withTenantContext>;

/**
 * SNAPSHOT BUILDER do motor (Story 4.6) — fecha o **DEB-4-4-SNAPSHOT-BUILDER**. Lê o estado do Card/Registro
 * NO INSTANTE do Evento **sob RLS** (`withTenantContext`) e monta o `SnapshotAvaliacao` (4.4, consumido por
 * `avaliarCondicoes`) e o `ContextoEvento` (4.5, consumido por `resolverAlvoDeterministico`). Nada aqui
 * autoriza — o isolamento cross-tenant já vem da RLS (uma linha de outra Org "não existe"); o avaliador cai em
 * fail-closed quando o recurso falta.
 *
 * **M-1 (`DEB-4-5-EVENTO-ALVO-CONTAINMENT`) — a garantia crítica DESTA Story:** `recordId`/`linkedRecordIds` do
 * `ContextoEvento` só recebem Registros vinculados a um Card do **Pipe PROPRIETÁRIO** da Automação. A RLS isola
 * por Organização, mas NÃO por Pipe/Database dentro da mesma Org — sem este filtro, um `RECORD_EDIT` modo
 * `EVENTO`/`VINCULO` poderia atingir um Registro de outro Pipe/Database da mesma Org (elevação de escopo). Ver
 * `_bmad-output/implementation-artifacts/decisions/automation-engine-4-6.md` §5.
 *
 * `valoresAnteriores` vêm do `payload` MINIMIZADO do Evento (nunca de releitura — determinismo, §1358); na
 * Fase 1 o envelope não os carrega (allowlist AD-30 não inclui `valores`), então operadores de "mudou" ficam
 * fail-closed — comportamento explícito e seguro.
 */

/** O Evento (envelope) que o motor está processando, na forma mínima que o builder precisa. */
export interface EventoParaSnapshot {
  readonly orgId: string;
  readonly eventType: string;
  readonly pipeId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly occurredAt: Date;
}

/** Resultado do builder: o snapshot para as Condições e o contexto para a resolução de alvo das Ações. */
export interface SnapshotEContexto {
  readonly snapshot: SnapshotAvaliacao;
  readonly contexto: ContextoEvento;
}

/** Config de marcos congelada na entrada (2.12). Lida defensivamente do Json (fail-closed → marcos nulos). */
interface ConfigMarcosSnapshot {
  expectedDurationMin: number | null;
  dueDurationMin: number | null;
  expirationDurationMin: number | null;
  expectedFieldId: string | null;
  dueFieldId: string | null;
  expirationFieldId: string | null;
}

const MARCOS_NULOS: Marcos = { esperado: null, vencimento: null, expiracao: null };

/** Lê a config de marcos do `configSnapshot` (Json) de forma tolerante; malformado ⇒ tudo nulo (fail-closed). */
function lerConfigMarcos(json: unknown): ConfigMarcosSnapshot {
  const o = (
    json !== null && typeof json === 'object' && !Array.isArray(json) ? json : {}
  ) as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    expectedDurationMin: num(o.expectedDurationMin),
    dueDurationMin: num(o.dueDurationMin),
    expirationDurationMin: num(o.expirationDurationMin),
    expectedFieldId: str(o.expectedFieldId),
    dueFieldId: str(o.dueFieldId),
    expirationFieldId: str(o.expirationFieldId),
  };
}

/** `valores` (JSONB) como Record seguro; qualquer outra forma ⇒ objeto vazio. */
function comoRegistro(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Índice `Field.id → { type }` dos Campos ATIVOS de um Formulário (allowlist p/ o avaliador). Sob RLS. Vazio se
 * não há Formulário (o avaliador então trata toda Condição de Campo como referência inválida ⇒ fail-closed).
 */
async function indexarCamposAtivos(
  db: Db,
  where: { pipeId?: string; databaseId?: string; context: 'PIPE_INITIAL' | 'DATABASE' },
): Promise<Record<string, CampoSnapshotDef>> {
  const form = await db.form.findFirst({
    where: {
      context: where.context,
      ...(where.pipeId ? { pipeId: where.pipeId } : {}),
      ...(where.databaseId ? { databaseId: where.databaseId } : {}),
    },
    select: { id: true },
  });
  if (!form) return {};
  const campos = await db.field.findMany({
    where: { formId: form.id, state: 'ACTIVE' },
    select: { id: true, type: true },
  });
  const out: Record<string, CampoSnapshotDef> = {};
  for (const c of campos) out[c.id] = { type: c.type };
  return out;
}

/**
 * Monta o snapshot + contexto para um Evento de **Card**. Deriva `saude` a partir da entrada atual
 * (`CardPhaseEntry` mais recente) via `calcularMarcos` + `derivarSaude` — sob demanda na leitura (sem agendador,
 * 2.12/2.13). `linkedRecordIds` = Registros com vínculo ATIVO ao Card (3.9) — já contidos ao Pipe (o Card é do
 * `pipeId` do Evento).
 */
async function montarParaCard(db: Db, evento: EventoParaSnapshot): Promise<SnapshotEContexto> {
  const cardId = evento.resourceId;
  const card = await db.card.findUnique({
    where: { id: cardId },
    select: { id: true, pipeId: true, phaseId: true, lifecycleState: true, valores: true },
  });

  if (!card) {
    // Card não existe sob RLS (inexistente ou outra Org) ⇒ snapshot vazio; Condições de Card ficam fail-closed.
    return {
      snapshot: {
        orgId: evento.orgId,
        avaliadoEm: evento.occurredAt,
        camposPorId: {},
        card: null,
        record: null,
      },
      contexto: { cardId: null, recordId: null, linkedRecordIds: [] },
    };
  }

  const [entrada, links, camposPorId] = await Promise.all([
    db.cardPhaseEntry.findFirst({
      where: { cardId, phaseId: card.phaseId },
      orderBy: { enteredAt: 'desc' },
      select: { enteredAt: true, configSnapshot: true },
    }),
    db.cardRecordLink.findMany({
      where: { cardId, state: 'ACTIVE' },
      select: { recordId: true },
    }),
    indexarCamposAtivos(db, { pipeId: card.pipeId, context: 'PIPE_INITIAL' }),
  ]);

  const valores = comoRegistro(card.valores);
  const marcos: Marcos = entrada
    ? calcularMarcos(entrada.enteredAt, lerConfigMarcos(entrada.configSnapshot), valores)
    : MARCOS_NULOS;
  const saude = derivarSaude(marcos, evento.occurredAt);
  const linkedRecordIds = links.map((l) => l.recordId);

  const cardSnapshot: CardSnapshot = {
    lifecycleState: card.lifecycleState as CardSnapshot['lifecycleState'],
    saude,
    phaseId: card.phaseId,
    marcos,
    valores,
    valoresAnteriores: null, // envelope da Fase 1 não carrega "antes" (AD-30) ⇒ "mudou" fail-closed
    linkedRecordIds,
  };

  return {
    snapshot: {
      orgId: evento.orgId,
      avaliadoEm: evento.occurredAt,
      camposPorId,
      card: cardSnapshot,
      record: null,
    },
    // M-1: `linkedRecordIds` já são do Card do Pipe proprietário (o Card é do `pipeId` do Evento); um Registro
    // de outro Pipe/Database não tem vínculo ATIVO com este Card e portanto não aparece aqui.
    contexto: { cardId, recordId: null, linkedRecordIds },
  };
}

/**
 * Monta o snapshot + contexto para um Evento de **Registro**. **M-1:** o `recordId` só é entregue se o Registro
 * tiver vínculo ATIVO com ALGUM Card do **Pipe proprietário** da Automação (`pipeIdDaAutomacao`) — §1284. Um
 * Registro da mesma Org mas de outro Pipe/Database referenciado indevidamente NÃO vira alvo (contexto vazio).
 */
async function montarParaRecord(
  db: Db,
  evento: EventoParaSnapshot,
  pipeIdDaAutomacao: string,
): Promise<SnapshotEContexto> {
  const recordId = evento.resourceId;
  const record = await db.record.findUnique({
    where: { id: recordId },
    select: { id: true, databaseId: true, lifecycleState: true, valores: true },
  });

  const vazio: SnapshotEContexto = {
    snapshot: {
      orgId: evento.orgId,
      avaliadoEm: evento.occurredAt,
      camposPorId: {},
      card: null,
      record: null,
    },
    contexto: { cardId: null, recordId: null, linkedRecordIds: [] },
  };
  if (!record) return vazio;

  // M-1 CONTAINMENT — o Registro só é alvo se estiver vinculado a um Card do Pipe PROPRIETÁRIO da Automação.
  const vinculoNoPipe = await db.cardRecordLink.findFirst({
    where: { recordId, state: 'ACTIVE', card: { pipeId: pipeIdDaAutomacao } },
    select: { id: true },
  });
  const contido = vinculoNoPipe !== null;

  const camposPorId = await indexarCamposAtivos(db, {
    databaseId: record.databaseId,
    context: 'DATABASE',
  });
  const recordSnapshot: RecordSnapshot = {
    lifecycleState: record.lifecycleState as RecordSnapshot['lifecycleState'],
    valores: comoRegistro(record.valores),
    valoresAnteriores: null,
  };

  return {
    snapshot: {
      orgId: evento.orgId,
      avaliadoEm: evento.occurredAt,
      camposPorId,
      card: null,
      record: recordSnapshot,
    },
    // Fora do Pipe proprietário ⇒ `recordId` NÃO é entregue como alvo (fail-closed): a Ação resolve para nulo.
    contexto: { cardId: null, recordId: contido ? recordId : null, linkedRecordIds: [] },
  };
}

/**
 * Ponto de entrada: monta `{ snapshot, contexto }` para um Evento, sob RLS. `pipeIdDaAutomacao` é o Pipe
 * proprietário da Automação (RN-100) — usado para o CONTAINMENT M-1 dos Eventos de Registro.
 */
export async function montarSnapshotEContexto(
  db: Db,
  evento: EventoParaSnapshot,
  pipeIdDaAutomacao: string,
): Promise<SnapshotEContexto> {
  if (evento.resourceType === 'CARD' || evento.resourceType === 'CARD_RECORD_LINK') {
    return montarParaCard(db, evento);
  }
  if (evento.resourceType === 'RECORD') {
    return montarParaRecord(db, evento, pipeIdDaAutomacao);
  }
  // Tipo de recurso desconhecido ⇒ contexto vazio (fail-closed).
  return {
    snapshot: {
      orgId: evento.orgId,
      avaliadoEm: evento.occurredAt,
      camposPorId: {},
      card: null,
      record: null,
    },
    contexto: { cardId: null, recordId: null, linkedRecordIds: [] },
  };
}
