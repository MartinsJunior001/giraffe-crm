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
 * Movimentação do Card entre Fases (Story 2.14) pela porta da frente: HTTP real, banco real. Prova o caminho feliz
 * (200 + `phaseId` novo + evento `MOVED` + nova `CardPhaseEntry` origin=MOVE, tudo atômico), o bloqueio de preflight
 * (nada muda — CA2), a autorização (Observador → 403; sem acesso → 404), as regras de transição (Fase arquivada /
 * outro Pipe / ciclo não-aberto → 409), o no-op idempotente (D4), a concorrência (uma vence, nunca 500) e a validação
 * de forma (400).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (única Org ativa)
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
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

/** Pipe com DUAS Fases ativas + Campo publicado e um Card submetido (nasce na 1ª Fase, a origem). */
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

async function tiposDeHistorico(cardId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const eventos = await db.cardHistory.findMany({
    where: { cardId },
    orderBy: { createdAt: 'asc' },
    select: { type: true },
  });
  return eventos.map((e) => e.type);
}

async function entradas(cardId: string): Promise<{ origin: string; phaseId: string }[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  return db.cardPhaseEntry.findMany({
    where: { cardId },
    orderBy: { enteredAt: 'asc' },
    select: { origin: true, phaseId: true },
  });
}

const mover = (cardId: string, body: unknown, conta = ANA) =>
  req('POST', `/cards/${cardId}/move`, conta, body);

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

describe('caminho feliz (CA1): mover é atômico — Fase + entrada + evento', () => {
  it('move para outra Fase ativa do mesmo Pipe → 200; phaseId novo; MOVED; nova CardPhaseEntry origin=MOVE', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.14 feliz');
    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(res.status).toBe(200);
    const v = (await res.json()) as MoveView;
    expect(v.phaseId).toBe(faseDestinoId);
    expect(v.lifecycleState).toBe('ATIVO'); // mover não toca o ciclo de vida (Fase ≠ Status do Card)
    expect(JSON.stringify(v)).not.toContain(ORG_A); // orgId fora da fronteira

    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'MOVED']);
    const es = await entradas(cardId);
    expect(es).toHaveLength(2);
    expect(es[0]).toEqual({ origin: 'SUBMISSION', phaseId: expect.any(String) });
    expect(es[1]).toEqual({ origin: 'MOVE', phaseId: faseDestinoId }); // a atual = MOVE p/ destino
  });
});

describe('bloqueio de preflight (CA2): nada é movimentado', () => {
  it('confirmação ausente (confirmado:false) → 409; phaseId inalterado; sem MOVED; sem nova entrada', async () => {
    const { cardId, faseOrigemId, faseDestinoId } = await pipeComCardEFases('2.14 sem confirmar');
    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: false });
    expect(res.status).toBe(409);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED']); // sem MOVED
    const es = await entradas(cardId);
    expect(es).toHaveLength(1);
    expect(es[0]).toEqual({ origin: 'SUBMISSION', phaseId: faseOrigemId }); // segue na origem
  });
});

describe('regras de transição (CA3) → 409', () => {
  it('Fase destino arquivada → 409 (nada muda)', async () => {
    const { pipeId, cardId, faseDestinoId } = await pipeComCardEFases('2.14 destino arq');
    // Arquiva a Fase destino (o Pipe mantém a origem ativa; a destino não tem Cards) e tenta mover para ela.
    expect(
      (await req('POST', `/pipes/${pipeId}/phases/${faseDestinoId}/archive`, ANA)).status,
    ).toBe(200);
    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(res.status).toBe(409);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED']);
  });

  it('Fase de outro Pipe → 409 (nunca entre Pipes)', async () => {
    const { cardId } = await pipeComCardEFases('2.14 outro pipe A');
    const outroPipe = await criarPipe('2.14 outro pipe B');
    const faseOutra = await criarFase(outroPipe, 'Externa');
    const res = await mover(cardId, { destinoPhaseId: faseOutra, confirmado: true });
    expect(res.status).toBe(409);
  });

  it('Card de ciclo não-aberto (FINALIZADO) → 409 (só ciclo ATIVO move)', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.14 ciclo fechado');
    expect((await req('POST', `/cards/${cardId}/finalize`, ANA)).status).toBe(200);
    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true });
    expect(res.status).toBe(409);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'FINALIZED']); // sem MOVED
  });
});

describe('no-op idempotente (D4): mover para a Fase atual', () => {
  it('destino == Fase atual → 200 sem UPDATE/evento/entrada', async () => {
    const { cardId, faseOrigemId } = await pipeComCardEFases('2.14 no-op');
    const res = await mover(cardId, { destinoPhaseId: faseOrigemId, confirmado: true });
    expect(res.status).toBe(200);
    expect(((await res.json()) as MoveView).phaseId).toBe(faseOrigemId);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED']); // sem MOVED
    expect(await entradas(cardId)).toHaveLength(1);
  });
});

describe('autorização: mover exige OPERAR o Card', () => {
  it('Observador (concessão só-leitura) → 403; sem acesso nenhum → 404', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.14 authz');
    const corpo = { destinoPhaseId: faseDestinoId, confirmado: true };
    // Bruno sem papel no Pipe → 404 não-enumerante.
    expect((await mover(cardId, corpo, BRUNO)).status).toBe(404);
    // Concede a Bruno acesso de Observador (só leitura) → mover é 403.
    const g = await req('PUT', `/cards/${cardId}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, {
      podeOperar: false,
      podeMover: false,
    });
    expect(g.status).toBe(200);
    expect((await mover(cardId, corpo, BRUNO)).status).toBe(403);
  });

  it('concessão operacional direta → move (200)', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.14 authz operar');
    const g = await req('PUT', `/cards/${cardId}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, {
      podeOperar: true,
      podeMover: true,
    });
    expect(g.status).toBe(200);
    const res = await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: true }, BRUNO);
    expect(res.status).toBe(200);
    expect(((await res.json()) as MoveView).phaseId).toBe(faseDestinoId);
  });
});

describe('validação de forma → 400', () => {
  it('cardId não-UUID → 400; destinoPhaseId ausente → 400; confirmado não-booleano → 400', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.14 forma');
    expect((await mover('lixo', { destinoPhaseId: faseDestinoId, confirmado: true })).status).toBe(
      400,
    );
    expect((await mover(cardId, { confirmado: true })).status).toBe(400);
    expect((await mover(cardId, { destinoPhaseId: faseDestinoId, confirmado: 'sim' })).status).toBe(
      400,
    );
  });

  it('Card inexistente → 404', async () => {
    const { faseDestinoId } = await pipeComCardEFases('2.14 inexistente');
    const res = await mover('ffffffff-ffff-ffff-ffff-ffffffffffff', {
      destinoPhaseId: faseDestinoId,
      confirmado: true,
    });
    expect(res.status).toBe(404);
  });
});

describe('concorrência: guarda otimista — uma vence, nunca 500', () => {
  it('dois moves concorrentes para o mesmo destino → 1×200; o outro ∈ {200,409}; 1 só MOVED', async () => {
    const { cardId, faseDestinoId } = await pipeComCardEFases('2.14 corrida');
    const corpo = { destinoPhaseId: faseDestinoId, confirmado: true };
    const [a, b] = await Promise.all([mover(cardId, corpo), mover(cardId, corpo)]);
    const status = [a.status, b.status].sort();
    expect(status).not.toContain(500);
    expect(status.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1); // ao menos uma vence
    expect(status.every((s) => s === 200 || s === 409)).toBe(true);
    // Exatamente um evento MOVED — a guarda otimista impede movimentação dupla.
    expect((await tiposDeHistorico(cardId)).filter((t) => t === 'MOVED')).toHaveLength(1);
  });
});
