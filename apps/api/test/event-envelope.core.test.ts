import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  derivarEventId,
  minimizarPayload,
  montarEnvelope,
  SCHEMA_VERSION_ENVELOPE,
} from '../src/domain-events/event-envelope';

/**
 * Envelope canônico (Story 4.3) — teste PURO do formato (CA4), do versionamento (a), da minimização (d) e do
 * `eventId` determinístico (f). Sem banco: o formato é um invariante testável sem PostgreSQL.
 */

function dadosBase(over: Partial<Parameters<typeof montarEnvelope>[0]> = {}) {
  return {
    eventType: 'CARD_CREATED',
    orgId: randomUUID(),
    pipeId: randomUUID(),
    resourceType: 'CARD',
    resourceId: randomUUID(),
    actorId: randomUUID(),
    origin: 'SUBMISSION',
    occurredAt: new Date('2026-07-22T12:00:00.000Z'),
    correlationId: randomUUID(),
    ...over,
  };
}

describe('envelope bem-formado e versionado (a, CA4)', () => {
  it('carrega o envelope canônico mínimo com schemaVersion estável', () => {
    const env = montarEnvelope(dadosBase());
    expect(env).toMatchObject({
      eventType: 'CARD_CREATED',
      schemaVersion: SCHEMA_VERSION_ENVELOPE,
      resourceType: 'CARD',
    });
    for (const campo of [
      'eventId',
      'eventType',
      'schemaVersion',
      'organizationId',
      'pipeId',
      'resourceType',
      'resourceId',
      'actorId',
      'origin',
      'occurredAt',
      'correlationId',
      'causationId',
      'executionChainId',
      'payload',
    ]) {
      expect(env).toHaveProperty(campo);
    }
    expect(env.schemaVersion).toBe(1);
  });

  it('tipo sem Pipe (Registro puro) nunca carrega pipeId, mesmo se passado', () => {
    const env = montarEnvelope(
      dadosBase({ eventType: 'RECORD_CREATED', resourceType: 'RECORD', pipeId: randomUUID() }),
    );
    expect(env.pipeId).toBeNull();
  });

  it('rejeita montar envelope de tipo fora do catálogo (fail-closed)', () => {
    expect(() => montarEnvelope(dadosBase({ eventType: 'INEXISTENTE' }))).toThrow(
      /fora do catálogo/,
    );
  });
});

describe('eventId determinístico — idempotência (f)', () => {
  it('mesmo fato → mesmo eventId', () => {
    const d = dadosBase();
    expect(montarEnvelope(d).eventId).toBe(montarEnvelope({ ...d }).eventId);
    expect(derivarEventId(d.eventType, d.orgId, d.resourceId, d.correlationId)).toBe(
      montarEnvelope(d).eventId,
    );
  });

  it('fatos distintos (resourceId ou correlationId) → eventId distinto', () => {
    const d = dadosBase();
    expect(montarEnvelope(d).eventId).not.toBe(
      montarEnvelope({ ...d, resourceId: randomUUID() }).eventId,
    );
    expect(montarEnvelope(d).eventId).not.toBe(
      montarEnvelope({ ...d, correlationId: randomUUID() }).eventId,
    );
  });

  it('o eventId é um UUID v5 válido', () => {
    const env = montarEnvelope(dadosBase());
    expect(env.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

describe('minimização / sanitização (d, AD-30)', () => {
  it('descarta chaves fora da allowlist e valores não-primitivos (PII não vaza)', () => {
    const min = minimizarPayload({
      cardId: 'c1',
      phaseId: 'p1',
      // Fora da allowlist — DESCARTADO:
      valores: { cpf: '000.000.000-00', email: 'a@b.com' },
      nomeCompleto: 'Fulano de Tal',
      // Na allowlist mas objeto aninhado — DESCARTADO (só primitivo seguro):
      origin: { nested: true },
    });
    expect(min).toEqual({ cardId: 'c1', phaseId: 'p1' });
    expect(JSON.stringify(min)).not.toContain('cpf');
    expect(JSON.stringify(min)).not.toContain('Fulano');
  });

  it('o payload do envelope de CARD_CREATED só contém identificadores', () => {
    const env = montarEnvelope(
      dadosBase({
        payload: { pipeId: 'p', cardId: 'c', phaseId: 'ph', valores: { segredo: 'x' } },
      }),
    );
    expect(env.payload).toEqual({ pipeId: 'p', cardId: 'c', phaseId: 'ph' });
    expect(JSON.stringify(env.payload)).not.toContain('segredo');
  });

  it('payload ausente vira objeto vazio', () => {
    expect(montarEnvelope(dadosBase()).payload).toEqual({});
  });
});
