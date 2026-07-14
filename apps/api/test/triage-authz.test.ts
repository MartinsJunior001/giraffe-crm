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
 * Autorização da TRIAGEM (Story 2.8) — capacidade EXPLÍCITA "Revisar submissões públicas", negada por padrão.
 * Admin da Org revisa implicitamente; um Membro só revisa com a concessão que tenha a capacidade; com acesso
 * mas sem a capacidade → 403; sem acesso → 404 não-enumerante.
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
const urlForm = (pipeId: string) => `/pipes/${pipeId}/forms/initial`;

/** Pipe público (TRIAGE) com 1 submissão pública pendente. Devolve pipeId. */
async function pipeComPendente(nome: string): Promise<string> {
  const pipeId = await criarPipe(nome);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'Triagem' })).status).toBe(201);
  const campo = (await (
    await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
      label: 'Nome',
      type: 'TEXT_SHORT',
    })
  ).json()) as Ident;
  expect((await req('POST', `${urlForm(pipeId)}/publish`, ANA)).status).toBe(201);
  const est = (await (
    await req('POST', `${urlForm(pipeId)}/public/enable`, ANA, { mode: 'TRIAGE' })
  ).json()) as {
    publicId: string;
  };
  expect(
    (
      await req('POST', `/public/forms/${est.publicId}/submit`, undefined, {
        valores: { [campo.id]: 'x' },
      })
    ).status,
  ).toBe(201);
  return pipeId;
}

async function concederABruno(pipeId: string, capacidade: boolean): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role: 'MEMBER',
    reviewPublicSubmissions: capacidade,
  });
  expect(res.status).toBe(201);
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

describe('capacidade "Revisar submissões públicas" (SC-287)', () => {
  it('Admin da Org revisa (lista) implicitamente, sem concessão', async () => {
    const pipeId = await pipeComPendente('2.8 authz — Admin Org');
    expect((await req('GET', `/pipes/${pipeId}/public-submissions`, ANA)).status).toBe(200);
  });

  it('Membro COM a capacidade revisa (lista e aprova)', async () => {
    const pipeId = await pipeComPendente('2.8 authz — Membro com capacidade');
    await concederABruno(pipeId, true);
    const lista = await req('GET', `/pipes/${pipeId}/public-submissions`, BRUNO);
    expect(lista.status).toBe(200);
    const pend = (await lista.json()) as Ident[];
    expect(
      (await req('POST', `/pipes/${pipeId}/public-submissions/${pend[0]!.id}/approve`, BRUNO))
        .status,
    ).toBe(201);
  });

  it('Membro SEM a capacidade tem acesso ao Pipe mas NÃO revisa → 403', async () => {
    const pipeId = await pipeComPendente('2.8 authz — Membro sem capacidade');
    await concederABruno(pipeId, false);
    expect((await req('GET', `/pipes/${pipeId}/public-submissions`, BRUNO)).status).toBe(403);
  });

  it('SEM concessão → 404 (não-enumeração), não 403', async () => {
    const pipeId = await pipeComPendente('2.8 authz — sem concessão');
    expect((await req('GET', `/pipes/${pipeId}/public-submissions`, BRUNO)).status).toBe(404);
  });
});
