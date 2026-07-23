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
 * Remoção e saída voluntária da Membership (Story 8.6) pela porta da frente: `AppModule` REAL, HTTP real,
 * PostgreSQL real, Better Auth real (login e step-up de VERDADE). Cada cenário usa uma Organização
 * DESCARTÁVEL (`randomUUID`) para controlar EXATAMENTE a contagem de Admins; contas descartáveis.
 */

const SENHA = 'giraffe-teste-oito-seis';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let hashSenha: (senha: string) => Promise<string>;

const orgsCriadas: string[] = [];

async function criarOrg(): Promise<string> {
  const orgId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).organization.create({
    data: { id: orgId, name: `Org 8.6 ${orgId.slice(0, 8)}`, slug: `org86-${orgId}` },
  });
  orgsCriadas.push(orgId);
  return orgId;
}

async function criarConta(): Promise<{ id: string; email: string }> {
  const email = `me86-${randomUUID()}@exemplo.test`;
  const conta = await migrator.account.create({
    data: { email, name: 'Conta 8.6', emailVerified: true },
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
  await dbC.pipe.create({ data: { id: pipeId, orgId, name: 'Pipe 8.6' } });
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

/** Cria Pipe→Task com o membro como Responsável (referência-por-id). Devolve o taskId. */
async function criarTarefaComResponsavel(orgId: string, membershipId: string): Promise<string> {
  const dbC = withTenantContext(migrator, { orgId }, semLog);
  const pipeId = randomUUID();
  const taskId = randomUUID();
  await dbC.pipe.create({ data: { id: pipeId, orgId, name: 'Pipe 5.1' } });
  await dbC.task.create({
    data: { id: taskId, orgId, pipeId, title: 'T', responsavelMembershipId: membershipId },
  });
  return taskId;
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

function remover(cookie: string, membershipId: string): Promise<Response> {
  return fetch(`${baseUrl}/organizations/members/${membershipId}/remove`, {
    method: 'POST',
    headers: { cookie },
  });
}

function sair(cookie: string, orgId?: string): Promise<Response> {
  const headers: Record<string, string> = { cookie };
  if (orgId) headers['x-org-id'] = orgId;
  return fetch(`${baseUrl}/organizations/members/me/leave`, { method: 'POST', headers });
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
      await dbC.task.deleteMany({ where: { orgId } }).catch(() => {});
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
      .deleteMany({ where: { email: { startsWith: 'me86-' } } })
      .catch(() => {});
    await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%'`.catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('AC: remoção administrativa (step-up) — encerra, deny-by-default, revoga, preserva, audita', () => {
  it('remove um membro → 200 REMOVED; deny-by-default na próxima requisição; Account/papel/histórico preservados', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const cookieAlvo = await login(alvo.email);
    expect((await current(cookieAlvo)).status).toBe(200);

    const res = await remover(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    expect(
      (await res.json()) as { state: string; previousState: string; saidaVoluntaria: boolean },
    ).toMatchObject({ state: 'REMOVED', previousState: 'ACTIVE', saidaVoluntaria: false });

    // Deny-by-default: o contexto relê Membership ACTIVE; não há mais nenhuma → 403.
    expect((await current(cookieAlvo)).status).toBe(403);

    // Papel PRESERVADO, estado REMOVED — a linha (autoria/histórico) permanece; a Account NÃO é excluída.
    const m = await withTenantContext(migrator, { orgId }, semLog).membership.findUnique({
      where: { id: alvo.membershipId },
      select: { role: true, state: true },
    });
    expect(m).toMatchObject({ role: 'MEMBER', state: 'REMOVED' });
    const conta = await migrator.account.findUnique({
      where: { id: alvo.accountId },
      select: { id: true },
    });
    expect(conta?.id).toBe(alvo.accountId);
  });

  it('CardGrant REVOGADO e CardResponsavel REMOVIDO na mesma tx; evento REMOVED com ator=Admin, saidaVoluntaria=false', async () => {
    const { orgId, admin, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const { grantId, responsavelId } = await criarCardComAcesso(orgId, alvo.membershipId);

    const res = await remover(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    expect(
      (await res.json()) as { revokedCardGrants: string[]; removedResponsavelDe: string[] },
    ).toMatchObject({ revokedCardGrants: [grantId] });

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
      select: { type: true, fromRole: true, toRole: true, actorId: true, payload: true },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      type: 'REMOVED',
      fromRole: 'MEMBER',
      toRole: 'MEMBER',
      actorId: admin.accountId,
    });
    expect((eventos[0]!.payload as { saidaVoluntaria: boolean }).saidaVoluntaria).toBe(false);
  });

  it('Responsável de Tarefa (5.1) ESVAZIADO na mesma tx ao remover (contrato de reatribuição, §1525)', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const taskId = await criarTarefaComResponsavel(orgId, alvo.membershipId);

    const res = await remover(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { removedTaskResponsavelDe: string[] };
    expect(corpo.removedTaskResponsavelDe).toEqual([taskId]);

    // O Responsável da Tarefa foi esvaziado — sem referência operacional inválida silenciosa.
    const dbC = withTenantContext(migrator, { orgId }, semLog);
    const t = await dbC.task.findUnique({
      where: { id: taskId },
      select: { responsavelMembershipId: true },
    });
    expect(t?.responsavelMembershipId).toBeNull();

    // A ação foi registrada no payload do evento canônico (auditoria via MembershipEvent, sem tocar TaskHistory).
    const ev = await dbC.membershipEvent.findFirst({
      where: { membershipId: alvo.membershipId },
      select: { payload: true },
    });
    expect(
      (ev?.payload as { removedTaskResponsavelDe: string[] }).removedTaskResponsavelDe,
    ).toEqual([taskId]);
  });

  it('remover um membro SUSPENDED → 200 REMOVED (transição válida a partir de SUSPENDED)', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    await withTenantContext(migrator, { orgId }, semLog).membership.update({
      where: { id: alvo.membershipId },
      data: { state: 'SUSPENDED' },
    });
    const res = await remover(cookie, alvo.membershipId);
    expect(res.status).toBe(200);
    expect((await res.json()) as { previousState: string }).toMatchObject({
      previousState: 'SUSPENDED',
    });
  });
});

describe('AC: saída voluntária (step-up) — encerra só a própria, limpa activeOrganizationId, preserva outras', () => {
  it('o próprio usuário sai → 200 REMOVED saidaVoluntaria=true; perde acesso; activeOrganizationId limpo; ator=próprio', async () => {
    const orgId = await criarOrg();
    // Um segundo Admin para que a saída do membro não esbarre no último Admin.
    await vincular(orgId, 'ADMIN');
    const membro = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email);
    expect(await stepUp(cookie)).toBe(204);
    // Fixa a Org como ativa na sessão do próprio (determinístico).
    await migrator.authSession.updateMany({
      where: { userId: membro.accountId },
      data: { activeOrganizationId: orgId },
    });
    expect((await current(cookie)).status).toBe(200);

    const res = await sair(cookie);
    expect(res.status).toBe(200);
    expect((await res.json()) as { state: string; saidaVoluntaria: boolean }).toMatchObject({
      state: 'REMOVED',
      saidaVoluntaria: true,
    });

    // Perde o acesso na próxima requisição; activeOrganizationId limpo.
    expect((await current(cookie)).status).toBe(403);
    const apontando = await migrator.authSession.findMany({
      where: { userId: membro.accountId, activeOrganizationId: orgId },
      select: { id: true },
    });
    expect(apontando).toHaveLength(0);

    const evento = await withTenantContext(migrator, { orgId }, semLog).membershipEvent.findFirst({
      where: { membershipId: membro.membershipId },
      select: { type: true, actorId: true, payload: true },
    });
    expect(evento).toMatchObject({ type: 'REMOVED', actorId: membro.accountId });
    expect((evento!.payload as { saidaVoluntaria: boolean }).saidaVoluntaria).toBe(true);
  });

  it('saída voluntária preserva as DEMAIS Memberships do mesmo Account (outra Org intacta)', async () => {
    const orgA = await criarOrg();
    const orgB = await criarOrg();
    await vincular(orgA, 'ADMIN'); // 2º admin em A para não travar no último Admin
    const conta = await criarConta();
    const emA = await vincular(orgA, 'MEMBER', conta);
    await vincular(orgB, 'MEMBER', conta);
    const cookie = await login(conta.email);
    expect(await stepUp(cookie)).toBe(204);

    expect((await sair(cookie, orgA)).status).toBe(200);

    // Org A encerrada → 403; Org B intacta → 200 (Account não revogada globalmente).
    expect((await current(cookie, orgA)).status).toBe(403);
    expect((await current(cookie, orgB)).status).toBe(200);
    const emB = await withTenantContext(migrator, { orgId: orgB }, semLog).membership.findFirst({
      where: { accountId: conta.id },
      select: { state: true },
    });
    expect(emB?.state).toBe('ACTIVE');
    const emAmemb = await withTenantContext(
      migrator,
      { orgId: orgA },
      semLog,
    ).membership.findUnique({
      where: { id: emA.membershipId },
      select: { state: true },
    });
    expect(emAmemb?.state).toBe('REMOVED');
  });
});

describe('step-up (D-1): remover E sair exigem', () => {
  it('remover SEM step-up → 403 STEP_UP_REQUIRED', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email); // sem step-up
    const res = await remover(cookie, alvo.membershipId);
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });

  it('sair SEM step-up → 403 STEP_UP_REQUIRED', async () => {
    const orgId = await criarOrg();
    await vincular(orgId, 'ADMIN');
    const membro = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email); // sem step-up
    const res = await sair(cookie);
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });
});

describe('D-2: proteção do último Admin (nos DOIS fluxos, atômica)', () => {
  it('saída voluntária do ÚNICO Admin → 409 LAST_ADMIN_PROTECTED (single-thread)', async () => {
    const { cookie } = await orgComAdmin(); // único Admin, com step-up
    const res = await sair(cookie);
    expect(res.status).toBe(409);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'LAST_ADMIN_PROTECTED' });
  });

  it('Admin removendo A SI MESMO sendo o último → 409 LAST_ADMIN_PROTECTED', async () => {
    const { admin, cookie } = await orgComAdmin();
    const res = await remover(cookie, admin.membershipId);
    expect(res.status).toBe(409);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'LAST_ADMIN_PROTECTED' });
  });

  it('CONCORRÊNCIA: dois Admins removendo um ao outro → um 200, um barrado; NUNCA 0 Admins', async () => {
    const orgId = await criarOrg();
    const adminA = await vincular(orgId, 'ADMIN');
    const adminB = await vincular(orgId, 'ADMIN');
    const cookieA = await login(adminA.email);
    const cookieB = await login(adminB.email);
    expect(await stepUp(cookieA)).toBe(204);
    expect(await stepUp(cookieB)).toBe(204);

    const [r1, r2] = await Promise.all([
      remover(cookieA, adminB.membershipId),
      remover(cookieB, adminA.membershipId),
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

describe('autorização, isolamento, validação e idempotência', () => {
  it('Membro (não-Admin) tentando REMOVER outro → 403 (guard administrar Organizacao)', async () => {
    const orgId = await criarOrg();
    await vincular(orgId, 'ADMIN');
    const membro = await vincular(orgId, 'MEMBER');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email);
    expect((await remover(cookie, alvo.membershipId)).status).toBe(403);
  });

  it('Membro comum PODE sair de si mesmo (não exige Admin) — 200', async () => {
    const orgId = await criarOrg();
    await vincular(orgId, 'ADMIN');
    const membro = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email);
    expect(await stepUp(cookie)).toBe(204);
    expect((await sair(cookie)).status).toBe(200);
  });

  it('sem sessão → 401 (remover e sair)', async () => {
    const orgId = await criarOrg();
    const alvo = await vincular(orgId, 'MEMBER');
    expect(
      (
        await fetch(`${baseUrl}/organizations/members/${alvo.membershipId}/remove`, {
          method: 'POST',
        })
      ).status,
    ).toBe(401);
    expect(
      (await fetch(`${baseUrl}/organizations/members/me/leave`, { method: 'POST' })).status,
    ).toBe(401);
  });

  it('remover alvo de OUTRA Organização → 404 não-enumerante', async () => {
    const { cookie } = await orgComAdmin();
    const outra = await criarOrg();
    const alvoOutra = await vincular(outra, 'MEMBER');
    expect((await remover(cookie, alvoOutra.membershipId)).status).toBe(404);
  });

  it('id malformado → 400', async () => {
    const { cookie } = await orgComAdmin();
    expect((await remover(cookie, 'nao-uuid')).status).toBe(400);
  });

  it('remover já-removido → 200 idempotente, sem 2º evento REMOVED', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    expect((await remover(cookie, alvo.membershipId)).status).toBe(200);
    expect((await remover(cookie, alvo.membershipId)).status).toBe(200);
    const n = await withTenantContext(migrator, { orgId }, semLog).membershipEvent.count({
      where: { membershipId: alvo.membershipId, type: 'REMOVED' },
    });
    expect(n).toBe(1);
  });
});
