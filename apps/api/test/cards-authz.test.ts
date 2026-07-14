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
 * Autorização da SUBMISSÃO (Story 2.7) — reusa "config do Pipe" (`pipe-authz`), mas exige **operar**, não
 * gerenciar: criar um Card é OPERAÇÃO. É o teste que prova o poder recém-ATIVADO — o Membro do Pipe, que na
 * 2.2-2.6 só lia, agora submete. Admin da Org e Admin do Pipe (gerenciar ⊃ operar) também submetem; VIEWER
 * concedido só lê → **403**; sem concessão → **404** não-enumerante.
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

async function concederABruno(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
}

const url = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

/** Pipe pronto para submissão: 1 Fase ativa + 1 Campo, Formulário inicial PUBLICADO (tudo pela Ana). */
async function pipePronto(nome: string): Promise<string> {
  const pipeId = await criarPipe(nome);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'Triagem' })).status).toBe(201);
  expect(
    (
      await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
        label: 'Nome',
        type: 'TEXT_SHORT',
      })
    ).status,
  ).toBe(201);
  expect((await req('POST', `${url(pipeId)}/publish`, ANA)).status).toBe(201);
  return pipeId;
}

const submeter = (pipeId: string, conta: string, chave: string) =>
  req('POST', `${url(pipeId)}/submit`, conta, { idempotencyKey: chave, valores: {} });

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
}, 30000); // o boot do Nest concorre com a compilação a frio; 10s default é apertado

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('poder de SUBMETER por papel de Pipe (SC-273) — exige OPERAR', () => {
  it('Admin da Org submete qualquer Pipe sem concessão', async () => {
    const pipeId = await pipePronto('2.7 authz — Admin Org');
    expect((await submeter(pipeId, ANA, 'k-admin')).status).toBe(201);
  });

  it('MEMBER concedido SUBMETE (poder OPERAR recém-ativado — antes só lia)', async () => {
    const pipeId = await pipePronto('2.7 authz — MEMBER');
    await concederABruno(pipeId, 'MEMBER');
    expect((await submeter(pipeId, BRUNO, 'k-member')).status).toBe(201);
  });

  it('VIEWER concedido só LÊ — NÃO submete (403)', async () => {
    const pipeId = await pipePronto('2.7 authz — VIEWER');
    await concederABruno(pipeId, 'VIEWER');
    expect((await submeter(pipeId, BRUNO, 'k-viewer')).status).toBe(403);
  });

  it('SEM concessão → 404 (não-enumeração), não 403', async () => {
    const pipeId = await pipePronto('2.7 authz — sem papel');
    expect((await submeter(pipeId, BRUNO, 'k-sem')).status).toBe(404);
  });
});
