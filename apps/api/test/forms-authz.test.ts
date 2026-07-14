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
 * Poder DIFERENCIAL por papel de Pipe sobre Formulários (Story 2.4) — REUSA a resolução ativada na 2.3
 * (`pipe-authz`). Pela porta da frente: HTTP real, banco real.
 *
 * Configurar Formulário (inicial e de Fase) = **Admin da Org** (Ana) OU **Admin do Pipe** (Bruno com
 * concessão `role=ADMIN` ACTIVE). MEMBER/VIEWER concedidos **leem**, não montam (403). Sem concessão → 404.
 * Fase VERMELHA: se o serviço concedesse montagem a MEMBER/VIEWER (ou não reconferisse `Membership.state`),
 * as asserções de 403/negação falhariam.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';

// Conta/Membership DESCARTÁVEIS desta suíte (ids aleatórios) para o cenário de Membership suspensa.
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

async function concederABruno(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<void> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
}

const CAMPO = { label: 'Campo', type: 'TEXT_SHORT' };

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
    data: { id: DIANA, email: `forms-authz-${DIANA}@exemplo.test`, name: 'Diana' },
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

describe('poder diferencial por papel de Pipe sobre Formulários (SC-246 / SC-247)', () => {
  it('Admin da Org monta Campos de qualquer Pipe SEM concessão', async () => {
    const pipeId = await criarPipe('Forms authz — Admin da Org');
    expect((await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, CAMPO)).status).toBe(
      201,
    );
  });

  it('Admin do Pipe (grant ADMIN) monta o Formulário inicial E o de Fase do seu Pipe', async () => {
    const pipeId = await criarPipe('Forms authz — Admin do Pipe');
    const phaseId = await criarFase(pipeId, 'Fase 1');
    await concederABruno(pipeId, 'ADMIN');
    // Formulário inicial.
    const ini = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, BRUNO, CAMPO);
    expect(ini.status).toBe(201);
    const campoIni = ((await ini.json()) as Ident).id;
    // Formulário de Fase (poder resolvido pelo Pipe dono da Fase).
    expect(
      (await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields`, BRUNO, CAMPO)).status,
    ).toBe(201);
    // E reordena o inicial.
    expect(
      (
        await req('POST', `/pipes/${pipeId}/forms/initial/fields/reorder`, BRUNO, {
          fieldId: campoIni,
          afterFieldId: null,
        })
      ).status,
    ).toBe(200);
  });

  it('MEMBER concedido LÊ o Formulário (inicial e de Fase) mas NÃO monta nem reordena (403)', async () => {
    const pipeId = await criarPipe('Forms authz — MEMBER lê');
    const phaseId = await criarFase(pipeId, 'Fase 1');
    // Ana (Admin da Org) monta um Campo no inicial, para haver o que reordenar.
    const campo = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, CAMPO);
    const campoId = ((await campo.json()) as Ident).id;
    await concederABruno(pipeId, 'MEMBER');

    // Lê os dois contextos.
    expect((await req('GET', `/pipes/${pipeId}/forms/initial`, BRUNO)).status).toBe(200);
    expect((await req('GET', `/pipes/${pipeId}/phases/${phaseId}/form`, BRUNO)).status).toBe(200);
    // …mas não monta o inicial, não monta o de Fase, nem reordena — 403 em todos.
    expect((await req('POST', `/pipes/${pipeId}/forms/initial/fields`, BRUNO, CAMPO)).status).toBe(
      403,
    );
    expect(
      (await req('POST', `/pipes/${pipeId}/phases/${phaseId}/form/fields`, BRUNO, CAMPO)).status,
    ).toBe(403);
    expect(
      (
        await req('POST', `/pipes/${pipeId}/forms/initial/fields/reorder`, BRUNO, {
          fieldId: campoId,
          afterFieldId: null,
        })
      ).status,
    ).toBe(403);
  });

  it('VIEWER concedido LÊ o Formulário mas NÃO monta (403)', async () => {
    const pipeId = await criarPipe('Forms authz — VIEWER lê');
    await concederABruno(pipeId, 'VIEWER');
    expect((await req('GET', `/pipes/${pipeId}/forms/initial`, BRUNO)).status).toBe(200);
    expect((await req('POST', `/pipes/${pipeId}/forms/initial/fields`, BRUNO, CAMPO)).status).toBe(
      403,
    );
  });

  it('SEM concessão, o não-Admin não vê nem monta — 404 (não-enumeração)', async () => {
    const pipeId = await criarPipe('Forms authz — Bruno sem papel');
    expect((await req('GET', `/pipes/${pipeId}/forms/initial`, BRUNO)).status).toBe(404);
    expect((await req('POST', `/pipes/${pipeId}/forms/initial/fields`, BRUNO, CAMPO)).status).toBe(
      404,
    );
  });

  it('Membership SUSPENDED com concessão ADMIN é NEGADA (reconferência de Membership.state)', async () => {
    const pipeId = await criarPipe('Forms authz — Diana suspensa');
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, ANA, {
          membershipId: MEMBERSHIP_DIANA,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(201);
    // Enquanto ACTIVE, Diana monta.
    expect((await req('POST', `/pipes/${pipeId}/forms/initial/fields`, DIANA, CAMPO)).status).toBe(
      201,
    );

    // Suspende a Membership da Diana; a concessão continua ACTIVE, mas o papel não deve mais valer.
    const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await dbA.membership.updateMany({
      where: { id: MEMBERSHIP_DIANA },
      data: { state: 'SUSPENDED' },
    });

    const res = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, DIANA, CAMPO);
    expect([403, 404]).toContain(res.status);
    expect(res.status).not.toBe(201);
  });
});
