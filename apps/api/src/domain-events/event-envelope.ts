import { createHash } from 'node:crypto';
import { obterEventoCatalogo } from './event-catalog';

/**
 * Envelope canônico de Evento — Story 4.3 (gate de Arquitetura: "formato/entrega do envelope canônico e
 * versionamento de schema = Arquitetura"). GENERALIZA `movement-event.core.ts` (2.16) para o catálogo
 * completo, preservando o mesmo desenho: puro (sem framework/banco), `eventId` DETERMINÍSTICO por uuidv5 e
 * `payload` minimizado. Derivado do precedente + Architecture Spine (AD-13/AD-30) + D-4 — sem formato novo
 * inventado (ver `_bmad-output/implementation-artifacts/decisions/domain-event-envelope-4-3.md`).
 *
 * **Versionamento (AD-13 "tipo+versão"):** `schemaVersion` versiona o CONTRATO do envelope. É carimbado pelo
 * SERVIDOR e nunca aceito do cliente — como `Automation.configSchemaVersion` (4.1). Um JSON de evento sem
 * versão é um evento que ninguém migra depois.
 *
 * **Idempotência (AD-13 "idempotente"):** `eventId = uuidv5(NS, "${eventType}:${orgId}:${resourceId}:
 * ${correlationId}")`. O mesmo fato lógico produz SEMPRE o mesmo `eventId`; um `@@unique([orgId, eventId])`
 * impede a duplicata. Fatos distintos → `eventId` distinto.
 *
 * **Minimização (AD-30):** o `payload` carrega SÓ identificadores e metadados da transição (allowlist);
 * `valores` de Formulário (possível PII), segredos e chaves NUNCA entram no envelope.
 */

/** Versão do CONTRATO do envelope canônico. Trocar exige migração dos consumidores — por isso é explícita. */
export const SCHEMA_VERSION_ENVELOPE = 1;

/**
 * Namespace UUID (fixo) do envelope canônico de Evento, para o uuidv5. Distinto do namespace de movimentação
 * (2.16) — são catálogos diferentes. Congelado: trocá-lo mudaria TODOS os `eventId` derivados.
 */
export const NS_DOMAIN_EVENT = 'b2f1c7d4-3a9e-5c68-8b21-4d6f7a8c9e0b';

/** Dados mínimos de um fato de domínio persistido que o envelope descreve. */
export interface DadosEvento {
  eventType: string;
  orgId: string;
  /** Pipe do recurso, quando aplicável (Card/vínculo). Registro puro não tem Pipe (Story §1339). */
  pipeId: string | null;
  /** Recurso principal do Evento (Card/Registro/vínculo), por ID estável tenant-safe. */
  resourceType: string;
  resourceId: string;
  actorId: string | null;
  /** Origem do fato (ex.: `SUBMISSION`, `PUBLIC`, `MOVE`, `AUTOMATION`). Vocabulário estável. */
  origin: string;
  occurredAt: Date;
  /** Correlação da operação (server-side). Para criações 1:1 com o recurso, use o `resourceId`. */
  correlationId: string;
  /** Evento causador (encadeamento por Automação — 4.7). Ausente na Fase 1 fora do motor. */
  causationId?: string | null;
  /** Cadeia de execução quando originado por Automação (4.7). Ausente fora do motor. */
  executionChainId?: string | null;
  /** Estado antes/depois MINIMIZADO (só IDs/metadados). Ver `minimizarPayload`. */
  payload?: Record<string, unknown>;
}

/** O envelope canônico, pronto para virar uma linha `DomainEvent` (append-only). */
export interface EnvelopeEvento {
  eventId: string;
  eventType: string;
  schemaVersion: number;
  organizationId: string;
  pipeId: string | null;
  resourceType: string;
  resourceId: string;
  actorId: string | null;
  origin: string;
  occurredAt: Date;
  correlationId: string;
  causationId: string | null;
  executionChainId: string | null;
  payload: Record<string, unknown>;
}

/**
 * Chaves de topo PERMITIDAS no `payload` (allowlist AD-30). Só identificadores e metadados da transição — o
 * envelope NÃO carrega `valores`, corpo, conteúdo nem segredo. Uma chave fora desta lista é DESCARTADA (não
 * lançada): o envelope minimizado é sempre seguro, mesmo se um produtor futuro passar dado a mais por engano.
 */
const CHAVES_PAYLOAD_PERMITIDAS: ReadonlySet<string> = new Set([
  'pipeId',
  'cardId',
  'recordId',
  'phaseId',
  'sourcePhaseId',
  'targetPhaseId',
  'fieldId',
  'formVersionId',
  'linkId',
  'fromState',
  'toState',
  'fromHealth',
  'toHealth',
  'origin',
  'occurredAt',
]);

/** Um valor é primitivo simples e seguro para o envelope? (string/number/boolean/null). */
function ehPrimitivoSeguro(v: unknown): boolean {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

/**
 * Reduz um payload arbitrário ao mínimo canônico: mantém só as chaves da allowlist cujo valor é primitivo
 * seguro. Objetos/arrays aninhados e chaves desconhecidas são DESCARTADOS — é a defesa em profundidade que
 * impede PII de vazar no envelope mesmo sob erro do produtor (AD-30). Fail-closed por construção.
 */
export function minimizarPayload(
  bruto: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!bruto) return {};
  const saida: Record<string, unknown> = {};
  for (const chave of Object.keys(bruto)) {
    if (CHAVES_PAYLOAD_PERMITIDAS.has(chave) && ehPrimitivoSeguro(bruto[chave])) {
      saida[chave] = bruto[chave];
    }
  }
  return saida;
}

/**
 * Deriva um UUID v5 (RFC 4122) a partir de um namespace UUID e um nome. Determinístico. Implementado com SHA-1
 * do `node:crypto` — sem dependência nova, mesmo primitivo da 2.16. Não é para uso criptográfico; serve como
 * identidade estável derivada (idempotência).
 */
export function uuidV5(namespace: string, name: string): string {
  const nsBytes = uuidParaBytes(namespace);
  const nameBytes = Buffer.from(name, 'utf8');
  const hash = createHash('sha1')
    .update(Buffer.concat([nsBytes, nameBytes]))
    .digest();
  const bytes = hash.subarray(0, 16);
  // Versão 5 (nibble alto do byte 6) e variante RFC 4122 (dois bits altos do byte 8).
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** Converte um UUID textual em 16 bytes. Lança se malformado (fail-closed). */
function uuidParaBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error('UUID de namespace inválido');
  return Buffer.from(hex, 'hex');
}

/** `eventId` determinístico do fato: uuidv5(NS, eventType:orgId:resourceId:correlationId). */
export function derivarEventId(
  eventType: string,
  orgId: string,
  resourceId: string,
  correlationId: string,
): string {
  return uuidV5(NS_DOMAIN_EVENT, `${eventType}:${orgId}:${resourceId}:${correlationId}`);
}

/**
 * Monta o envelope canônico de um fato de domínio persistido. Valida que `eventType` está no catálogo
 * (fail-closed — um envelope de tipo desconhecido nunca deveria existir) e minimiza o `payload`. O `pipeId` é
 * coerente com o catálogo: tipos sem Pipe (Registro puro) nunca carregam `pipeId`.
 */
export function montarEnvelope(dados: DadosEvento): EnvelopeEvento {
  const meta = obterEventoCatalogo(dados.eventType);
  if (!meta) throw new Error(`eventType fora do catálogo: envelope não pode ser montado`);

  const eventId = derivarEventId(
    dados.eventType,
    dados.orgId,
    dados.resourceId,
    dados.correlationId,
  );
  return {
    eventId,
    eventType: dados.eventType,
    schemaVersion: SCHEMA_VERSION_ENVELOPE,
    organizationId: dados.orgId,
    // Coerência com o catálogo: tipo sem Pipe nunca carrega `pipeId`, mesmo se o produtor passar um.
    pipeId: meta.temPipe ? dados.pipeId : null,
    resourceType: dados.resourceType,
    resourceId: dados.resourceId,
    actorId: dados.actorId,
    origin: dados.origin,
    occurredAt: dados.occurredAt,
    correlationId: dados.correlationId,
    causationId: dados.causationId ?? null,
    executionChainId: dados.executionChainId ?? null,
    payload: minimizarPayload(dados.payload),
  };
}
