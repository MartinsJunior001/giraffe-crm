import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../../generated/prisma';
import type { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, type withTenantContext } from '../../../kernel/db/tenant-context';
import { emitirEventoDeDominio } from '../../../domain-events/domain-event-emission';
import { NS_DOMAIN_EVENT, uuidV5 } from '../../../domain-events/event-envelope';
import { resolverAcessoDaMembership } from '../../pipe-authz';
import { SubmissaoInvalidaError, validarSubmissao } from '../../cards/submission';
import type { NotificationDistributionService } from '../../../notifications/distribution/notification-distribution.service';
import { obterTipoNotificacao } from '../../../notifications/notification-catalog';
import type { Acao } from '../automation-config';
import {
  type AlvoAcaoSnapshot,
  type ContextoEvento,
  resolverAlvoDeterministico,
  revalidarAcao,
} from '../actions/action-revalidation.core';
import type { PrincipalAutomacao } from '../actions/automation-principal';
import {
  EVENTO_GERADO_ASSIGN_RESPONSIBLE,
  EVENTO_GERADO_RECORD_CREATE,
  EVENTO_GERADO_REQUEST_CREATE,
  EVENTO_GERADO_TASK_CREATE,
} from '../actions/action-extension-contract';
import type { ActionResultState, ErrorCode } from './engine-types';

type Db = ReturnType<typeof withTenantContext>;

/**
 * EXECUTORES de Ação do motor (Story 4.6). Cada executor:
 *  1. resolve o alvo determinístico (`resolverAlvoDeterministico`, 4.5) do `ContextoEvento` (montado pelo
 *     snapshot-builder sob RLS — **M-1** já aplicado ali);
 *  2. monta o `AlvoAcaoSnapshot` (relê o alvo sob RLS — defesa em profundidade / estado atual, §1405);
 *  3. **revalida sob o principal** (`revalidarAcao`, 4.5): capacidade explícita + escopo restrito + Organização +
 *     estado. **Executa APENAS se `permitido`** (L-1 — o gate primário é `resultado.permitido`, NUNCA
 *     `exigeConfirmacaoHumana`);
 *  4. **confirmação humana (§1383):** uma Ação `permitido` mas com `exigeConfirmacaoHumana=true` NÃO é executada
 *     pelo motor da Fase 1 — vira `BLOCKED_CONFIRMATION` (continuação por fluxo separado é contrato futuro);
 *  5. executa a mutação **reusando o núcleo/padrão de domínio** (nunca o serviço `RequestContext`-scoped nem sua
 *     guarda de usuário) numa transação atômica no client raiz com `definirContextoOrg` — evento na mesma tx (AD-13).
 *
 * **Não-ampliação de poder** é garantida em (3): o escopo é do PRINCIPAL (definição versionada), não do criador.
 * A idempotência da Ação vem da chave `(executionId, actionIndex)` do `AutomationActionResult` (o motor não
 * reexecuta uma Ação com resultado), REFORÇADA por chaves idempotentes determinísticas nas mutações de criação.
 */

/**
 * Cadeia de encadeamento (Story 4.7) que o motor injeta para que um executor que GERA um novo Evento propague a
 * causalidade: o filho herda `executionChainId` (a raiz), aponta `causationId` ao Evento gatilho e incrementa a
 * profundidade (`chainDepth + 1`). Sem isto, um Evento gerado por Ação não continuaria a cadeia (nem a prevenção).
 */
export interface ContextoCadeia {
  /** `eventId` do Evento gatilho desta Execução — vira o `causationId` do Evento que a Ação gerar. */
  readonly causationEventId: string;
  /** Raiz da cadeia — propagada para o Evento gerado (o filho herda a MESMA cadeia). */
  readonly executionChainId: string;
  /** Profundidade DESTA Execução; o Evento gerado carrega `chainDepth + 1`. */
  readonly chainDepth: number;
}

/** Contexto de execução que o motor injeta em cada executor (singleton — sem `RequestContext`). */
export interface ExecContext {
  readonly prisma: PrismaService;
  readonly db: Db;
  readonly contexto: { orgId: string; accountId?: string };
  readonly principal: PrincipalAutomacao;
  /** Identidade da Execução + posição da Ação — base das chaves idempotentes determinísticas de criação. */
  readonly executionId: string;
  readonly actionIndex: number;
  /** Encadeamento (4.7) — para propagar cadeia/causação/profundidade ao Evento que a Ação gerar. */
  readonly cadeia: ContextoCadeia;
  /**
   * Distribuição de Notificações (5.6) — consumida por `NOTIFICATION_SEND` (E5, Story 5.7). É a MESMA fonte
   * dos produtores de sistema (context-explícito); resolve destinatários pela estratégia do tipo, revalida
   * acesso atual, aplica preferências e dedup — não-ampliação por construção.
   */
  readonly distribuicao: NotificationDistributionService;
}

/** Desfecho de UMA Ação — o que o motor grava em `AutomationActionResult`. */
export interface ResultadoExecucao {
  readonly state: ActionResultState;
  readonly errorCode: ErrorCode | null;
  readonly targetResourceId: string | null;
  /**
   * `eventId` do Evento canônico que esta Ação GEROU (encadeamento — 4.7), ou `null` se não gerou. O motor o
   * enfileira (sob a barreira de profundidade/ciclo/timeout) para continuar a cadeia.
   */
  readonly emittedEventId?: string | null;
}

/**
 * `correlationId` DETERMINÍSTICO do Evento gerado por uma Ação (encadeamento — 4.7). Derivado de
 * `(executionId, actionIndex)`: um retry da MESMA Ação reproduz o mesmo `correlationId` ⇒ o mesmo `eventId`
 * (uuidv5 do envelope) ⇒ o `@@unique(orgId,eventId)` do outbox faz o 2º INSERT colidir (idempotente, sem 2º Evento).
 */
function correlationDeterministico(executionId: string, actionIndex: number): string {
  return uuidV5(NS_DOMAIN_EVENT, `corr:${executionId}:${actionIndex}`);
}

function conflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Monta o `AlvoAcaoSnapshot` relendo o alvo sob RLS. O tipo de alvo depende da Ação:
 *  · `CARD_*` ⇒ Card (`pipeId`/`lifecycleState`);
 *  · `RECORD_CREATE`/`RECORD_CREATE_RELATED` ⇒ Database de destino (`databaseId`/`state`);
 *  · `RECORD_EDIT` ⇒ Record (`databaseId`/`lifecycleState`).
 * `encontrado=false` quando a releitura não acha (inexistente/outra Org — a RLS não distingue; recusa em ambos).
 */
async function montarAlvoSnapshot(
  db: Db,
  acao: Acao,
  recursoId: string,
  contexto: ContextoEvento,
): Promise<AlvoAcaoSnapshot> {
  const vazio: AlvoAcaoSnapshot = {
    encontrado: false,
    orgId: null,
    pipeId: null,
    databaseId: null,
    lifecycleState: null,
  };

  if (acao.tipo.startsWith('CARD_')) {
    const card = await db.card.findUnique({
      where: { id: recursoId },
      select: { orgId: true, pipeId: true, lifecycleState: true },
    });
    if (!card) return vazio;
    return {
      encontrado: true,
      orgId: card.orgId,
      pipeId: card.pipeId,
      databaseId: null,
      lifecycleState: card.lifecycleState,
    };
  }

  // E5 (Story 5.7) — TASK_CREATE/REQUEST_CREATE: alvo = o Pipe alvo (state ACTIVE/ARCHIVED gateia).
  if (acao.tipo === 'TASK_CREATE' || acao.tipo === 'REQUEST_CREATE') {
    const pipe = await db.pipe.findUnique({
      where: { id: recursoId },
      select: { orgId: true, state: true },
    });
    if (!pipe) return vazio;
    return {
      encontrado: true,
      orgId: pipe.orgId,
      pipeId: recursoId,
      databaseId: null,
      lifecycleState: pipe.state,
    };
  }

  // E5 (Story 5.7) — NOTIFICATION_SEND: alvo = o recurso PRIMÁRIO do Evento (Card/Tarefa/Solicitação). O tipo
  // do recurso vem do contexto (exatamente um não-nulo, garantido pela resolução determinística). Lê o `pipeId`
  // do recurso (o escopo NOTIFICATION exige `pipeId === principal.pipeId`). Estado não gateia (5.6 decide).
  if (acao.tipo === 'NOTIFICATION_SEND') {
    if (recursoId === contexto.cardId) {
      const card = await db.card.findUnique({
        where: { id: recursoId },
        select: { orgId: true, pipeId: true },
      });
      if (!card) return vazio;
      return {
        encontrado: true,
        orgId: card.orgId,
        pipeId: card.pipeId,
        databaseId: null,
        lifecycleState: null,
      };
    }
    if (recursoId === contexto.taskId) {
      const t = await db.task.findUnique({
        where: { id: recursoId },
        select: { orgId: true, pipeId: true },
      });
      if (!t) return vazio;
      return {
        encontrado: true,
        orgId: t.orgId,
        pipeId: t.pipeId,
        databaseId: null,
        lifecycleState: null,
      };
    }
    if (recursoId === contexto.requestId) {
      const s = await db.solicitacao.findUnique({
        where: { id: recursoId },
        select: { orgId: true, pipeId: true },
      });
      if (!s) return vazio;
      return {
        encontrado: true,
        orgId: s.orgId,
        pipeId: s.pipeId,
        databaseId: null,
        lifecycleState: null,
      };
    }
    return vazio;
  }

  if (acao.tipo === 'RECORD_CREATE' || acao.tipo === 'RECORD_CREATE_RELATED') {
    const database = await db.database.findUnique({
      where: { id: recursoId },
      select: { orgId: true, state: true },
    });
    if (!database) return vazio;
    return {
      encontrado: true,
      orgId: database.orgId,
      pipeId: null,
      databaseId: recursoId,
      lifecycleState: database.state,
    };
  }

  // RECORD_EDIT (alvo = Registro).
  const record = await db.record.findUnique({
    where: { id: recursoId },
    select: { orgId: true, databaseId: true, lifecycleState: true },
  });
  if (!record) return vazio;
  return {
    encontrado: true,
    orgId: record.orgId,
    pipeId: null,
    databaseId: record.databaseId,
    lifecycleState: record.lifecycleState,
  };
}

/**
 * Executa UMA Ação. Ponto de entrada do módulo. Ordem: resolver alvo → montar snapshot do alvo → revalidar sob
 * o principal → (recusa ⇒ `DENIED`; confirmação ⇒ `BLOCKED_CONFIRMATION`) → executor concreto. Nunca lança por
 * recusa de domínio (vira resultado); erros de EXECUÇÃO (contenção) propagam para o retry do motor.
 */
export async function executarAcao(
  ctx: ExecContext,
  acao: Acao,
  contextoEvento: ContextoEvento,
): Promise<ResultadoExecucao> {
  const alvoResolvido = resolverAlvoDeterministico(acao, contextoEvento);
  const alvoSnapshot =
    alvoResolvido === null
      ? { encontrado: false, orgId: null, pipeId: null, databaseId: null, lifecycleState: null }
      : await montarAlvoSnapshot(ctx.db, acao, alvoResolvido.recursoId, contextoEvento);

  const veredito = revalidarAcao(acao, alvoResolvido, alvoSnapshot, ctx.principal);
  if (!veredito.permitido) {
    return {
      state: 'DENIED',
      errorCode: veredito.motivo,
      targetResourceId: alvoResolvido?.recursoId ?? null,
    };
  }
  // L-1: `permitido` é o gate; `exigeConfirmacaoHumana` só CLASSIFICA — o motor da Fase 1 não executa a Ação
  // sensível (não mantém job aberto; continuação por fluxo separado é contrato futuro — §1383).
  if (veredito.exigeConfirmacaoHumana) {
    return {
      state: 'BLOCKED_CONFIRMATION',
      errorCode: 'REQUIRES_CONFIRMATION',
      targetResourceId: alvoResolvido!.recursoId,
    };
  }

  // Só chegam aqui as Ações SEM confirmação.
  switch (acao.tipo) {
    case 'CARD_ASSIGN_RESPONSIBLE':
      return atribuirResponsavel(ctx, acao, alvoResolvido!.recursoId, alvoSnapshot.pipeId);
    case 'RECORD_CREATE':
      return criarRegistro(ctx, acao, alvoResolvido!.recursoId, null);
    case 'RECORD_CREATE_RELATED':
      return criarRegistro(ctx, acao, alvoResolvido!.recursoId, contextoEvento.cardId);
    // E5 (Story 5.7): alvo = Pipe alvo (`alvoResolvido.recursoId`); Card do Evento p/ vínculo opcional.
    case 'TASK_CREATE':
      return criarTarefa(ctx, acao, alvoResolvido!.recursoId, contextoEvento);
    case 'REQUEST_CREATE':
      return criarSolicitacao(ctx, acao, alvoResolvido!.recursoId, contextoEvento);
    // E5 (Story 5.7): alvo = recurso primário do Evento (`alvoResolvido.recursoId`).
    case 'NOTIFICATION_SEND':
      return enviarNotificacao(ctx, acao, alvoResolvido!.recursoId, contextoEvento);
    default:
      // Defesa em profundidade: qualquer outro tipo sem confirmação não deveria existir no catálogo Fase 1.
      return { state: 'DENIED', errorCode: 'ACAO_DESCONHECIDA', targetResourceId: null };
  }
}

/**
 * CARD_ASSIGN_RESPONSIBLE — atribui/troca o Responsável (2.10), reusando o padrão de `card-access.service`.
 * **SC-2101/2102 (`DEB-4-5-MEMBERSHIP-REF`):** o alvo (Membership) precisa de acesso operacional PRÉVIO ao Card
 * (`resolverAcessoDaMembership` → `podeOperar`); atribuir NÃO amplia acesso. Sem isso ⇒ `DENIED`.
 */
async function atribuirResponsavel(
  ctx: ExecContext,
  acao: Acao,
  cardId: string,
  pipeId: string | null,
): Promise<ResultadoExecucao> {
  const membershipId = String(acao.parametros.membershipId);

  // SC-2101 sob RLS: o alvo já tem acesso operacional? (creator/histórico não contam — a lógica é a de 2.10).
  const acessoAlvo = await resolverAcessoDaMembership(ctx.db, membershipId, cardId);
  if (!acessoAlvo || !acessoAlvo.podeOperar) {
    return { state: 'DENIED', errorCode: 'FORA_DO_ESCOPO', targetResourceId: cardId };
  }

  const atual = await ctx.db.cardResponsavel.findFirst({
    where: { cardId, state: 'ACTIVE' },
    select: { id: true, membershipId: true },
  });
  if (atual && atual.membershipId === membershipId) {
    // Idempotente: NENHUMA mudança ⇒ NENHUM Evento gerado (não continua a cadeia por um no-op — §1427).
    return { state: 'SUCCEEDED', errorCode: null, targetResourceId: cardId, emittedEventId: null };
  }

  let emittedEventId: string | null = null;
  try {
    await ctx.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, ctx.contexto)) await p;
      if (atual) {
        await tx.cardResponsavel.update({
          where: { id: atual.id },
          data: { state: 'REMOVED', removedAt: new Date() },
        });
      }
      await tx.cardResponsavel.create({
        data: { orgId: ctx.contexto.orgId, cardId, membershipId, state: 'ACTIVE' },
      });
      await tx.cardHistory.create({
        data: {
          orgId: ctx.contexto.orgId,
          cardId,
          type: atual ? 'RESPONSAVEL_CHANGED' : 'RESPONSAVEL_ASSIGNED',
          summary: atual
            ? 'Responsável alterado pela Automação'
            : 'Responsável atribuído pela Automação',
          actorId: ctx.contexto.accountId ?? null,
        },
      });
      // ENCADEAMENTO (4.7): a mudança de Responsável GERA `CARD_RESPONSIBLE_CHANGED`, na MESMA tx (AD-13 — sem
      // Evento sem fato). O envelope propaga a cadeia/causação/profundidade; `actorId=null`/`origin=AUTOMATION`
      // (o ATOR é o principal Automação). `resourceId=cardId` (mesmo alvo) — a base da detecção de re-visita.
      const { eventId } = await emitirEventoDeDominio(tx, ctx.contexto, {
        // Identificador GERADO declarado pelo contrato de extensão (4.9): declarado = usado, sem drift.
        eventType: EVENTO_GERADO_ASSIGN_RESPONSIBLE,
        pipeId,
        resourceType: 'CARD',
        resourceId: cardId,
        actorId: null,
        origin: 'AUTOMATION',
        occurredAt: new Date(),
        correlationId: correlationDeterministico(ctx.executionId, ctx.actionIndex),
        causationId: ctx.cadeia.causationEventId,
        executionChainId: ctx.cadeia.executionChainId,
        chainDepth: ctx.cadeia.chainDepth + 1,
      });
      emittedEventId = eventId;
    });
  } catch (err) {
    if (conflito(err))
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: cardId };
    throw err; // erro inesperado ⇒ retry do motor
  }
  return { state: 'SUCCEEDED', errorCode: null, targetResourceId: cardId, emittedEventId };
}

/**
 * RECORD_CREATE / RECORD_CREATE_RELATED — cria ≤1 Registro no Database configurado (reusa o padrão de
 * `records.service`), validando `valores` contra o snapshot da `FormVersion` PUBLICADA (fail-closed → `DENIED`).
 * Idempotência da Ação: `idempotencyKey` DETERMINÍSTICA `${executionId}:${actionIndex}` — um retry reencontra o
 * Registro (P2002 → idempotente), garantindo "no máximo 1 Registro" (§1387). `RECORD_CREATE_RELATED` também cria
 * o vínculo `CardRecordLink` ao Card de contexto (idempotente por índice parcial ativo — 3.9).
 */
async function criarRegistro(
  ctx: ExecContext,
  acao: Acao,
  databaseId: string,
  cardIdParaVinculo: string | null,
): Promise<ResultadoExecucao> {
  const form = await ctx.db.form.findFirst({
    where: { context: 'DATABASE', databaseId },
    select: { id: true, publishedVersion: true },
  });
  if (!form || form.publishedVersion == null) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: databaseId };
  }
  const versao = await ctx.db.formVersion.findFirst({
    where: { formId: form.id, version: form.publishedVersion },
    select: { id: true, snapshot: true },
  });
  if (!versao) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: databaseId };
  }

  let valores: Record<string, unknown>;
  try {
    valores = validarSubmissao(versao.snapshot, acao.parametros.valores ?? {});
  } catch (err) {
    if (err instanceof SubmissaoInvalidaError) {
      return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: databaseId };
    }
    throw err;
  }

  const idempotencyKey = `auto:${ctx.executionId}:${ctx.actionIndex}`;
  const correlationId = randomUUID();
  let recordId: string;
  let emittedEventId: string | null = null;

  try {
    recordId = await ctx.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, ctx.contexto)) await p;
      const novo = await tx.record.create({
        data: {
          orgId: ctx.contexto.orgId,
          databaseId,
          formId: form.id,
          formVersionId: versao.id,
          idempotencyKey,
          valores: valores as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await tx.recordHistory.create({
        data: {
          orgId: ctx.contexto.orgId,
          recordId: novo.id,
          type: 'CREATED',
          summary: 'Registro criado pela Automação',
          actorId: ctx.contexto.accountId ?? null,
        },
      });
      if (cardIdParaVinculo) {
        await tx.cardRecordLink.create({
          data: {
            orgId: ctx.contexto.orgId,
            cardId: cardIdParaVinculo,
            recordId: novo.id,
            state: 'ACTIVE',
            correlationId,
            createdBy: ctx.contexto.accountId ?? null,
          },
        });
      }
      // ENCADEAMENTO (4.7): criar o Registro GERA `RECORD_CREATED`, na MESMA tx (AD-13). `resourceId=novo.id`
      // (o Registro criado — alvo NOVO a cada vez ⇒ assinatura distinta por nível: cadeias "que expandem" são
      // barradas por PROFUNDIDADE, não por re-visita). `origin=AUTOMATION`; `correlationId=novo.id` (1:1 com o
      // Registro criado — `eventId` determinístico e retry-safe). Registro puro NÃO carrega `pipeId` (§1339).
      const { eventId } = await emitirEventoDeDominio(tx, ctx.contexto, {
        // Identificador GERADO declarado pelo contrato de extensão (4.9): declarado = usado, sem drift.
        eventType: EVENTO_GERADO_RECORD_CREATE,
        pipeId: null,
        resourceType: 'RECORD',
        resourceId: novo.id,
        actorId: null,
        origin: 'AUTOMATION',
        occurredAt: new Date(),
        correlationId: novo.id,
        causationId: ctx.cadeia.causationEventId,
        executionChainId: ctx.cadeia.executionChainId,
        chainDepth: ctx.cadeia.chainDepth + 1,
      });
      emittedEventId = eventId;
      return novo.id;
    });
  } catch (err) {
    if (conflito(err)) {
      // Retry idempotente: o Registro desta Ação já existe (mesma idempotencyKey) — devolve-o, sem 2º Registro.
      const existente = await ctx.db.record.findFirst({
        where: { databaseId, idempotencyKey },
        select: { id: true },
      });
      if (existente)
        return {
          state: 'SUCCEEDED',
          errorCode: null,
          targetResourceId: existente.id,
          emittedEventId: null,
        };
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: databaseId };
    }
    throw err;
  }
  return { state: 'SUCCEEDED', errorCode: null, targetResourceId: recordId, emittedEventId };
}

// ── E5 (Story 5.7) — Criar Tarefa / Criar Solicitação / Enviar Notificação ─────────────────────────────

/** Lê um parâmetro de texto opcional (`string`) da config; `undefined`/`null`/não-string ⇒ `null`. */
function textoOpcional(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * Resolve o Card a VINCULAR na criação por Automação (Story 5.7): se `vincularCardDoEvento` e há Card no
 * contexto, ele deve ser do MESMO Pipe alvo (senão a criação é recusada — `validarCardDoPipe` de 5.1/5.2).
 * Devolve `{ ok, cardId }`: `ok=false` ⇒ recusar (`FORA_DO_ESCOPO`). Sem intenção de vínculo ⇒ `cardId=null`.
 */
async function resolverCardParaVinculo(
  db: Db,
  vincular: boolean,
  cardDoEvento: string | null,
  pipeAlvo: string,
): Promise<{ ok: boolean; cardId: string | null }> {
  if (!vincular || cardDoEvento === null) return { ok: true, cardId: null };
  const card = await db.card.findUnique({
    where: { id: cardDoEvento },
    select: { pipeId: true },
  });
  // Card do Evento de outro Pipe (ou invisível sob RLS) NÃO pode ser vinculado a uma Tarefa do Pipe alvo.
  if (!card || card.pipeId !== pipeAlvo) return { ok: false, cardId: null };
  return { ok: true, cardId: cardDoEvento };
}

/** A Membership do Responsável (se configurada) existe e está ATIVA sob RLS? (regra canônica 5.1/5.2.) */
async function responsavelValido(db: Db, membershipId: string): Promise<boolean> {
  const m = await db.membership.findFirst({
    where: { id: membershipId, state: 'ACTIVE' },
    select: { id: true },
  });
  return m !== null;
}

/**
 * TASK_CREATE — cria ≤1 Tarefa no Pipe alvo (reusa o PADRÃO de `TasksService.criar`, 5.1; NUNCA o serviço
 * `RequestContext`-scoped nem sua guarda de usuário). Alvo/Membership DETERMINÍSTICOS (da config). Idempotência
 * da Ação: `idempotencyKey` DETERMINÍSTICA `auto:${executionId}:${actionIndex}` (P2002 → devolve a existente,
 * "no máximo 1 Tarefa" — §"Criação idempotente"). Evento `TASK_CREATED` na MESMA tx (AD-13; encadeável — 4.7).
 */
async function criarTarefa(
  ctx: ExecContext,
  acao: Acao,
  pipeId: string,
  contexto: ContextoEvento,
): Promise<ResultadoExecucao> {
  const title = textoOpcional(acao.parametros.title);
  if (title === null) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: pipeId };
  }
  const description = textoOpcional(acao.parametros.description);
  const responsavel = textoOpcional(acao.parametros.responsavelMembershipId);
  const vincular = acao.parametros.vincularCardDoEvento === true;
  const dueMin = acao.parametros.dueInMinutes;
  const dueAt =
    typeof dueMin === 'number' && Number.isFinite(dueMin) && dueMin > 0
      ? new Date(Date.now() + dueMin * 60_000)
      : null;

  if (responsavel !== null && !(await responsavelValido(ctx.db, responsavel))) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: pipeId };
  }
  const vinculo = await resolverCardParaVinculo(ctx.db, vincular, contexto.cardId, pipeId);
  if (!vinculo.ok) {
    return { state: 'DENIED', errorCode: 'FORA_DO_ESCOPO', targetResourceId: pipeId };
  }

  const idempotencyKey = `auto:${ctx.executionId}:${ctx.actionIndex}`;
  let taskId: string;
  let emittedEventId: string | null = null;
  try {
    taskId = await ctx.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, ctx.contexto)) await p;
      const nova = await tx.task.create({
        data: {
          orgId: ctx.contexto.orgId,
          pipeId,
          cardId: vinculo.cardId,
          title,
          description,
          dueAt,
          dueVersion: 0,
          responsavelMembershipId: responsavel,
          creatorMembershipId: null, // a Automação não é uma Membership (autoria = principal Automação)
          lifecycleState: 'ABERTA',
          archiveState: 'ATIVA',
          idempotencyKey,
        },
        select: { id: true },
      });
      await tx.taskHistory.create({
        data: {
          orgId: ctx.contexto.orgId,
          taskId: nova.id,
          type: 'CREATED',
          summary: 'Tarefa criada pela Automação',
          actorId: null,
        },
      });
      const { eventId } = await emitirEventoDeDominio(tx, ctx.contexto, {
        eventType: EVENTO_GERADO_TASK_CREATE,
        pipeId,
        resourceType: 'TASK',
        resourceId: nova.id,
        actorId: null,
        origin: 'AUTOMATION',
        occurredAt: new Date(),
        correlationId: nova.id,
        causationId: ctx.cadeia.causationEventId,
        executionChainId: ctx.cadeia.executionChainId,
        chainDepth: ctx.cadeia.chainDepth + 1,
      });
      emittedEventId = eventId;
      return nova.id;
    });
  } catch (err) {
    if (conflito(err)) {
      // Retry idempotente: a Tarefa desta Ação já existe (mesma idempotencyKey) — devolve-a, sem 2ª Tarefa.
      const existente = await ctx.db.task.findFirst({
        where: { pipeId, idempotencyKey },
        select: { id: true },
      });
      if (existente)
        return {
          state: 'SUCCEEDED',
          errorCode: null,
          targetResourceId: existente.id,
          emittedEventId: null,
        };
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: pipeId };
    }
    throw err;
  }
  return { state: 'SUCCEEDED', errorCode: null, targetResourceId: taskId, emittedEventId };
}

/**
 * REQUEST_CREATE — cria ≤1 Solicitação no Pipe alvo (reusa o PADRÃO de `SolicitacoesService.criar`, 5.2). Twin
 * de `criarTarefa` SEM prazo. Idempotência DETERMINÍSTICA; Evento `REQUEST_CREATED` na MESMA tx (encadeável).
 */
async function criarSolicitacao(
  ctx: ExecContext,
  acao: Acao,
  pipeId: string,
  contexto: ContextoEvento,
): Promise<ResultadoExecucao> {
  const title = textoOpcional(acao.parametros.title);
  if (title === null) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: pipeId };
  }
  const description = textoOpcional(acao.parametros.description);
  const responsavel = textoOpcional(acao.parametros.responsavelMembershipId);
  const vincular = acao.parametros.vincularCardDoEvento === true;

  if (responsavel !== null && !(await responsavelValido(ctx.db, responsavel))) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: pipeId };
  }
  const vinculo = await resolverCardParaVinculo(ctx.db, vincular, contexto.cardId, pipeId);
  if (!vinculo.ok) {
    return { state: 'DENIED', errorCode: 'FORA_DO_ESCOPO', targetResourceId: pipeId };
  }

  const idempotencyKey = `auto:${ctx.executionId}:${ctx.actionIndex}`;
  let solicitacaoId: string;
  let emittedEventId: string | null = null;
  try {
    solicitacaoId = await ctx.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, ctx.contexto)) await p;
      const nova = await tx.solicitacao.create({
        data: {
          orgId: ctx.contexto.orgId,
          pipeId,
          cardId: vinculo.cardId,
          title,
          description,
          responsavelMembershipId: responsavel,
          creatorMembershipId: null,
          lifecycleState: 'ABERTA',
          archiveState: 'ATIVA',
          idempotencyKey,
        },
        select: { id: true },
      });
      await tx.solicitacaoHistory.create({
        data: {
          orgId: ctx.contexto.orgId,
          solicitacaoId: nova.id,
          type: 'CREATED',
          summary: 'Solicitação criada pela Automação',
          actorId: null,
        },
      });
      const { eventId } = await emitirEventoDeDominio(tx, ctx.contexto, {
        eventType: EVENTO_GERADO_REQUEST_CREATE,
        pipeId,
        resourceType: 'REQUEST',
        resourceId: nova.id,
        actorId: null,
        origin: 'AUTOMATION',
        occurredAt: new Date(),
        correlationId: nova.id,
        causationId: ctx.cadeia.causationEventId,
        executionChainId: ctx.cadeia.executionChainId,
        chainDepth: ctx.cadeia.chainDepth + 1,
      });
      emittedEventId = eventId;
      return nova.id;
    });
  } catch (err) {
    if (conflito(err)) {
      const existente = await ctx.db.solicitacao.findFirst({
        where: { pipeId, idempotencyKey },
        select: { id: true },
      });
      if (existente)
        return {
          state: 'SUCCEEDED',
          errorCode: null,
          targetResourceId: existente.id,
          emittedEventId: null,
        };
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: pipeId };
    }
    throw err;
  }
  return { state: 'SUCCEEDED', errorCode: null, targetResourceId: solicitacaoId, emittedEventId };
}

/**
 * NOTIFICATION_SEND — Enviar Notificação in-app (Story 5.7) reusando **integralmente** a distribuição 5.6
 * (`NotificationDistributionService.distribuir`), sem mecanismo paralelo. O seletor de destinatários vem da
 * ESTRATÉGIA DO TIPO (não da Automação); o conteúdo vem da fonte 5.3 (parametrizado/sanitizado). Garantias de
 * 5.6 (não-ampliação): só Memberships ATIVAS com **acesso atual** recebem; **preferências** respeitadas (sem
 * bypass); **dedup**; ninguém fora da Org (RLS). Sem HTML/script/segredo/payload bruto (o conteúdo não vem da
 * config). Ator = `null` (sistema/automação). Idempotente por `sourceEventId` determinístico (5.6 dedupe).
 *
 * Fail-closed: só tipos do allowlist automático (implementado + estratégia determinística — NUNCA `ALVO_DIRETO`,
 * que exigiria destinatário arbitrário) e cujo `resourceType` casa o recurso PRIMÁRIO do Evento. NÃO gera Evento
 * de domínio (a Notificação não é gatilho). Fecha `DEB-5.6-CARD-MOVED-AUTOMATION-WIRING`.
 */
async function enviarNotificacao(
  ctx: ExecContext,
  acao: Acao,
  resourceId: string,
  contexto: ContextoEvento,
): Promise<ResultadoExecucao> {
  const notificationType = textoOpcional(acao.parametros.notificationType);
  if (notificationType === null) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: resourceId };
  }
  const meta = obterTipoNotificacao(notificationType);
  // Allowlist AUTOMÁTICO: tipo implementado, com estratégia DETERMINÍSTICA a partir do recurso (nunca
  // `ALVO_DIRETO`), e resourceType que casa o recurso primário do Evento. Config-time já validou o formato;
  // aqui é defesa em profundidade fail-closed.
  const estrategiaOk =
    meta !== undefined &&
    meta.implementado &&
    (meta.estrategia === 'PARTES_DO_CARD' || meta.estrategia === 'RESPONSAVEL_TAREFA_ATUAL');
  if (!estrategiaOk) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: resourceId };
  }
  // O recurso primário do Evento deve casar o `resourceType` do tipo (CARD↔cardId, TASK↔taskId, SOLICITACAO↔requestId).
  const casaRecurso =
    (meta.resourceType === 'CARD' && resourceId === contexto.cardId) ||
    (meta.resourceType === 'TASK' && resourceId === contexto.taskId) ||
    (meta.resourceType === 'SOLICITACAO' && resourceId === contexto.requestId);
  if (!casaRecurso) {
    return { state: 'DENIED', errorCode: 'ALVO_INDETERMINADO', targetResourceId: resourceId };
  }

  // `sourceEventId` DETERMINÍSTICO por (Execução, Ação): retry da MESMA Ação não re-notifica (5.6 dedupe).
  const sourceEventId = uuidV5(NS_DOMAIN_EVENT, `notif:${ctx.executionId}:${ctx.actionIndex}`);
  try {
    await ctx.distribuicao.distribuir(
      { orgId: ctx.contexto.orgId, actorId: null },
      { type: notificationType, resourceId, sourceEventId },
    );
  } catch (err) {
    if (conflito(err))
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: resourceId };
    throw err; // erro inesperado ⇒ retry do motor
  }
  // `sem_destinatario` NÃO é falha: é desfecho honesto (ninguém com acesso/preferência). A Ação SUCEDEU.
  return {
    state: 'SUCCEEDED',
    errorCode: null,
    targetResourceId: resourceId,
    emittedEventId: null,
  };
}
