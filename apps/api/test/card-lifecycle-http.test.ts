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
 * Ciclo de vida do Card (Story 2.11) pela porta da frente: HTTP real, banco real. Prova as transições
 * (finalizar/reabrir/arquivar/restaurar), a preservação do estado anterior no arquivamento, a idempotência, as
 * transições inválidas (409), a autorização por OPERAR o Card (403/404) e os eventos no `CardHistory`.
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
interface CicloView {
  id: string;
  lifecycleState: string;
  previousLifecycleState: string | null;
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

/** Pipe com Fase + Campo publicado, e um Card submetido. Devolve pipeId e o cardId. */
async function pipeComCard(nome: string): Promise<{ pipeId: string; cardId: string }> {
  const pipeId = await criarPipe(nome);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' })).status).toBe(201);
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
  return { pipeId, cardId: ((await sub.json()) as Ident).id };
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

const acao = (cardId: string, verbo: string, conta = ANA) =>
  req('POST', `/cards/${cardId}/${verbo}`, conta);

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

describe('transições e eventos (AC 2.11)', () => {
  it('Card nasce ATIVO; finalizar → FINALIZADO; evento FINALIZED; detalhe reflete o estado', async () => {
    const { pipeId, cardId } = await pipeComCard('2.11 finalizar');
    const det0 = (await (await req('GET', `/pipes/${pipeId}/cards/${cardId}`, ANA)).json()) as {
      card: { lifecycleState: string };
    };
    expect(det0.card.lifecycleState).toBe('ATIVO');

    const fin = await acao(cardId, 'finalize');
    expect(fin.status).toBe(200);
    const v = (await fin.json()) as CicloView;
    expect(v.lifecycleState).toBe('FINALIZADO');
    expect(JSON.stringify(v)).not.toContain(ORG_A);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'FINALIZED']);

    const det1 = (await (await req('GET', `/pipes/${pipeId}/cards/${cardId}`, ANA)).json()) as {
      card: { lifecycleState: string };
    };
    expect(det1.card.lifecycleState).toBe('FINALIZADO');
  });

  it('finalizar é idempotente: 2ª vez 200 sem novo evento', async () => {
    const { cardId } = await pipeComCard('2.11 finalizar idem');
    expect((await acao(cardId, 'finalize')).status).toBe(200);
    expect((await acao(cardId, 'finalize')).status).toBe(200);
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'FINALIZED']);
  });

  it('reabrir: FINALIZADO → ATIVO (evento REOPENED)', async () => {
    const { cardId } = await pipeComCard('2.11 reabrir');
    await acao(cardId, 'finalize');
    const re = await acao(cardId, 'reopen');
    expect(re.status).toBe(200);
    expect(((await re.json()) as CicloView).lifecycleState).toBe('ATIVO');
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'FINALIZED', 'REOPENED']);
  });
});

describe('arquivar/restaurar preservam o estado anterior (AC 2.11)', () => {
  it('ATIVO → arquivar (previous=ATIVO) → restaurar volta a ATIVO', async () => {
    const { cardId } = await pipeComCard('2.11 arq ativo');
    const arq = await acao(cardId, 'archive');
    expect(arq.status).toBe(200);
    const va = (await arq.json()) as CicloView;
    expect(va.lifecycleState).toBe('ARQUIVADO');
    expect(va.previousLifecycleState).toBe('ATIVO');

    const res = await acao(cardId, 'restore');
    expect(res.status).toBe(200);
    const vr = (await res.json()) as CicloView;
    expect(vr.lifecycleState).toBe('ATIVO');
    expect(vr.previousLifecycleState).toBeNull();
    expect(await tiposDeHistorico(cardId)).toEqual(['CREATED', 'ARCHIVED', 'RESTORED']);
  });

  it('FINALIZADO → arquivar → restaurar volta a FINALIZADO (não a ATIVO)', async () => {
    const { cardId } = await pipeComCard('2.11 arq finalizado');
    await acao(cardId, 'finalize');
    const arq = (await (await acao(cardId, 'archive')).json()) as CicloView;
    expect(arq.previousLifecycleState).toBe('FINALIZADO');
    const res = (await (await acao(cardId, 'restore')).json()) as CicloView;
    expect(res.lifecycleState).toBe('FINALIZADO');
  });

  it('arquivar é idempotente; restaurar não-arquivado → 409', async () => {
    const { cardId } = await pipeComCard('2.11 arq idem');
    expect((await acao(cardId, 'archive')).status).toBe(200);
    expect((await acao(cardId, 'archive')).status).toBe(200); // idempotente
    await acao(cardId, 'restore');
    expect((await acao(cardId, 'restore')).status).toBe(409); // já não está arquivado
  });
});

describe('transições inválidas → 409', () => {
  it('finalizar/reabrir um Card arquivado → 409', async () => {
    const { cardId } = await pipeComCard('2.11 invalidas');
    await acao(cardId, 'archive');
    expect((await acao(cardId, 'finalize')).status).toBe(409);
    expect((await acao(cardId, 'reopen')).status).toBe(409);
  });
});

describe('autorização: transição exige OPERAR o Card', () => {
  it('Observador (só leitura via concessão) → 403; sem acesso nenhum → 404', async () => {
    const { cardId } = await pipeComCard('2.11 authz');
    // Bruno sem papel no Pipe → 404 não-enumerante.
    expect((await acao(cardId, 'finalize', BRUNO)).status).toBe(404);
    // Concede a Bruno acesso de Observador (só leitura) → operar é 403.
    const g = await req('PUT', `/cards/${cardId}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, {
      podeOperar: false,
    });
    expect(g.status).toBe(200);
    expect((await acao(cardId, 'finalize', BRUNO)).status).toBe(403);
  });

  it('Card inexistente → 404; cardId não-UUID → 400', async () => {
    expect((await acao('ffffffff-ffff-ffff-ffff-ffffffffffff', 'finalize')).status).toBe(404);
    expect((await acao('lixo', 'finalize')).status).toBe(400);
  });
});
