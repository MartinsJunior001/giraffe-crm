import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
 * Autorização da EVOLUÇÃO de Campos (Story 2.5) — REUSA a resolução "config do Pipe" da 2.4 (`pipe-authz`).
 * Evoluir Campo/opção (editar/arquivar/opção) exige **gerenciar**: Admin da Org OU Admin do Pipe (grant
 * ADMIN ACTIVE + Membership ACTIVE). MEMBER/VIEWER concedidos LEEM mas NÃO evoluem (403). Sem concessão → 404.
 * Campo de Fase resolve o poder pelo Pipe dono da Fase (`phase.pipeId`).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';

const DIANA = randomUUID();
const MEMBERSHIP_DIANA = randomUUID();

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

async function criarFase(pipeId: string, nome: string): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: nome });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

/** Ana adiciona um Campo ao inicial e devolve o id (para haver o que evoluir). */
async function criarCampoInicial(pipeId: string): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Campo',
    type: 'TEXT_SHORT',
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

async function concederABruno(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
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
  await migrator.account.create({
    data: { id: DIANA, email: `fields-authz-${DIANA}@exemplo.test`, name: 'Diana' },
  });
  const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await dbA.membership.create({
    data: { id: MEMBERSHIP_DIANA, accountId: DIANA, orgId: ORG_A, role: 'MEMBER', state: 'ACTIVE' },
  });
});

afterAll(async () => {
  if (migrator) {
    if (pipesCriados.length > 0) {
      const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
      await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
    }
    await migrator.account.deleteMany({ where: { id: DIANA } }).catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('poder de evolução por papel de Pipe (SC-257 / SC-258)', () => {
  it('Admin da Org evolui Campos de qualquer Pipe sem concessão', async () => {
    const pipeId = await criarPipe('2.5 authz — Admin Org');
    const fieldId = await criarCampoInicial(pipeId);
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${fieldId}`, ANA, {
          label: 'Novo',
        })
      ).status,
    ).toBe(200);
  });

  it('Admin do Pipe (grant ADMIN) evolui o Campo inicial E o de Fase', async () => {
    const pipeId = await criarPipe('2.5 authz — Admin Pipe');
    const phaseId = await criarFase(pipeId, 'Fase 1');
    const fieldIni = await criarCampoInicial(pipeId);
    // Campo de Fase criado por Ana.
    const addFase = await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields`, ANA, {
      label: 'Campo de Fase',
      type: 'TEXT_SHORT',
    });
    const fieldFase = ((await addFase.json()) as Ident).id;

    await concederABruno(pipeId, 'ADMIN');
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${fieldIni}`, BRUNO, {
          label: 'X',
        })
      ).status,
    ).toBe(200);
    // Campo de Fase — poder resolvido pelo Pipe dono da Fase.
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/phases/${phaseId}/form/fields/${fieldFase}`, BRUNO, {
          label: 'Y',
        })
      ).status,
    ).toBe(200);
  });

  it('MEMBER concedido LÊ mas NÃO evolui (403)', async () => {
    const pipeId = await criarPipe('2.5 authz — MEMBER');
    const fieldId = await criarCampoInicial(pipeId);
    await concederABruno(pipeId, 'MEMBER');
    expect((await req('GET', `/pipes/${pipeId}/forms/initial`, BRUNO)).status).toBe(200); // lê
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${fieldId}`, BRUNO, {
          label: 'X',
        })
      ).status,
    ).toBe(403);
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${fieldId}/archive`, BRUNO)).status,
    ).toBe(403);
  });

  it('VIEWER concedido LÊ mas NÃO evolui (403)', async () => {
    const pipeId = await criarPipe('2.5 authz — VIEWER');
    const fieldId = await criarCampoInicial(pipeId);
    await concederABruno(pipeId, 'VIEWER');
    expect(
      (await req('POST', `/pipes/${pipeId}/forms/initial/fields/${fieldId}/archive`, BRUNO)).status,
    ).toBe(403);
  });

  it('SEM concessão → 404 (não-enumeração) ao evoluir', async () => {
    const pipeId = await criarPipe('2.5 authz — sem papel');
    const fieldId = await criarCampoInicial(pipeId);
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${fieldId}`, BRUNO, {
          label: 'X',
        })
      ).status,
    ).toBe(404);
  });

  it('Membership SUSPENDED com concessão ADMIN é NEGADA', async () => {
    const pipeId = await criarPipe('2.5 authz — suspensa');
    const fieldId = await criarCampoInicial(pipeId);
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: MEMBERSHIP_DIANA,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(201);
    // Enquanto ACTIVE, Diana evolui.
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${fieldId}`, DIANA, {
          label: 'A',
        })
      ).status,
    ).toBe(200);

    const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await dbA.membership.updateMany({
      where: { id: MEMBERSHIP_DIANA },
      data: { state: 'SUSPENDED' },
    });

    const res = await req('PATCH', `/pipes/${pipeId}/forms/initial/fields/${fieldId}`, DIANA, {
      label: 'B',
    });
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(200);
  });
});
