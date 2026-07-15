import { describe, expect, it } from 'vitest';
import {
  NS_MOVEMENT_EVENT,
  TIPO_CARD_MOVED,
  VERSAO_ENVELOPE,
  derivarEventId,
  montarEnvelope,
  uuidV5,
} from '../src/pipes/cards/movement/movement-event.core';

/**
 * Núcleo PURO do evento canônico de movimentação (Story 2.16). Sem banco: prova (1) o uuidv5 RFC 4122 determinístico
 * (mesma entrada → mesmo UUID; versão/variante corretas), (2) a derivação do `eventId` por operação (idempotência —
 * mesma correlação → mesmo id; correlação diferente → id diferente) e (3) o envelope mínimo SEM PII.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CARD = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CORR_A = '11111111-1111-1111-1111-111111111111';
const CORR_B = '22222222-2222-2222-2222-222222222222';

describe('uuidV5 — determinístico e RFC 4122', () => {
  it('mesma (namespace, name) → mesmo UUID; nomes diferentes → UUIDs diferentes', () => {
    const a = uuidV5(NS_MOVEMENT_EVENT, 'x');
    const b = uuidV5(NS_MOVEMENT_EVENT, 'x');
    const c = uuidV5(NS_MOVEMENT_EVENT, 'y');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('formato UUID válido, versão 5 e variante RFC 4122', () => {
    const u = uuidV5(NS_MOVEMENT_EVENT, 'algum-nome');
    expect(u).toMatch(UUID_RE);
    expect(u[14]).toBe('5'); // nibble de versão
    expect(['8', '9', 'a', 'b']).toContain(u[19]); // variante
  });

  it('namespace malformado falha fechado', () => {
    expect(() => uuidV5('não-uuid', 'x')).toThrow();
  });
});

describe('derivarEventId — idempotência por operação', () => {
  it('mesma operação (orgId+cardId+correlationId) → mesmo eventId', () => {
    expect(derivarEventId(ORG, CARD, CORR_A)).toBe(derivarEventId(ORG, CARD, CORR_A));
  });

  it('correlação diferente (novo movimento, inclusive A→B→A→B) → eventId diferente', () => {
    expect(derivarEventId(ORG, CARD, CORR_A)).not.toBe(derivarEventId(ORG, CARD, CORR_B));
  });

  it('Card diferente na mesma correlação → eventId diferente', () => {
    const outroCard = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    expect(derivarEventId(ORG, CARD, CORR_A)).not.toBe(derivarEventId(ORG, outroCard, CORR_A));
  });
});

describe('montarEnvelope — contrato canônico mínimo, sem PII', () => {
  const occurredAt = new Date('2026-07-15T12:00:00.000Z');
  const envelope = montarEnvelope({
    orgId: ORG,
    pipeId: 'pipe-1',
    cardId: CARD,
    sourcePhaseId: 'fase-a',
    targetPhaseId: 'fase-b',
    actorId: 'ator-1',
    origin: 'MOVE',
    occurredAt,
    correlationId: CORR_A,
  });

  it('inclui os campos canônicos e o eventId derivado', () => {
    expect(envelope).toMatchObject({
      eventId: derivarEventId(ORG, CARD, CORR_A),
      orgId: ORG,
      pipeId: 'pipe-1',
      cardId: CARD,
      sourcePhaseId: 'fase-a',
      targetPhaseId: 'fase-b',
      actorId: 'ator-1',
      origin: 'MOVE',
      correlationId: CORR_A,
      type: TIPO_CARD_MOVED,
      version: VERSAO_ENVELOPE,
    });
    expect(envelope.occurredAt).toBe(occurredAt);
  });

  it('payload é mínimo (só identificadores/metadados) — nunca valores/PII do Card', () => {
    expect(envelope.payload).toEqual({
      pipeId: 'pipe-1',
      cardId: CARD,
      sourcePhaseId: 'fase-a',
      targetPhaseId: 'fase-b',
      origin: 'MOVE',
      occurredAt: occurredAt.toISOString(),
    });
    // Nenhuma chave de valores de Formulário no envelope.
    expect(JSON.stringify(envelope)).not.toContain('valores');
  });
});
