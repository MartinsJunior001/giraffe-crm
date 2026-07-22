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
 * Suspensão e reativação da Membership (Story 8.5) pela porta da frente: `AppModule` REAL, HTTP real,
 * PostgreSQL real, Better Auth real (login e step-up de VERDADE). Cada cenário usa uma Organização
 * DESCARTÁVEL (`randomUUID`) para controlar EXATAMENTE a contagem de Admins; contas descartáveis.
 */

const SENHA = 'giraffe-teste-oito-cinco';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let hashSenha: (senha: string) => Promise<string>;

const orgsCriadas: string[] = [];

async function criarOrg(): Promise<string> {
  const orgId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).organization.create({
    data: { id: orgId, name: `Org 8.5 ${orgId.slice(0, 8)}`, slug: `org85-${orgId}` },
  });
  orgsCriadas.push(orgId);
  return orgId;
}

async function criarConta(): Promise<{ id: string; email: string }> {
  const email = `me85-${randomUUID()}@exemplo.test`;
  const conta = await migrator.account.create({
    data: { email, name: 'Conta 8.5', emailVerified: true },
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
  membershipId: string;
}

async function vincular(
  orgId: string,
  role: 'ADMIN' | 'MEMBER' | 'GUEST',
  conta?: { id: string; email: string },
): Promise<Membro> {
  const c = conta ?? (await criarConta());
  const membershipId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).membership.create({
    data: { id: membershipId, accountId: c.id, orgId, role, state: 'ACTIVE' },
  });
  return { accountId: c.id, email: c.email, membershipId };
}

/** Cria Pipe→Fase→Form→FormVersion→Card e concede CardGrant + CardResponsavel ao membro. */
async function criarCardComAcesso(
  orgId: string,
  membershipId: string,
): Promise<{ cardId: string; grantId: string; responsavelId: string }> {
  const dbC = withTenantContext(migrator, { orgId }, semLog);
  const pipeId = randomUUID();
  const phaseId = randomUUID();
  const formId = randomUUID();
  const formVersionId = randomUUID();
  const cardId = randomUUID();
  const grantId = randomUUID();
  const responsavelId = randomUUID();
  await dbC.pipe.create({ data: { id: pipeId, orgId, name: 'Pipe 8.5' } });
  await dbC.phase.create({ data: { id: phaseId, orgId, pipeId, name: 'A Fazer', position: '1' } });
  await dbC.form.create({ data: { id: formId, orgId, context: 'PIPE_INITIAL', pipeId } });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId,
      formId,
      version: 1,
      snapshot: { formId, fields: [] },
      revision: 'r1',
    },
  });
  await dbC.card.create({
    data: {
      id: cardId,
      orgId,
      pipeId,
      phaseId,
      formId,
      formVersionId,
      idempotencyKey: `k-${cardId}`,
      valores: {},
    },
  });
  await dbC.cardGrant.create({
    data: { id: grantId, orgId, cardId, membershipId, podeLer: true, podeOperar: true },
  });
  await dbC.cardResponsavel.create({ data: { id: responsavelId, orgId, cardId, membershipId } });
  return { cardId, grantId, responsavelId };
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

async function stepUp(cookie: string): Promise<number> {
  const res = await fetch(`${baseUrl}/me/step-up`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ senhaAtual: SENHA }),
  });
  return res.status;
}

function suspender(cookie: string, membershipId: string): Promise<Response> {
  return fetch(`${baseUrl}/organizations/members/${membershipId}/suspend`, {
    method: 'POST',
    headers: { cookie },
  });
}

function reativar(cookie: string, membershipId: string): Promise<Response> {
  return fetch(`${baseUrl}/organizations/members/${membershipId}/reactivate`, {
    method: 'POST',
    headers: { cookie },
  });
}

function current(cookie: string, orgId?: string): Promise<Response> {
  const headers: Record<string, string> = { cookie };
  if (orgId) headers['x-org-id'] = orgId;
  return fetch(`${baseUrl}/organizations/current`, { headers });
}

/** Cria a Org, um admin (logado + com step-up válido) e devolve tudo pronto para operar. */
async function orgComAdmin(): Promise<{ orgId: string; admin: Membro; cookie: string }> {
  const orgId = await criarOrg();
  const admin = await vincular(orgId, 'ADMIN');
  const cookie = await login(admin.email);
  expect(await stepUp(cookie)).toBe(204);
  return { orgId, admin, cookie };
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
  await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%' OR "key" LIKE '%/sign-in/email'`.catch(
    () => {},
  );
});

afterAll(async () => {
  if (migrator) {
    for (const orgId of orgsCriadas) {
      const dbC = withTenantContext(migrator, { orgId }, semLog);
      await dbC.cardResponsavel.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.cardGrant.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.card.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.formVersion.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.form.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.phase.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.pipe.deleteMany({ where: { orgId } }).catch(() => {});
      await dbC.membership.deleteMany({ where: { orgId } }).catch(() => {});
      await migrator.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
    }
    await migrator.account
      .deleteMany({ where: { email: { startsWith: 'me85-' } } })
      .catch(() => {});
    await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%'`.catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('AC1: suspensão com step-up → deny-by-default imediato; concessões revogadas; papel/histórico preservados', () => {
  it('membro suspenso perde acesso à Org na PRÓXIMA requisição (deny-by-default)', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const cookieAlvo = await login(alvo.email);

    // Antes: o membro ativo alcança a própria Organização (ability `ler`, piso de toda Membership).
    expect((await current(cookieAlvo)).status).toBe(200);

    const res = await suspender(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    expect((await res.json()) as { state: string; previousState: string }).toMatchObject({
      state: 'SUSPENDED',
      previousState: 'ACTIVE',
    });

    // Depois: o contexto relê a Membership ACTIVE por requisição — sem nenhuma → 403 (deny-by-default).
    expect((await current(cookieAlvo)).status).toBe(403);

    // Papel preservado; estado SUSPENDED (Account/papel/autoria intactos).
    const m = await withTenantContext(migrator, { orgId }, semLog).membership.findUnique({
      where: { id: alvo.membershipId },
      select: { role: true, state: true },
    });
    expect(m).toMatchObject({ role: 'MEMBER', state: 'SUSPENDED' });
  });

  it('CardGrant é REVOGADO e CardResponsavel REMOVIDO na mesma transação; evento SUSPENDED escrito', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const { grantId, responsavelId } = await criarCardComAcesso(orgId, alvo.membershipId);

    const res = await suspender(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    expect((await res.json()) as { revokedCardGrants: string[] }).toMatchObject({
      revokedCardGrants: [grantId],
    });

    const dbC = withTenantContext(migrator, { orgId }, semLog);
    expect(
      (await dbC.cardGrant.findUnique({ where: { id: grantId }, select: { state: true } }))?.state,
    ).toBe('REVOKED');
    expect(
      (
        await dbC.cardResponsavel.findUnique({
          where: { id: responsavelId },
          select: { state: true },
        })
      )?.state,
    ).toBe('REMOVED');

    const eventos = await dbC.membershipEvent.findMany({
      where: { membershipId: alvo.membershipId },
      select: { type: true, fromRole: true, toRole: true },
    });
    expect(eventos).toEqual([{ type: 'SUSPENDED', fromRole: 'MEMBER', toRole: 'MEMBER' }]);
  });

  it('outras Organizações do mesmo Account permanecem intactas', async () => {
    const orgA = await criarOrg();
    const orgB = await criarOrg();
    // Admins próprios para operar cada Org (com step-up).
    const adminA = await vincular(orgA, 'ADMIN');
    const cookieA = await login(adminA.email);
    expect(await stepUp(cookieA)).toBe(204);
    // O membro pertence às DUAS Orgs (mesmo Account).
    const conta = await criarConta();
    const alvoA = await vincular(orgA, 'MEMBER', conta);
    await vincular(orgB, 'MEMBER', conta);
    const cookieAlvo = await login(conta.email);

    expect((await suspender(cookieA, alvoA.membershipId)).status).toBe(200);

    // Org afetada (A): 403. Org B: intacta → 200 (a Account NÃO foi revogada globalmente).
    expect((await current(cookieAlvo, orgA)).status).toBe(403);
    expect((await current(cookieAlvo, orgB)).status).toBe(200);
  });
});

describe('AC3: activeOrganizationId limpo; último Admin protegido (atômico)', () => {
  it('se a Org suspensa é a ativa da sessão, activeOrganizationId é limpo', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    await login(alvo.email); // cria a sessão do alvo

    // O alvo tem a Org afetada como ativa na sessão (a troca explícita persiste `activeOrganizationId`;
    // aqui fixamos direto no banco para tornar o cenário determinístico).
    await migrator.authSession.updateMany({
      where: { userId: alvo.accountId },
      data: { activeOrganizationId: orgId },
    });
    const antes = await migrator.authSession.findMany({
      where: { userId: alvo.accountId, activeOrganizationId: orgId },
      select: { id: true },
    });
    expect(antes.length).toBeGreaterThan(0);

    expect((await suspender(cookie, alvo.membershipId)).status).toBe(200);

    const depois = await migrator.authSession.findMany({
      where: { userId: alvo.accountId, activeOrganizationId: orgId },
      select: { id: true },
    });
    expect(depois).toHaveLength(0); // ponteiro limpo, sem troca silenciosa
  });

  // NOTA: para a SUSPENSÃO, não há caminho single-thread para 409 LAST_ADMIN_PROTECTED — o único
  // Admin que poderia "restar" é o próprio ator, e suspender a si mesmo é AUTOSSUSPENSÃO (barrada
  // antes). A decisão pura `ULTIMO_ADMIN` é provada em `membership-state-core.test.ts`; a ATOMICIDADE
  // da proteção (o que só o banco garante) é provada pela concorrência abaixo.
  it('CONCORRÊNCIA: duas suspensões simultâneas dos 2 últimos Admins → um 200, um barrado; nunca 0 Admins', async () => {
    const orgId = await criarOrg();
    const adminA = await vincular(orgId, 'ADMIN');
    const adminB = await vincular(orgId, 'ADMIN');
    // Cada Admin suspende o OUTRO, na SUA sessão (com step-up). Sessões distintas evitam contenção do getSession.
    const cookieA = await login(adminA.email);
    const cookieB = await login(adminB.email);
    expect(await stepUp(cookieA)).toBe(204);
    expect(await stepUp(cookieB)).toBe(204);

    const [r1, r2] = await Promise.all([
      suspender(cookieA, adminB.membershipId),
      suspender(cookieB, adminA.membershipId),
    ]);
    const status = [r1.status, r2.status].sort((a, b) => a - b);
    expect(status[0]).toBe(200); // exatamente um vence
    expect([403, 409]).toContain(status[1]); // o outro é barrado (409 last-admin ou 403 perdeu poder)

    const admins = await withTenantContext(migrator, { orgId }, semLog).membership.count({
      where: { orgId, role: 'ADMIN', state: 'ACTIVE' },
    });
    expect(admins).toBe(1); // invariante NUNCA violado (nunca 0)
  });
});

describe('AC4: reativação — retoma acesso, papel preservado, sem restaurar atribuições', () => {
  it('reativar suspensa → 200 ACTIVE; membro volta a acessar; papel preservado', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const cookieAlvo = await login(alvo.email);

    expect((await suspender(cookie, alvo.membershipId)).status).toBe(200);
    expect((await current(cookieAlvo)).status).toBe(403);

    const res = await reativar(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    expect((await res.json()) as { state: string }).toMatchObject({ state: 'ACTIVE' });

    // Retoma acesso SEM novo aceite, na MESMA sessão: o contexto relê a Membership, agora ACTIVE → 200.
    expect((await current(cookieAlvo)).status).toBe(200);
  });

  it('reativação NÃO restaura CardGrant/CardResponsavel revogados na suspensão', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const { grantId, responsavelId } = await criarCardComAcesso(orgId, alvo.membershipId);

    expect((await suspender(cookie, alvo.membershipId)).status).toBe(200);
    const res = await reativar(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    // Reativação não devolve nada revogado.
    expect((await res.json()) as { revokedCardGrants: string[] }).toMatchObject({
      revokedCardGrants: [],
    });

    const dbC = withTenantContext(migrator, { orgId }, semLog);
    expect(
      (await dbC.cardGrant.findUnique({ where: { id: grantId }, select: { state: true } }))?.state,
    ).toBe('REVOKED');
    expect(
      (
        await dbC.cardResponsavel.findUnique({
          where: { id: responsavelId },
          select: { state: true },
        })
      )?.state,
    ).toBe('REMOVED');

    // Evento REACTIVATED escrito após o SUSPENDED (dois eventos, papel preservado).
    const tipos = await dbC.membershipEvent.findMany({
      where: { membershipId: alvo.membershipId },
      orderBy: { occurredAt: 'asc' },
      select: { type: true },
    });
    expect(tipos.map((t) => t.type)).toEqual(['SUSPENDED', 'REACTIVATED']);
  });
});

describe('step-up (D-1): suspender E reativar exigem', () => {
  it('suspender SEM step-up → 403 STEP_UP_REQUIRED', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email); // sem step-up
    const res = await suspender(cookie, alvo.membershipId);
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });

  it('reativar SEM step-up → 403 STEP_UP_REQUIRED', async () => {
    const { orgId, admin, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    expect((await suspender(cookie, alvo.membershipId)).status).toBe(200);
    // O MESMO admin numa sessão NOVA (sem step-up) tenta reativar → 403.
    const semStepUp = await login(admin.email);
    const res = await reativar(semStepUp, alvo.membershipId);
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });
});

describe('autossuspensão, autorização, isolamento e validação', () => {
  it('autossuspensão → 403 AUTOSSUSPENSAO_PROIBIDA (saída própria é a 8.6)', async () => {
    const { orgId, admin, cookie } = await orgComAdmin();
    // Há um 2º admin para que a trava do último NÃO mascare a autossuspensão (é vedada de todo modo).
    await vincular(orgId, 'ADMIN');
    const res = await suspender(cookie, admin.membershipId);
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({
      erro: 'AUTOSSUSPENSAO_PROIBIDA',
    });
  });

  it('Membro (não-Admin) tentando suspender → 403 (guard administrar Organizacao)', async () => {
    const orgId = await criarOrg();
    const membro = await vincular(orgId, 'MEMBER');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email);
    expect((await suspender(cookie, alvo.membershipId)).status).toBe(403);
  });

  it('sem sessão → 401', async () => {
    const orgId = await criarOrg();
    const alvo = await vincular(orgId, 'MEMBER');
    const res = await fetch(`${baseUrl}/organizations/members/${alvo.membershipId}/suspend`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('alvo de OUTRA Organização → 404 não-enumerante', async () => {
    const { cookie } = await orgComAdmin();
    const outra = await criarOrg();
    const alvoOutra = await vincular(outra, 'MEMBER');
    expect((await suspender(cookie, alvoOutra.membershipId)).status).toBe(404);
  });

  it('id malformado → 400', async () => {
    const { cookie } = await orgComAdmin();
    expect((await suspender(cookie, 'nao-uuid')).status).toBe(400);
  });

  it('suspender já suspensa e reativar já ativa → 200 idempotente, sem novo evento', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    expect((await suspender(cookie, alvo.membershipId)).status).toBe(200);
    // Suspender de novo → idempotente, sem 2º evento SUSPENDED.
    expect((await suspender(cookie, alvo.membershipId)).status).toBe(200);
    const dbC = withTenantContext(migrator, { orgId }, semLog);
    const n1 = await dbC.membershipEvent.count({
      where: { membershipId: alvo.membershipId, type: 'SUSPENDED' },
    });
    expect(n1).toBe(1);
    // Reativar já-ativa (após reativar) → idempotente.
    expect((await reativar(cookie, alvo.membershipId)).status).toBe(200);
    expect((await reativar(cookie, alvo.membershipId)).status).toBe(200);
    const n2 = await dbC.membershipEvent.count({
      where: { membershipId: alvo.membershipId, type: 'REACTIVATED' },
    });
    expect(n2).toBe(1);
  });
});
