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
 * Autorização de LEITURA do Kanban (Story 2.9). Diferente da submissão (2.7, em que Viewer é 403): aqui **ler é
 * permitido a qualquer poder** no Pipe (gerenciar/operar/ler), inclusive VIEWER concedido. Sem acesso → 404
 * não-enumerante. As **capacidades** no payload refletem o poder do PRÓPRIO principal (nunca revelam o que ele não
 * possui). Reusa `resolverPoderNoPipe` (pipe-authz); guard/`ability.ts` (C3) intocados.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
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

/** Pipe com 1 Fase (basta para o Kanban). Devolve pipeId. */
async function criarPipeComFase(nome: string): Promise<string> {
  const pipe = (await (await req('POST', '/pipes', ANA, { name: nome })).json()) as Ident;
  pipesCriados.push(pipe.id);
  expect((await req('POST', `/pipes/${pipe.id}/phases`, ANA, { name: 'A Fazer' })).status).toBe(
    201,
  );
  return pipe.id;
}

async function conceder(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
}

interface KanbanResp {
  poder: string;
  capacidades: { ler: boolean; operar: boolean; gerenciar: boolean };
}

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

describe('leitura do Kanban por poder no Pipe (SC-294)', () => {
  it('Admin da Org lê (poder=gerenciar)', async () => {
    const pipeId = await criarPipeComFase('2.9 authz admin');
    const kb = (await (await req('GET', `/pipes/${pipeId}/kanban`, ANA)).json()) as KanbanResp;
    expect(kb.poder).toBe('gerenciar');
    expect(kb.capacidades).toEqual({ ler: true, operar: true, gerenciar: true });
  });

  it('Membro concedido lê (poder=operar)', async () => {
    const pipeId = await criarPipeComFase('2.9 authz membro');
    await conceder(pipeId, 'MEMBER');
    const res = await req('GET', `/pipes/${pipeId}/kanban`, BRUNO);
    expect(res.status).toBe(200);
    const kb = (await res.json()) as KanbanResp;
    expect(kb.poder).toBe('operar');
    expect(kb.capacidades).toEqual({ ler: true, operar: true, gerenciar: false });
  });

  it('VIEWER concedido LÊ (poder=ler) — leitura ≠ operação; sem flags operacionais', async () => {
    const pipeId = await criarPipeComFase('2.9 authz viewer');
    await conceder(pipeId, 'VIEWER');
    const res = await req('GET', `/pipes/${pipeId}/kanban`, BRUNO);
    expect(res.status).toBe(200);
    const kb = (await res.json()) as KanbanResp;
    expect(kb.poder).toBe('ler');
    expect(kb.capacidades).toEqual({ ler: true, operar: false, gerenciar: false });
  });

  it('SEM concessão → 404 não-enumerante (kanban, coluna e detalhe)', async () => {
    const pipeId = await criarPipeComFase('2.9 authz sem acesso');
    expect((await req('GET', `/pipes/${pipeId}/kanban`, BRUNO)).status).toBe(404);
    const faseFake = '00000000-0000-0000-0000-000000000001';
    const cardFake = '00000000-0000-0000-0000-000000000002';
    expect(
      (await req('GET', `/pipes/${pipeId}/kanban/phases/${faseFake}/cards`, BRUNO)).status,
    ).toBe(404);
    expect((await req('GET', `/pipes/${pipeId}/cards/${cardFake}`, BRUNO)).status).toBe(404);
  });
});
