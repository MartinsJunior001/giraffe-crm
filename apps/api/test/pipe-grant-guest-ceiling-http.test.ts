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
 * Teto de PipeGrant do CONVIDADO (DEB-PIPEGRANT-GUEST-CEILING) pela porta da frente: HTTP real,
 * `AppModule` de produção, banco real. Prova a decisão de Produto (APROVADA 22/07/2026): um Convidado só
 * recebe SOMENTE_LEITURA (VIEWER) + modificadores restritivos; ADMIN/MEMBER a GUEST → 400; a elevação por
 * ALTERAÇÃO do grant também é barrada; a validação é no write-side, dentro do contexto (RLS) do alvo.
 * Espelha o teto de `DatabaseGrant` (AD-9 / Story 3.2 — ver `database-grants-http.test.ts`).
 *
 * **Regra de ouro (TEST-ISO-01):** todos os atores são contas DESCARTÁVEIS (`randomUUID`) com Membership
 * ACTIVE única na **Org C**. Nenhum fixture de leitura (Ana/Bruno/Carla/Eva) vira Membership persistente.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN só na Org A (fixture de leitura — cross-tenant)

const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

// Atores descartáveis (contas globais + Membership ACTIVE única na Org C).
const adminConta = randomUUID();
const adminMemb = randomUUID();
const guestConta = randomUUID(); // alvo CONVIDADO (teto da Org)
const guestMemb = randomUUID();
const memberConta = randomUUID(); // alvo MEMBER da Org (controle: sem teto reduzido)
const memberMemb = randomUUID();

const pipeId = randomUUID();

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface GrantResp {
  id: string;
  pipeId: string;
  membershipId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  restritoAoProprio: boolean;
  reviewPublicSubmissions: boolean;
  state: 'ACTIVE' | 'REVOKED';
  revokedAt: string | null;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;

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

/** Revoga uma concessão ativa do alvo neste Pipe (faxina entre casos — sem exclusão física). */
async function revogarSePreciso(membershipId: string): Promise<void> {
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipeGrant
    .updateMany({
      where: { pipeId, membershipId, state: 'ACTIVE' },
      data: { state: 'REVOKED', revokedAt: new Date() },
    })
    .catch(() => {});
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');

  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  // Contas GLOBAIS (sem RLS).
  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `pgc-admin-${adminConta}@exemplo.test`, name: 'Admin Org C' },
      { id: guestConta, email: `pgc-guest-${guestConta}@exemplo.test`, name: 'Convidado' },
      { id: memberConta, email: `pgc-member-${memberConta}@exemplo.test`, name: 'Membro' },
    ],
  });
  // Memberships ACTIVE na Org C (cada conta com EXATAMENTE UMA — contexto resolve sem x-org-id) + Pipe.
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: guestMemb, accountId: guestConta, orgId: ORG_C, role: 'GUEST', state: 'ACTIVE' },
      { id: memberMemb, accountId: memberConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe teto do Convidado' } });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
}, 30000);

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia os PipeGrants
    await dbC.membership
      .deleteMany({ where: { id: { in: [adminMemb, guestMemb, memberMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [adminConta, guestConta, memberConta] } } })
      .catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('conceder — teto do CONVIDADO (SOMENTE_LEITURA)', () => {
  it('PROVA 1+2: ADMIN e MEMBER a um CONVIDADO → 400 (não persiste), corpo sanitizado', async () => {
    const admin = await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
      membershipId: guestMemb,
      role: 'ADMIN',
    });
    expect(admin.status).toBe(400);
    const corpo = (await admin.json()) as Record<string, unknown>;
    expect(JSON.stringify(corpo)).not.toContain(ORG_C); // PROVA 11: sem vazar orgId

    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
          membershipId: guestMemb,
          role: 'MEMBER',
        })
      ).status,
    ).toBe(400);

    // Não persistiu nenhuma concessão ativa para o Convidado.
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    const ativas = await dbC.pipeGrant.count({
      where: { pipeId, membershipId: guestMemb, state: 'ACTIVE' },
    });
    expect(ativas).toBe(0);
  });

  it('PROVA 3: VIEWER (SOMENTE_LEITURA) a um CONVIDADO → 201', async () => {
    const res = await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
      membershipId: guestMemb,
      role: 'VIEWER',
    });
    expect(res.status).toBe(201);
    expect(((await res.json()) as GrantResp).role).toBe('VIEWER');
    await revogarSePreciso(guestMemb);
  });

  it('PROVA 4: VISÃO_RESTRITA (VIEWER + restritoAoProprio) a um CONVIDADO → 201', async () => {
    const res = await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
      membershipId: guestMemb,
      role: 'VIEWER',
      restritoAoProprio: true,
    });
    expect(res.status).toBe(201);
    const g = (await res.json()) as GrantResp;
    expect(g.role).toBe('VIEWER');
    expect(g.restritoAoProprio).toBe(true);
    await revogarSePreciso(guestMemb);
  });

  it('capacidade expansiva (reviewPublicSubmissions=true) a um CONVIDADO → 400 (elevação indireta)', async () => {
    const res = await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
      membershipId: guestMemb,
      role: 'VIEWER',
      reviewPublicSubmissions: true,
    });
    expect(res.status).toBe(400);
  });

  it('controle: MEMBER da Org (não-GUEST) recebe ADMIN/MEMBER normalmente → 201 (teto é só do Convidado)', async () => {
    const res = await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
      membershipId: memberMemb,
      role: 'ADMIN',
    });
    expect(res.status).toBe(201);
    await revogarSePreciso(memberMemb);
  });
});

describe('alterar — impede elevação por ALTERAÇÃO do grant (PROVA 6)', () => {
  it('VIEWER de um CONVIDADO não pode virar ADMIN/MEMBER por PATCH → 400; segue VIEWER', async () => {
    const criada = await req('POST', `/pipes/${pipeId}/grants`, adminConta, {
      membershipId: guestMemb,
      role: 'VIEWER',
    });
    expect(criada.status).toBe(201);
    const g = (await criada.json()) as GrantResp;

    expect(
      (await req('PATCH', `/pipes/${pipeId}/grants/${g.id}`, adminConta, { role: 'ADMIN' })).status,
    ).toBe(400);
    expect(
      (await req('PATCH', `/pipes/${pipeId}/grants/${g.id}`, adminConta, { role: 'MEMBER' }))
        .status,
    ).toBe(400);
    // …e ligar a capacidade expansiva por PATCH também é barrado.
    expect(
      (
        await req('PATCH', `/pipes/${pipeId}/grants/${g.id}`, adminConta, {
          role: 'VIEWER',
          reviewPublicSubmissions: true,
        })
      ).status,
    ).toBe(400);

    // Continua VIEWER (nenhuma elevação foi aplicada).
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    const atual = await dbC.pipeGrant.findUnique({ where: { id: g.id }, select: { role: true } });
    expect(atual?.role).toBe('VIEWER');
    await revogarSePreciso(guestMemb);
  });
});

describe('isolamento e autenticação (PROVA 8)', () => {
  it('Admin de OUTRA Org (Ana/Org A) não alcança o Pipe da Org C → 404 (teto não depende de outra Org)', async () => {
    const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
      membershipId: guestMemb,
      role: 'ADMIN',
    });
    expect(res.status).toBe(404);
  });

  it('sem principal → 401 (não 403)', async () => {
    expect(
      (
        await req('POST', `/pipes/${pipeId}/grants`, undefined, {
          membershipId: guestMemb,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(401);
  });
});
