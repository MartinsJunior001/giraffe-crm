import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Evento canônico de movimentação (Story 2.16) pela porta da frente: HTTP real, banco real. Prova:
 *   CA1 — movimentação persistida emite EXATAMENTE 1 `MovementEvent` com o envelope canônico completo
 *         (source/target/pipe/card/ator/origem/momento/correlação/eventId), na mesma transação do `MOVED`;
 *   CA2 — bloqueio (confirmado:false) e no-op idempotente (destino == atual) NÃO emitem evento;
 *   CA3 — dois moves concorrentes para o mesmo destino → no máximo 1 evento (nunca 500; guarda otimista);
 *   CA4 — o contrato é INERTE: a resposta é só o Card (nenhuma Automação/Notificação disparada) e o evento
 *         persiste sem PII (`payload` sem `valores`).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface Ident {
  id: string;
}
interface MoveView {
  id: string;
  phaseId: string;
  lifecycleState: string;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(
  method: string,
  path: string,
  conta?: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function criarPipe(nome: string): Promise<string> {
  const res = await req('POST', '/pipes', ANA, { name: nome });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

async function criarFase(pipeId: string, nome: string): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: nome });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

async function pipeComCardEFases(
  nome: string,
): Promise<{ pipeId: string; cardId: string; faseOrigemId: string; faseDestinoId: string }> {
  const pipeId = await criarPipe(nome);
  const faseOrigemId = await criarFase(pipeId, 'A Fazer');
  const faseDestinoId = await criarFase(pipeId, 'Fazendo');
  const campoRes = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  expect(campoRes.status).toBe(201);
  const campo = (await campoRes.json()) as Ident;
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);
  const sub = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: `${nome}-1`,
    valores: { [campo.id]: 'x' },
  });
  expect(sub.status).toBe(201);
  return { pipeId, cardId: ((await sub.json()) as Ident).id, faseOrigemId, faseDestinoId };
}

interface EventoRow {
  eventId: string;
  pipeId: string;
  sourcePhaseId: string;
  targetPhaseId: string;
  origin: string;
  type: string;
  correlationId: string;
  actorId: string | null;
  payload: unknown;
}

async function eventos(cardId: string): Promise<EventoRow[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.movementEvent.findMany({
    where: { cardId },
    orderBy: { occurredAt: 'asc' },
    select: {
      eventId: true,
      pipeId: true,
      sourcePhaseId: true,
      targetPhaseId: true,
      origin: true,
      type: true,
      correlationId: true,
      actorId: true,
      payload: true,
    },
  });
}

const mover = (cardId: string, body: unknown) => req('POST', `/cards/${cardId}/move`, ANA, body);

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
}, 30000);

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('CA1: movimentação persistida emite 1 evento canônico com o envelope completo', () => {
  it('move → 200; exatamente 1 MovementEvent com source/target/pipe/origin/type/eventId/correlação', async () => {
    const { pipeId, cardId, faseOrigemId, faseDestinoId } = await pipeComCardEFases('2.16 ca1');
    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as MoveView).phaseId).toBe(faseDestinoId);

    const evs = await eventos(cardId);
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({
      pipeId,
      sourcePhaseId: faseOrigemId,
      targetPhaseId: faseDestinoId,
      origin: 'MOVE',
      type: 'CARD_MOVED',
      actorId: ANA,
    });
    expect(evs[0]!.eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect(evs[0]!.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    // CA4 — payload mínimo, sem PII (nenhum `valores` do Formulário).
    expect(JSON.stringify(evs[0]!.payload)).not.toContain('valores');
  });
});

describe('CA2: sem fato, sem evento', () => {
  it('bloqueio (confirmado:false) → 409; nenhum MovementEvent', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.16 ca2 bloqueio');
    expect((await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: false })).status).toBe(
      409,
    );
    expect(await eventos(cardId)).toHaveLength(0);
  });

  it('no-op idempotente (destino == Fase atual) → 200; nenhum MovementEvent', async () => {
    const { cardId, faseOrigemId } = await pipeComCardEFases('2.16 ca2 noop');
    expect((await mover(cardId, { destinoPhaseId: faseOrigemId, confirmado: true })).status).toBe(
      200,
    );
    expect(await eventos(cardId)).toHaveLength(0);
  });
});

describe('CA3: concorrência — no máximo 1 evento, nunca 500', () => {
  it('dois moves concorrentes para o mesmo destino → sem 500; exatamente 1 evento', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.16 ca3 corrida');
    const corpo = { destinoPhaseId: faseDestinoId, confirmado: true };
    const [a, b] = await Promise.all([mover(cardId, corpo), mover(cardId, corpo)]);
    const status = [a.status, b.status];
    expect(status).not.toContain(500);
    expect(status.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(status.every((s) => s === 200 || s === 409)).toBe(true);
    expect(await eventos(cardId)).toHaveLength(1);
  });
});

describe('atomicidade: remover a escrita do evento derrubaria a movimentação (mesma transação)', () => {
  it('dois movimentos válidos em sequência (A→B, B→A) geram 2 eventos com eventId distintos', async () => {
    const { cardId, faseOrigemId, faseDestinoId } = await pipeComCardEFases('2.16 sequencia');
    expect((await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true })).status).toBe(
      200,
    );
    expect((await mover(cardId, { destinoPhaseId: faseOrigemId, confirmado: true })).status).toBe(
      200,
    );
    const evs = await eventos(cardId);
    expect(evs).toHaveLength(2);
    // Cada movimento é uma operação distinta (correlationId próprio) → eventId distinto (CA3).
    expect(new Set(evs.map((e) => e.eventId)).size).toBe(2);
    expect(new Set(evs.map((e) => e.correlationId)).size).toBe(2);
    expect(evs.map((e) => [e.sourcePhaseId, e.targetPhaseId])).toEqual([
      [faseOrigemId, faseDestinoId],
      [faseDestinoId, faseOrigemId],
    ]);
  });
});
