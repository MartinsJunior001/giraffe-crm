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
 * Concessão de papel por Database (Story 3.2) pela porta da frente: HTTP real, `AppModule` de produção,
 * banco real. Prova a **autoridade hierárquica** (Admin da Org × Admin do Database), o **teto da Org**
 * (GUEST só VIEWER), o corte imediato do acesso na revogação, a unicidade parcial e a não-enumeração.
 *
 * **Regra de ouro:** todos os atores são contas DESCARTÁVEIS (`randomUUID`) com Membership ACTIVE na **Org C**
 * (área de escrita), cada uma com EXATAMENTE UMA Membership ativa (o contexto resolve sem `x-org-id`). Nenhum
 * fixture de leitura (Ana/Bruno/Carla/Eva) é usado como Membership persistente. Faxina pelo migrator.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN só na Org A (fixture de leitura — cross-tenant)

const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

// Atores descartáveis (contas globais + Membership ACTIVE única na Org C).
const adminConta = randomUUID();
const adminMemb = randomUUID();
const dbAdminConta = randomUUID(); // vira "Admin do Database" por concessão ADMIN
const dbAdminMemb = randomUUID();
const alvoConta = randomUUID(); // alvo MEMBER das concessões
const alvoMemb = randomUUID();
const guestConta = randomUUID(); // alvo GUEST (teto da Org)
const guestMemb = randomUUID();

const dbId1 = randomUUID(); // Database concedido
const dbId2 = randomUUID(); // Database NÃO concedido (não-enumeração)

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface GrantResp {
  id: string;
  databaseId: string;
  membershipId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
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
      { id: adminConta, email: `dbg-admin-${adminConta}@exemplo.test`, name: 'Admin Org C' },
      { id: dbAdminConta, email: `dbg-dbadmin-${dbAdminConta}@exemplo.test`, name: 'Admin DB' },
      { id: alvoConta, email: `dbg-alvo-${alvoConta}@exemplo.test`, name: 'Alvo' },
      { id: guestConta, email: `dbg-guest-${guestConta}@exemplo.test`, name: 'Convidado' },
    ],
  });
  // Memberships ACTIVE na Org C (cada conta com EXATAMENTE UMA — contexto resolve sem x-org-id) + 2 Databases.
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: dbAdminMemb, accountId: dbAdminConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: alvoMemb, accountId: alvoConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: guestMemb, accountId: guestConta, orgId: ORG_C, role: 'GUEST', state: 'ACTIVE' },
    ],
  });
  await dbC.database.createMany({
    data: [
      { id: dbId1, orgId: ORG_C, name: 'Base concedida' },
      { id: dbId2, orgId: ORG_C, name: 'Base reservada' },
    ],
  });

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
    // Apagar os Databases cascateia os DatabaseGrants; depois as Memberships; as contas por último.
    await dbC.database.deleteMany({ where: { id: { in: [dbId1, dbId2] } } }).catch(() => {});
    await dbC.membership
      .deleteMany({ where: { id: { in: [adminMemb, dbAdminMemb, alvoMemb, guestMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [adminConta, dbAdminConta, alvoConta, guestConta] } } })
      .catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('CA1: acesso por concessão — sem papel não enxerga, com papel enxerga (não-enumeração)', () => {
  it('alvo sem concessão não vê o Database (obter 404, lista não inclui); orgId não vaza', async () => {
    expect((await req('GET', `/databases/${dbId1}`, alvoConta)).status).toBe(404);
    const lista = (await (await req('GET', '/databases', alvoConta)).json()) as { id: string }[];
    expect(lista.some((d) => d.id === dbId1)).toBe(false);
  });

  it('após conceder MEMBER, o alvo vê SÓ o Database concedido (dbId1), nunca o reservado (dbId2)', async () => {
    const criada = await req('POST', `/databases/${dbId1}/grants`, adminConta, {
      membershipId: alvoMemb,
      role: 'MEMBER',
    });
    expect(criada.status).toBe(201);
    const grant = (await criada.json()) as GrantResp;
    expect(grant.role).toBe('MEMBER');
    expect(JSON.stringify(grant)).not.toContain(ORG_C);

    expect((await req('GET', `/databases/${dbId1}`, alvoConta)).status).toBe(200);
    const lista = (await (await req('GET', '/databases', alvoConta)).json()) as { id: string }[];
    expect(lista.some((d) => d.id === dbId1)).toBe(true);
    expect(lista.some((d) => d.id === dbId2)).toBe(false); // não concedido → não aparece
    expect((await req('GET', `/databases/${dbId2}`, alvoConta)).status).toBe(404);

    // Faxina: revoga para não interferir nos próximos casos de unicidade.
    await req('DELETE', `/databases/${dbId1}/grants/${grant.id}`, adminConta);
  });
});

describe('CA2: autoridade hierárquica — Admin da Org × Admin do Database', () => {
  it('Admin da Org concede ADMIN do Database; o Admin do Database concede MEMBER/VIEWER, mas ADMIN → 403', async () => {
    // Admin da Org concede ADMIN do Database a dbAdmin (só Admin da Org pode conceder ADMIN).
    const virarAdminDb = await req('POST', `/databases/${dbId1}/grants`, adminConta, {
      membershipId: dbAdminMemb,
      role: 'ADMIN',
    });
    expect(virarAdminDb.status).toBe(201);

    // Admin do Database concede MEMBER e VIEWER (a Memberships ativas da Org) → OK.
    const concedeMember = await req('POST', `/databases/${dbId1}/grants`, dbAdminConta, {
      membershipId: alvoMemb,
      role: 'MEMBER',
    });
    expect(concedeMember.status).toBe(201);
    const gMember = (await concedeMember.json()) as GrantResp;

    // Admin do Database tenta conceder ADMIN do Database → 403 (só Admin da Org).
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, dbAdminConta, {
          membershipId: guestMemb,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(403);

    // Admin do Database tenta ALTERAR uma concessão ADMIN (a do próprio dbAdmin) → 403.
    const rosterRes = await req('GET', `/databases/${dbId1}/grants`, adminConta);
    const roster = (await rosterRes.json()) as GrantResp[];
    const grantDoAdminDb = roster.find((g) => g.membershipId === dbAdminMemb && g.role === 'ADMIN');
    expect(grantDoAdminDb).toBeDefined();
    expect(
      (
        await req('PATCH', `/databases/${dbId1}/grants/${grantDoAdminDb!.id}`, dbAdminConta, {
          role: 'MEMBER',
        })
      ).status,
    ).toBe(403);
    // …e tenta REVOGAR a concessão ADMIN → 403 (só Admin da Org toca ADMIN do Database).
    expect(
      (await req('DELETE', `/databases/${dbId1}/grants/${grantDoAdminDb!.id}`, dbAdminConta))
        .status,
    ).toBe(403);

    // Admin do Database PODE revogar um MEMBER/VIEWER que concedeu.
    expect(
      (await req('DELETE', `/databases/${dbId1}/grants/${gMember.id}`, dbAdminConta)).status,
    ).toBe(200);

    // Faxina: Admin da Org revoga a concessão ADMIN do dbAdmin.
    await req('DELETE', `/databases/${dbId1}/grants/${grantDoAdminDb!.id}`, adminConta);
  });

  it('Membro/Somente-leitura do Database (sem ser Admin do DB) → 403 ao conceder; sem acesso → 404', async () => {
    // alvo (MEMBER da Org, sem concessão ativa no dbId1 agora) tenta conceder → 404 (sem acesso ao Database).
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, alvoConta, {
          membershipId: guestMemb,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(404);

    // Concede VIEWER ao alvo; agora ele TEM acesso (lê), mas não gerencia → 403 ao conceder.
    const g = (await (
      await req('POST', `/databases/${dbId1}/grants`, adminConta, {
        membershipId: alvoMemb,
        role: 'VIEWER',
      })
    ).json()) as GrantResp;
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, alvoConta, {
          membershipId: guestMemb,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(403);
    // …e listar o roster (gerenciar) também é 403 para quem só lê.
    expect((await req('GET', `/databases/${dbId1}/grants`, alvoConta)).status).toBe(403);
    await req('DELETE', `/databases/${dbId1}/grants/${g.id}`, adminConta);
  });
});

describe('CA3: teto da Org — Convidado só recebe VIEWER (AD-9)', () => {
  it('GUEST recebe VIEWER (201); ADMIN/MEMBER a GUEST → 400', async () => {
    const viewer = await req('POST', `/databases/${dbId1}/grants`, adminConta, {
      membershipId: guestMemb,
      role: 'VIEWER',
    });
    expect(viewer.status).toBe(201);
    await req(
      'DELETE',
      `/databases/${dbId1}/grants/${((await viewer.json()) as GrantResp).id}`,
      adminConta,
    );

    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, adminConta, {
          membershipId: guestMemb,
          role: 'MEMBER',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, adminConta, {
          membershipId: guestMemb,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(400);
  });
});

describe('CA4: revogar corta o acesso imediatamente; a linha é preservada', () => {
  it('MEMBER concedido lê; após revogar, volta a 404; a concessão fica REVOKED (não apagada)', async () => {
    const g = (await (
      await req('POST', `/databases/${dbId1}/grants`, adminConta, {
        membershipId: alvoMemb,
        role: 'MEMBER',
      })
    ).json()) as GrantResp;
    expect((await req('GET', `/databases/${dbId1}`, alvoConta)).status).toBe(200);

    const rev = await req('DELETE', `/databases/${dbId1}/grants/${g.id}`, adminConta);
    expect(rev.status).toBe(200);
    const revBody = (await rev.json()) as GrantResp;
    expect(revBody.state).toBe('REVOKED');
    expect(revBody.revokedAt).not.toBeNull();

    // Acesso cessou na hora.
    expect((await req('GET', `/databases/${dbId1}`, alvoConta)).status).toBe(404);
    // A concessão revogada NÃO aparece no roster ativo, mas persiste (revogar de novo → 404, sem apagar).
    const roster = (await (
      await req('GET', `/databases/${dbId1}/grants`, adminConta)
    ).json()) as GrantResp[];
    expect(roster.some((x) => x.id === g.id)).toBe(false);
    expect((await req('DELETE', `/databases/${dbId1}/grants/${g.id}`, adminConta)).status).toBe(
      404,
    );
  });
});

describe('CA5: no máximo um papel efetivo; alterar; re-conceder após revogar', () => {
  it('2ª concessão ativa ao mesmo par → 409; PATCH altera; revogar + re-conceder → 201', async () => {
    const primeira = await req('POST', `/databases/${dbId1}/grants`, adminConta, {
      membershipId: alvoMemb,
      role: 'MEMBER',
    });
    expect(primeira.status).toBe(201);
    const g1 = (await primeira.json()) as GrantResp;

    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, adminConta, {
          membershipId: alvoMemb,
          role: 'VIEWER',
        })
      ).status,
    ).toBe(409);

    const alterada = await req('PATCH', `/databases/${dbId1}/grants/${g1.id}`, adminConta, {
      role: 'VIEWER',
    });
    expect(alterada.status).toBe(200);
    expect(((await alterada.json()) as GrantResp).role).toBe('VIEWER');

    await req('DELETE', `/databases/${dbId1}/grants/${g1.id}`, adminConta);
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, adminConta, {
          membershipId: alvoMemb,
          role: 'ADMIN',
        })
      ).status,
    ).toBe(201);
    // Faxina desta concessão ADMIN.
    const roster = (await (
      await req('GET', `/databases/${dbId1}/grants`, adminConta)
    ).json()) as GrantResp[];
    const ativa = roster.find((g) => g.membershipId === alvoMemb);
    if (ativa) await req('DELETE', `/databases/${dbId1}/grants/${ativa.id}`, adminConta);
  });
});

describe('isolamento, autenticação e validação', () => {
  it('sem principal → 401 (não 403)', async () => {
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, undefined, {
          membershipId: alvoMemb,
          role: 'MEMBER',
        })
      ).status,
    ).toBe(401);
  });

  it('Admin de OUTRA Org (Ana/Org A) não alcança um Database da Org C → 404 (não-enumeração)', async () => {
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, ANA, {
          membershipId: alvoMemb,
          role: 'MEMBER',
        })
      ).status,
    ).toBe(404);
    expect((await req('GET', `/databases/${dbId1}/grants`, ANA)).status).toBe(404);
  });

  it('conceder a uma Membership de OUTRA Organização → 400 (alvo inválido, sem vazar)', async () => {
    // Uma Membership da Org A (a de Ana) não é alvo válido no contexto da Org C.
    const membershipAnaOrgA = 'a1a1a1a1-0000-0000-0000-000000000001';
    const res = await req('POST', `/databases/${dbId1}/grants`, adminConta, {
      membershipId: membershipAnaOrgA,
      role: 'VIEWER',
    });
    expect(res.status).toBe(400);
  });

  it('concessão de um Database não é alcançável pela rota de OUTRO Database → 404 (escopo, não-enumeração)', async () => {
    // Concede no dbId1; a concessão é escopada a ele. Tentar tocá-la pela rota do dbId2 (mesma Org) não
    // pode vazar sua existência nem alterá-la: `grant.databaseId !== databaseId` → 404 uniforme.
    const g = (await (
      await req('POST', `/databases/${dbId1}/grants`, adminConta, {
        membershipId: alvoMemb,
        role: 'MEMBER',
      })
    ).json()) as GrantResp;

    expect(
      (await req('PATCH', `/databases/${dbId2}/grants/${g.id}`, adminConta, { role: 'VIEWER' }))
        .status,
    ).toBe(404);
    expect((await req('DELETE', `/databases/${dbId2}/grants/${g.id}`, adminConta)).status).toBe(
      404,
    );

    // Pela rota correta (dbId1) a mesma operação funciona — prova que o 404 acima foi por escopo, não por outra causa.
    expect((await req('DELETE', `/databases/${dbId1}/grants/${g.id}`, adminConta)).status).toBe(
      200,
    );
  });

  it('entrada inválida → 400 sanitizado (role inexistente; membershipId malformado; databaseId malformado)', async () => {
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, adminConta, {
          membershipId: alvoMemb,
          role: 'SUPERADMIN',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('POST', `/databases/${dbId1}/grants`, adminConta, {
          membershipId: 'nao-uuid',
          role: 'MEMBER',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await req('POST', `/databases/nao-uuid/grants`, adminConta, {
          membershipId: alvoMemb,
          role: 'MEMBER',
        })
      ).status,
    ).toBe(400);
  });
});
