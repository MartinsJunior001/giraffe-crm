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
 * Histórico do Card (Story 2.17) pela porta da frente: HTTP real, banco real. Prova:
 *   CA1 — usuário com acesso ATUAL vê a timeline cronológica projetada (type/summary/data-hora/ator), sem `orgId`
 *         nem payload interno; paginação por cursor determinístico;
 *   CA2 — mudanças posteriores aparecem como NOVOS eventos (append-only): os eventos anteriores não mudam;
 *   CA3 — sem acesso ao Card → 404; concessão de Observador → vê; revogação → 404 de novo (o histórico NÃO concede
 *         acesso, mesmo o revogado tendo virado sujeito de eventos ACCESS_GRANTED/REVOKED).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (sem papel no Pipe)
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
interface EventoView {
  id: string;
  type: string;
  summary: string;
  actorId: string | null;
  occurredAt: string;
}
interface HistoricoView {
  eventos: EventoView[];
  proximoCursor: string | null;
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

/** Pipe com Card submetido (evento CREATED) e 2 Fases; devolve ids úteis. */
async function pipeComCard(
  nome: string,
): Promise<{ pipeId: string; cardId: string; faseDestinoId: string }> {
  const pipeId = await criarPipe(nome);
  await criarFase(pipeId, 'A Fazer');
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
  return { pipeId, cardId: ((await sub.json()) as Ident).id, faseDestinoId };
}

const historico = (cardId: string, conta: string, qs = '') =>
  req('GET', `/cards/${cardId}/history${qs}`, conta);

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

describe('CA1: timeline cronológica projetada + cursor determinístico', () => {
  it('acesso atual vê CREATED→MOVED em ordem, projetado (sem orgId/cardId interno)', async () => {
    const { cardId, faseDestinoId } = await pipeComCard('2.17 ca1');
    expect(
      (
        await req('POST', `/cards/${cardId}/move`, ANA, {
          destinoPhaseId: faseDestinoId,
          confirmado: true,
        })
      ).status,
    ).toBe(200);

    const res = await historico(cardId, ANA);
    expect(res.status).toBe(200);
    const view = (await res.json()) as HistoricoView;
    expect(view.eventos.map((e) => e.type)).toEqual(['CREATED', 'MOVED']);
    // Projeção allowlist: só os campos previstos; nunca orgId/cardId/payload interno.
    for (const ev of view.eventos) {
      expect(Object.keys(ev).sort()).toEqual(['actorId', 'id', 'occurredAt', 'summary', 'type']);
    }
    const bruto = JSON.stringify(view);
    expect(bruto).not.toContain(ORG_A);
    expect(bruto).not.toContain('payload');
    expect(bruto).not.toContain('correlationId'); // nada do MovementEvent (2.16)
  });

  it('paginação por cursor: limite=1 devolve 1 evento + cursor; o cursor traz o próximo', async () => {
    const { cardId, faseDestinoId } = await pipeComCard('2.17 cursor');
    expect(
      (
        await req('POST', `/cards/${cardId}/move`, ANA, {
          destinoPhaseId: faseDestinoId,
          confirmado: true,
        })
      ).status,
    ).toBe(200);

    const p1 = (await (await historico(cardId, ANA, '?limite=1')).json()) as HistoricoView;
    expect(p1.eventos).toHaveLength(1);
    expect(p1.eventos[0]!.type).toBe('CREATED');
    expect(p1.proximoCursor).toBe(p1.eventos[0]!.id);

    const p2 = (await (
      await historico(cardId, ANA, `?limite=1&cursor=${p1.proximoCursor}`)
    ).json()) as HistoricoView;
    expect(p2.eventos).toHaveLength(1);
    expect(p2.eventos[0]!.type).toBe('MOVED');
  });
});

describe('CA2: mudança posterior é NOVO evento (append-only); anteriores não mudam', () => {
  it('finalizar o Card acrescenta FINALIZED sem alterar CREATED', async () => {
    const { cardId } = await pipeComCard('2.17 ca2');
    const antes = (await (await historico(cardId, ANA)).json()) as HistoricoView;
    const criadoAntes = antes.eventos.find((e) => e.type === 'CREATED')!;

    expect((await req('POST', `/cards/${cardId}/finalize`, ANA)).status).toBe(200);

    const depois = (await (await historico(cardId, ANA)).json()) as HistoricoView;
    expect(depois.eventos.map((e) => e.type)).toEqual(['CREATED', 'FINALIZED']);
    const criadoDepois = depois.eventos.find((e) => e.type === 'CREATED')!;
    expect(criadoDepois).toEqual(criadoAntes); // evento original intacto
  });
});

describe('CA3: acesso é o ATUAL; o histórico não concede acesso', () => {
  it('sem acesso ao Card → 404; Observador concedido → vê; revogado → 404 de novo', async () => {
    const { cardId } = await pipeComCard('2.17 ca3');

    // Bruno é MEMBER da Org, mas sem papel no Pipe nem concessão → sem acesso ao Card.
    expect((await historico(cardId, BRUNO)).status).toBe(404);

    // Concede a Bruno acesso de Observador (só leitura) → passa a ver a timeline.
    const g = await req('PUT', `/cards/${cardId}/grants/${MEMBERSHIP_BRUNO_A}`, ANA, {
      podeOperar: false,
      podeMover: false,
    });
    expect(g.status).toBe(200);
    expect((await historico(cardId, BRUNO)).status).toBe(200);

    // Revoga a concessão. Bruno agora é SUJEITO de eventos (ACCESS_GRANTED/REVOKED) no histórico,
    // mas não tem mais acesso ATUAL → 404. O histórico não concede acesso (SC-2105).
    const r = await req('DELETE', `/cards/${cardId}/grants/${MEMBERSHIP_BRUNO_A}`, ANA);
    expect(r.status).toBe(200);
    expect((await historico(cardId, BRUNO)).status).toBe(404);

    // ANA (Admin da Org) segue vendo tudo.
    expect((await historico(cardId, ANA)).status).toBe(200);
  });
});
