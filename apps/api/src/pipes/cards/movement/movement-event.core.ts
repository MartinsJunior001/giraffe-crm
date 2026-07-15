import { createHash } from 'node:crypto';

/**
 * Núcleo PURO do EVENTO CANÔNICO de movimentação (Story 2.16). Sem framework, sem banco: monta o envelope canônico
 * e deriva o `eventId` DETERMINÍSTICO. Ser puro é o que permite provar a idempotência (mesma operação → mesmo
 * `eventId`) em unidade, e mantém o serviço de movimentação livre de lógica de formato.
 *
 * **Idempotência (CA3):** `eventId = uuidv5(NS_MOVEMENT, orgId + cardId + correlationId)`. A mesma operação de
 * movimentação (mesmo `correlationId`, gerado server-side por operação) SEMPRE produz o mesmo `eventId`; um
 * reprocessamento técnico reproduz o identificador, e o `@@unique([orgId, eventId])` impede duplicata lógica.
 * Movimentos distintos (inclusive A→B→A→B) têm `correlationId` distinto → `eventId` distinto.
 */

/** Tipo do envelope canônico. Hoje há um único tipo; o `version` versiona o contrato (AD-13). */
export const TIPO_CARD_MOVED = 'CARD_MOVED';
export const VERSAO_ENVELOPE = 1;

/**
 * Namespace UUID (fixo) do evento canônico de movimentação, para o uuidv5. Um UUID aleatório gerado uma única vez e
 * congelado aqui — trocá-lo mudaria TODOS os `eventId` derivados, então é imutável por contrato.
 */
export const NS_MOVEMENT_EVENT = '6f9b1a2c-8d3e-5f47-9a1b-2c3d4e5f6a7b';

/** Dados mínimos de uma movimentação persistida que o envelope canônico descreve. */
export interface DadosMovimentacao {
  orgId: string;
  pipeId: string;
  cardId: string;
  sourcePhaseId: string;
  targetPhaseId: string;
  actorId: string | null;
  /** Origem da movimentação (espelha `CardPhaseEntryOrigin`; hoje `MOVE`). */
  origin: string;
  /** Instante efetivo da movimentação. */
  occurredAt: Date;
  /** Chave de correlação da operação (gerada server-side; linka evento ↔ MOVED ↔ CardPhaseEntry). */
  correlationId: string;
}

/** O envelope canônico, pronto para virar uma linha `MovementEvent` (append-only). */
export interface EnvelopeCanonico {
  eventId: string;
  orgId: string;
  pipeId: string;
  cardId: string;
  sourcePhaseId: string;
  targetPhaseId: string;
  actorId: string | null;
  origin: string;
  occurredAt: Date;
  correlationId: string;
  type: string;
  version: number;
  /** Payload mínimo versionado, sem PII desnecessária (só identificadores + metadados da transição). */
  payload: Record<string, unknown>;
}

/**
 * Deriva um UUID v5 (RFC 4122) a partir de um namespace UUID e um nome. Determinístico: mesmo (namespace, name) →
 * mesmo UUID. Implementado com SHA-1 do `node:crypto` — sem dependência nova. Não é para uso criptográfico; serve
 * apenas como identidade estável derivada (idempotência).
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

/** `eventId` determinístico da operação: uuidv5(NS, orgId + cardId + correlationId). */
export function derivarEventId(orgId: string, cardId: string, correlationId: string): string {
  return uuidV5(NS_MOVEMENT_EVENT, `${orgId}:${cardId}:${correlationId}`);
}

/**
 * Monta o envelope canônico de uma movimentação persistida. O `payload` é mínimo e versionado: só identificadores
 * e metadados da transição (Fase origem/destino, ator, origem, momento, correlação) — NENHUMA PII do Card
 * (`valores` do Formulário nunca entram no evento de integração).
 */
export function montarEnvelope(dados: DadosMovimentacao): EnvelopeCanonico {
  const eventId = derivarEventId(dados.orgId, dados.cardId, dados.correlationId);
  return {
    eventId,
    orgId: dados.orgId,
    pipeId: dados.pipeId,
    cardId: dados.cardId,
    sourcePhaseId: dados.sourcePhaseId,
    targetPhaseId: dados.targetPhaseId,
    actorId: dados.actorId,
    origin: dados.origin,
    occurredAt: dados.occurredAt,
    correlationId: dados.correlationId,
    type: TIPO_CARD_MOVED,
    version: VERSAO_ENVELOPE,
    payload: {
      pipeId: dados.pipeId,
      cardId: dados.cardId,
      sourcePhaseId: dados.sourcePhaseId,
      targetPhaseId: dados.targetPhaseId,
      origin: dados.origin,
      occurredAt: dados.occurredAt.toISOString(),
    },
  };
}
