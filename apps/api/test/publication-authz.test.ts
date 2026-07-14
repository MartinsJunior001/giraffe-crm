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
 * Autorização da PUBLICAÇÃO (Story 2.6) — reusa "config do Pipe" (`pipe-authz`). Publicar/despublicar exige
 * **gerenciar** (Admin da Org OU Admin do Pipe). MEMBER/VIEWER concedidos LEEM o estado mas NÃO publicam (403).
 * Sem concessão → 404 não-enumerante.
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

async function criarPipe(nome: string): Promise<string> {
  const res = await req('POST', '/pipes', ANA, { name: nome });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

/** Ana adiciona um Campo publicável ao inicial (para haver o que publicar). */
async function prepararPublicavel(pipeId: string): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Campo',
    type: 'TEXT_SHORT',
  });
  expect(res.status).toBe(201);
}

async function concederABruno(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
}

const url = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

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
});

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('poder de publicar por papel de Pipe (SC-265)', () => {
  it('Admin da Org publica qualquer Pipe sem concessão', async () => {
    const pipeId = await criarPipe('2.6 authz — Admin Org');
    await prepararPublicavel(pipeId);
    expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);
  });

  it('MEMBER concedido LÊ o estado mas NÃO publica nem despublica (403)', async () => {
    const pipeId = await criarPipe('2.6 authz — MEMBER');
    await prepararPublicavel(pipeId);
    await concederABruno(pipeId, 'MEMBER');
    expect((await req('GET', `${url(pipeId)}/publication`, BRUNO)).status).toBe(200); // lê
    expect((await req('POST', `${url(pipeId)}/publish`, BRUNO)).status).toBe(403);
    expect((await req('POST', `${url(pipeId)}/unpublish`, BRUNO)).status).toBe(403);
  });

  it('VIEWER concedido LÊ mas NÃO publica (403)', async () => {
    const pipeId = await criarPipe('2.6 authz — VIEWER');
    await prepararPublicavel(pipeId);
    await concederABruno(pipeId, 'VIEWER');
    expect((await req('POST', `${url(pipeId)}/publish`, BRUNO)).status).toBe(403);
  });

  it('SEM concessão → 404 (não-enumeração) ao publicar E ao ler o estado', async () => {
    const pipeId = await criarPipe('2.6 authz — sem papel');
    await prepararPublicavel(pipeId);
    expect((await req('POST', `${url(pipeId)}/publish`, BRUNO)).status).toBe(404);
    // Leitura sem acesso ao Pipe também é 404 não-enumerante (não revela existência).
    expect((await req('GET', `${url(pipeId)}/publication`, BRUNO)).status).toBe(404);
  });
});
