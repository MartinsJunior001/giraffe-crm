import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AUTH } from '../src/kernel/auth/auth.tokens';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import { PrismaClient } from '../generated/prisma';

/**
 * Roster de membros e Convites (Story 8.7) pela porta da frente: `AppModule` REAL, HTTP real, PostgreSQL
 * real, Better Auth real. Read-side puro — sem step-up, sem migration.
 *
 * Cada cenário usa Organizações DESCARTÁVEIS (`randomUUID`) e contas descartáveis (`ros87-…`) com
 * EXATAMENTE UMA Membership ativa (o contexto resolve sem `x-org-id`). Fixtures do seed (Ana/Bruno/…)
 * NUNCA são reusadas em `membership.create` persistente (TEST-ISO-01). Faxina pelo migrator.
 *
 * Provas: (a) roster escopado a UMA Org (cross-tenant não vaza); (b) autz Admin-only (Convites) e
 * Convidado sem acesso (membros); (c) projeção sem token/segredo; (d) paginação/ordem determinística.
 */

const SENHA = 'giraffe-teste-oito-sete';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let hashSenha: (senha: string) => Promise<string>;

const orgsCriadas: string[] = [];

async function criarOrg(): Promise<string> {
  const orgId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).organization.create({
    data: { id: orgId, name: `Org 8.7 ${orgId.slice(0, 8)}`, slug: `org87-${orgId}` },
  });
  orgsCriadas.push(orgId);
  return orgId;
}

async function criarConta(nome = 'Conta 8.7'): Promise<{ id: string; email: string }> {
  const email = `ros87-${randomUUID()}@exemplo.test`;
  const conta = await migrator.account.create({
    data: { email, name: nome, emailVerified: true },
    select: { id: true },
  });
  await migrator.authCredential.create({
    data: {
      id: randomUUID(),
      accountId: conta.id,
      providerId: 'credential',
      userId: conta.id,
      password: await hashSenha(SENHA),
    },
  });
  return { id: conta.id, email };
}

interface Membro {
  accountId: string;
  email: string;
  name: string;
  membershipId: string;
}

async function vincular(
  orgId: string,
  role: 'ADMIN' | 'MEMBER' | 'GUEST',
  state: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' = 'ACTIVE',
  nome = 'Conta 8.7',
): Promise<Membro> {
  const conta = await criarConta(nome);
  const membershipId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).membership.create({
    data: { id: membershipId, accountId: conta.id, orgId, role, state },
  });
  return { accountId: conta.id, email: conta.email, name: nome, membershipId };
}

async function criarConvite(
  orgId: string,
  invitedByAccountId: string,
  opts: {
    email: string;
    role?: 'ADMIN' | 'MEMBER' | 'GUEST';
    state?: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
    expiresAt?: Date;
  },
): Promise<void> {
  const tokenHash = (randomUUID() + randomUUID()).replace(/-/g, '');
  await withTenantContext(migrator, { orgId }, semLog).invite.create({
    data: {
      orgId,
      normalizedEmail: opts.email.toLowerCase(),
      email: opts.email,
      role: opts.role ?? 'MEMBER',
      state: opts.state ?? 'PENDING',
      tokenHash,
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
      lastSentAt: new Date(),
      invitedByAccountId,
    },
  });
}

function cookieDe(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  });
  if (res.status !== 200) throw new Error(`login falhou (${res.status})`);
  return cookieDe(res);
}

function getMembros(cookie: string, qs = ''): Promise<Response> {
  return fetch(`${baseUrl}/organizations/members${qs}`, { headers: { cookie } });
}

function getConvites(cookie: string, qs = ''): Promise<Response> {
  return fetch(`${baseUrl}/organizations/invites${qs}`, { headers: { cookie } });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  migrator = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  await migrator.$connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  await app.listen(0);
  baseUrl = await app.getUrl();

  const auth = app.get(AUTH);
  hashSenha = async (senha: string) => (await auth.$context).password.hash(senha);
}, 30000);

beforeEach(async () => {
  await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE '%/sign-in/email'`.catch(
    () => {},
  );
});

afterAll(async () => {
  if (migrator) {
    for (const orgId of orgsCriadas) {
      await migrator.$executeRaw`DELETE FROM "InviteRoute" WHERE "orgId" = ${orgId}::uuid`.catch(
        () => {},
      );
      await withTenantContext(migrator, { orgId }, semLog)
        .invite.deleteMany({ where: { orgId } })
        .catch(() => {});
      await withTenantContext(migrator, { orgId }, semLog)
        .membership.deleteMany({ where: { orgId } })
        .catch(() => {});
      await migrator.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
    }
    await migrator.account
      .deleteMany({ where: { email: { startsWith: 'ros87-' } } })
      .catch(() => {});
    await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE '%/sign-in/email'`.catch(
      () => {},
    );
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('(b) autorização', () => {
  it('membros: sem sessão → 401', async () => {
    expect((await getMembros('')).status).toBe(401);
  });

  it('membros: Convidado (GUEST) → 403 (não acessa o roster)', async () => {
    const orgId = await criarOrg();
    await vincular(orgId, 'ADMIN');
    const guest = await vincular(orgId, 'GUEST');
    const cookie = await login(guest.email);
    expect((await getMembros(cookie)).status).toBe(403);
  });

  it('convites: Membro comum → 403 (guard administrar Organizacao)', async () => {
    const orgId = await criarOrg();
    await vincular(orgId, 'ADMIN');
    const membro = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email);
    expect((await getConvites(cookie)).status).toBe(403);
  });

  it('convites: sem sessão → 401', async () => {
    expect((await getConvites('')).status).toBe(401);
  });
});

describe('(b) visão REDUZIDA do Membro comum', () => {
  it('Membro vê só ATIVAS, com nome/papel — SEM e-mail, SEM capacidades, SEM suspensas', async () => {
    const orgId = await criarOrg();
    await vincular(orgId, 'ADMIN', 'ACTIVE', 'Admin Um');
    const membro = await vincular(orgId, 'MEMBER', 'ACTIVE', 'Membro Dois');
    await vincular(orgId, 'MEMBER', 'SUSPENDED', 'Suspenso Tres');

    const cookie = await login(membro.email);
    const res = await getMembros(cookie);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      visao: string;
      membros: Record<string, unknown>[];
      total: number;
    };
    expect(corpo.visao).toBe('membro');
    // Só as 2 ATIVAS (admin + membro), nunca a suspensa.
    expect(corpo.total).toBe(2);
    expect(corpo.membros).toHaveLength(2);
    for (const m of corpo.membros) {
      expect(m).toHaveProperty('membershipId');
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('role');
      expect(m).not.toHaveProperty('email'); // e-mail é "só Admin"
      expect(m).not.toHaveProperty('capacidades');
      expect(m).not.toHaveProperty('state');
    }
  });
});

describe('(c) visão do Admin + projeção sem segredo', () => {
  it('Admin vê todos os estados, com e-mail e capacidades; o ÚLTIMO Admin sem ações destrutivas', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN', 'ACTIVE', 'Admin Unico');
    await vincular(orgId, 'MEMBER', 'ACTIVE', 'Membro Ativo');
    await vincular(orgId, 'MEMBER', 'SUSPENDED', 'Membro Suspenso');
    await vincular(orgId, 'GUEST', 'REMOVED', 'Convidado Removido');

    const cookie = await login(admin.email);
    const res = await getMembros(cookie);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      visao: string;
      total: number;
      membros: {
        membershipId: string;
        email: string;
        role: string;
        state: string;
        capacidades: Record<string, boolean>;
      }[];
    };
    expect(corpo.visao).toBe('admin');
    expect(corpo.total).toBe(4); // ATIVAS + SUSPENSA + REMOVIDA

    const linhaAdmin = corpo.membros.find((m) => m.membershipId === admin.membershipId)!;
    expect(linhaAdmin.email).toBe(admin.email); // finalidade legítima do roster (LGPD)
    // Proteção do último Admin (AC-2): o único Admin não recebe ação destrutiva executável.
    expect(linhaAdmin.capacidades).toMatchObject({
      podeAlterarPapel: false,
      podeSuspender: false,
      podeRemover: false,
    });

    const suspenso = corpo.membros.find((m) => m.state === 'SUSPENDED')!;
    expect(suspenso.capacidades.podeReativar).toBe(true);
  });

  it('roster de Convites NUNCA expõe token/hash; traz email/role/state/expirado', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    await criarConvite(orgId, admin.accountId, { email: 'pendente@ex.test', role: 'MEMBER' });
    await criarConvite(orgId, admin.accountId, {
      email: 'vencido@ex.test',
      state: 'PENDING',
      expiresAt: new Date(Date.now() - 3600 * 1000), // já vencido
    });
    await criarConvite(orgId, admin.accountId, { email: 'cancelado@ex.test', state: 'CANCELLED' });

    const cookie = await login(admin.email);
    const res = await getConvites(cookie);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      total: number;
      convites: Record<string, unknown>[];
    };
    expect(corpo.total).toBe(3);
    for (const c of corpo.convites) {
      expect(c).toHaveProperty('email');
      expect(c).toHaveProperty('role');
      expect(c).toHaveProperty('state');
      expect(c).toHaveProperty('expirado');
      // Nenhum vazamento de segredo, em nenhuma chave.
      expect(c).not.toHaveProperty('tokenHash');
      expect(c).not.toHaveProperty('token');
      expect(c).not.toHaveProperty('normalizedEmail');
      expect(c).not.toHaveProperty('orgId');
      expect(JSON.stringify(c)).not.toMatch(/token/i);
    }
    const vencido = corpo.convites.find((c) => c.email === 'vencido@ex.test')!;
    expect(vencido.expirado).toBe(true);
    const pendente = corpo.convites.find((c) => c.email === 'pendente@ex.test')!;
    expect(pendente.expirado).toBe(false);
  });
});

describe('(a) isolamento cross-tenant', () => {
  it('Admin da Org A não vê membros nem Convites da Org B', async () => {
    const orgA = await criarOrg();
    const adminA = await vincular(orgA, 'ADMIN', 'ACTIVE', 'Admin A');
    await vincular(orgA, 'MEMBER', 'ACTIVE', 'Membro A');
    await criarConvite(orgA, adminA.accountId, { email: 'conviteA@ex.test' });

    const orgB = await criarOrg();
    const adminB = await vincular(orgB, 'ADMIN', 'ACTIVE', 'Admin B');
    const membroB = await vincular(orgB, 'MEMBER', 'ACTIVE', 'Membro B');
    await criarConvite(orgB, adminB.accountId, { email: 'conviteB@ex.test' });

    const cookie = await login(adminA.email);

    const membros = (await (await getMembros(cookie)).json()) as {
      total: number;
      membros: { membershipId: string; email: string }[];
    };
    expect(membros.total).toBe(2); // só os 2 da Org A
    const ids = membros.membros.map((m) => m.membershipId);
    expect(ids).not.toContain(membroB.membershipId);
    expect(membros.membros.map((m) => m.email)).not.toContain(membroB.email);

    const convites = (await (await getConvites(cookie)).json()) as {
      total: number;
      convites: { email: string }[];
    };
    expect(convites.total).toBe(1);
    expect(convites.convites.map((c) => c.email)).toEqual(['conviteA@ex.test']);
  });

  it('busca por e-mail (só Admin) não vaza conta de outra Org que casa o termo', async () => {
    // Duas contas com e-mail que casa "alvo", em Orgs diferentes; o Admin de A só enxerga a de A.
    const orgA = await criarOrg();
    const adminA = await vincular(orgA, 'ADMIN');
    const alvoA = await criarConta('Alvo A');
    await withTenantContext(migrator, { orgId: orgA }, semLog).membership.create({
      data: { id: randomUUID(), accountId: alvoA.id, orgId: orgA, role: 'MEMBER', state: 'ACTIVE' },
    });

    const orgB = await criarOrg();
    const alvoB = await criarConta('Alvo B');
    await withTenantContext(migrator, { orgId: orgB }, semLog).membership.create({
      data: { id: randomUUID(), accountId: alvoB.id, orgId: orgB, role: 'MEMBER', state: 'ACTIVE' },
    });

    const cookie = await login(adminA.email);
    // Busca pelo prefixo comum "ros87-" (ambos os e-mails casam) — só a conta com Membership em A aparece.
    const res = (await (await getMembros(cookie, '?busca=ros87-')).json()) as {
      membros: { accountId: string }[];
    };
    const contas = res.membros.map((m) => m.accountId);
    expect(contas).toContain(alvoA.id);
    expect(contas).not.toContain(alvoB.id);
  });
});

describe('(d) paginação e ordem determinística', () => {
  it('take limita a página; total reflete o conjunto; skip avança sem repetir', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    for (let i = 0; i < 4; i++) await vincular(orgId, 'MEMBER');

    const cookie = await login(admin.email);
    const p1 = (await (await getMembros(cookie, '?take=2&skip=0')).json()) as {
      total: number;
      membros: { membershipId: string }[];
    };
    expect(p1.total).toBe(5); // 1 admin + 4 membros
    expect(p1.membros).toHaveLength(2);

    const p2 = (await (await getMembros(cookie, '?take=2&skip=2')).json()) as {
      membros: { membershipId: string }[];
    };
    const ids1 = p1.membros.map((m) => m.membershipId);
    const ids2 = p2.membros.map((m) => m.membershipId);
    // Ordem determinística [createdAt desc, id]: páginas disjuntas, sem sobreposição.
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  it('take acima do teto é clampado a 100 (NFR-3/4)', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const cookie = await login(admin.email);
    const res = (await (await getMembros(cookie, '?take=9999')).json()) as { take: number };
    expect(res.take).toBe(100);
  });

  it('parâmetro desconhecido na query → 400 (allowlist fail-closed)', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const cookie = await login(admin.email);
    expect((await getMembros(cookie, '?orgId=qualquer')).status).toBe(400);
  });
});
