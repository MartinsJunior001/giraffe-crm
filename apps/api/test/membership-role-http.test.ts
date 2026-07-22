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
 * Alteração de papel da Membership (Story 8.4) pela porta da frente: `AppModule` REAL, HTTP real,
 * PostgreSQL real, Better Auth real (login e step-up de VERDADE — o ponto da Story é a proteção real).
 *
 * Cada cenário usa uma Organização DESCARTÁVEL (`randomUUID`) para controlar EXATAMENTE a contagem de
 * Admins (a proteção do último Admin não pode depender de fixtures globais). Contas descartáveis com
 * EXATAMENTE UMA Membership ativa (o contexto resolve sem `x-org-id`). Faxina pelo migrator.
 */

const SENHA = 'giraffe-teste-oito-quatro';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let hashSenha: (senha: string) => Promise<string>;

const orgsCriadas: string[] = [];

async function criarOrg(): Promise<string> {
  const orgId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).organization.create({
    data: { id: orgId, name: `Org 8.4 ${orgId.slice(0, 8)}`, slug: `org84-${orgId}` },
  });
  orgsCriadas.push(orgId);
  return orgId;
}

async function criarConta(): Promise<{ id: string; email: string }> {
  const email = `me84-${randomUUID()}@exemplo.test`;
  const conta = await migrator.account.create({
    data: { email, name: 'Conta 8.4', emailVerified: true },
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

async function vincular(orgId: string, role: 'ADMIN' | 'MEMBER' | 'GUEST'): Promise<Membro> {
  const conta = await criarConta();
  const membershipId = randomUUID();
  await withTenantContext(migrator, { orgId }, semLog).membership.create({
    data: { id: membershipId, accountId: conta.id, orgId, role, state: 'ACTIVE' },
  });
  return { accountId: conta.id, email: conta.email, membershipId };
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

function alterarPapel(cookie: string, membershipId: string, role: string): Promise<Response> {
  return fetch(`${baseUrl}/organizations/members/${membershipId}/role`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ role }),
  });
}

function adminScope(cookie: string): Promise<Response> {
  return fetch(`${baseUrl}/organizations/admin-scope`, { headers: { cookie } });
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
  // Muitos logins REAIS por arquivo, todos do mesmo IP (loopback): limpar os baldes de rate limit
  // (login por IP/conta + step-up) evita que a contagem de um teste estoure o seguinte (429).
  await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%' OR "key" LIKE '%/sign-in/email'`.catch(
    () => {},
  );
});

afterAll(async () => {
  if (migrator) {
    for (const orgId of orgsCriadas) {
      await withTenantContext(migrator, { orgId }, semLog)
        .membership.deleteMany({ where: { orgId } })
        .catch(() => {});
      await migrator.organization.deleteMany({ where: { id: orgId } }).catch(() => {});
    }
    await migrator.account
      .deleteMany({ where: { email: { startsWith: 'me84-' } } })
      .catch(() => {});
    await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%'`.catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('AC1: Admin altera papel com step-up → 200; abilities invalidadas imediatamente', () => {
  it('promover Membro→Admin com step-up efetiva o novo papel (ability em cache invalidada)', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    const cookieAlvo = await login(alvo.email);

    // Antes: o alvo (MEMBER) NÃO alcança o escopo administrativo → 403 (e CACHEIA a ability de MEMBER).
    expect((await adminScope(cookieAlvo)).status).toBe(403);

    const res = await alterarPapel(cookie, alvo.membershipId, 'ADMIN');
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { role: string; previousRole: string };
    expect(corpo).toMatchObject({ role: 'ADMIN', previousRole: 'MEMBER' });

    // Depois: SEM a invalidação (D-3), o cache de MEMBER manteria o 403. O 200 aqui PROVA a invalidação.
    expect((await adminScope(cookieAlvo)).status).toBe(200);
  });

  it('escreve o evento canônico ROLE_CHANGED (from→to) na mesma transação', async () => {
    const { orgId, cookie } = await orgComAdmin();
    const alvo = await vincular(orgId, 'MEMBER');
    expect((await alterarPapel(cookie, alvo.membershipId, 'GUEST')).status).toBe(200);

    const eventos = await withTenantContext(migrator, { orgId }, semLog).membershipEvent.findMany({
      where: { membershipId: alvo.membershipId },
      select: { type: true, fromRole: true, toRole: true },
    });
    expect(eventos).toEqual([{ type: 'ROLE_CHANGED', fromRole: 'MEMBER', toRole: 'GUEST' }]);
  });
});

describe('AC2: step-up (D-1) — só promover→Admin e rebaixar Admin exigem', () => {
  it('promover→Admin SEM step-up → 403 STEP_UP_REQUIRED', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email); // sem step-up

    const res = await alterarPapel(cookie, alvo.membershipId, 'ADMIN');
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });

  it('rebaixar Admin SEM step-up → 403 (há 2 admins, então não é o último — prova que o 403 é do step-up)', async () => {
    const orgId = await criarOrg();
    const adminA = await vincular(orgId, 'ADMIN');
    const adminB = await vincular(orgId, 'ADMIN');
    const cookie = await login(adminA.email); // sem step-up

    const res = await alterarPapel(cookie, adminB.membershipId, 'MEMBER');
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });

  it('trocar Membro→Convidado NÃO exige step-up → 200 (gate escopado, não blanket)', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email); // sem step-up

    const res = await alterarPapel(cookie, alvo.membershipId, 'GUEST');
    expect(res.status).toBe(200);
  });
});

describe('AC3: proteção ATÔMICA do último Admin (D-2)', () => {
  it('rebaixar o ÚNICO Admin (o próprio) → 409 LAST_ADMIN_PROTECTED', async () => {
    const { admin, cookie } = await orgComAdmin(); // 1 admin só (o próprio), com step-up
    const res = await alterarPapel(cookie, admin.membershipId, 'MEMBER');
    expect(res.status).toBe(409);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'LAST_ADMIN_PROTECTED' });
  });

  it('rebaixar um Admin quando há 2 → 200 (a proteção só barra o ÚLTIMO)', async () => {
    const orgId = await criarOrg();
    const adminA = await vincular(orgId, 'ADMIN');
    const adminB = await vincular(orgId, 'ADMIN');
    const cookie = await login(adminA.email);
    expect(await stepUp(cookie)).toBe(204);
    expect((await alterarPapel(cookie, adminB.membershipId, 'MEMBER')).status).toBe(200);
  });

  it('CONCORRÊNCIA: dois rebaixamentos simultâneos dos 2 últimos Admins → um 200, um 409; nunca 0 Admins', async () => {
    const orgId = await criarOrg();
    const adminA = await vincular(orgId, 'ADMIN');
    const adminB = await vincular(orgId, 'ADMIN');
    // Corrida CLÁSSICA do último Admin: cada Admin rebaixa o OUTRO, na SUA própria sessão (com step-up).
    // Sessões distintas evitam contenção do `getSession` na mesma sessão — o que está sob teste é o
    // FOR UPDATE, não a reautenticação.
    const cookieA = await login(adminA.email);
    const cookieB = await login(adminB.email);
    expect(await stepUp(cookieA)).toBe(204);
    expect(await stepUp(cookieB)).toBe(204);

    // Sem o FOR UPDATE, os dois leriam "2 admins" e deixariam 0. Com o lock na linha da Organização, um
    // vence (200) e o outro é BARRADO — pela proteção do último Admin dentro da tx (409) ou, se o vencedor
    // já tiver rebaixado o perdedor antes do guard do perdedor, por perda do poder de Admin (403). Os dois
    // desfechos são a MESMA garantia: a 2ª alteração NÃO é aplicada. O código 409 determinístico da proteção
    // é provado pelo caso "rebaixar o ÚNICO Admin". Aqui o que se prova é a ATOMICIDADE do invariante.
    const [r1, r2] = await Promise.all([
      alterarPapel(cookieA, adminB.membershipId, 'MEMBER'),
      alterarPapel(cookieB, adminA.membershipId, 'MEMBER'),
    ]);
    const status = [r1.status, r2.status].sort((a, b) => a - b);
    expect(status[0]).toBe(200); // exatamente um vence
    expect([403, 409]).toContain(status[1]); // o outro é barrado (não aplicado)

    // O invariante NUNCA foi violado: resta EXATAMENTE 1 Admin ativo (nunca 0).
    const admins = await withTenantContext(migrator, { orgId }, semLog).membership.count({
      where: { orgId, role: 'ADMIN', state: 'ACTIVE' },
    });
    expect(admins).toBe(1);
  });
});

describe('AC4: rebaixar para Convidado revoga concessões incompatíveis (teto AD-9) atomicamente', () => {
  it('DatabaseGrant MEMBER é REVOGADO ao virar GUEST; promover de volta NÃO restaura', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email);

    // Um Database + uma concessão MEMBER ao alvo (incompatível com GUEST — AD-9).
    const dbId = randomUUID();
    const grantId = randomUUID();
    const dbC = withTenantContext(migrator, { orgId }, semLog);
    await dbC.database.create({ data: { id: dbId, orgId, name: 'Base 8.4' } });
    await dbC.databaseGrant.create({
      data: {
        id: grantId,
        orgId,
        databaseId: dbId,
        membershipId: alvo.membershipId,
        role: 'MEMBER',
      },
    });

    const res = await alterarPapel(cookie, alvo.membershipId, 'GUEST'); // Membro→Convidado (sem step-up)
    expect(res.status).toBe(200);
    expect((await res.json()) as { revokedDatabaseGrants: string[] }).toMatchObject({
      revokedDatabaseGrants: [grantId],
    });

    const g1 = await dbC.databaseGrant.findUnique({
      where: { id: grantId },
      select: { state: true },
    });
    expect(g1?.state).toBe('REVOKED');

    // Promover de volta a MEMBER NÃO ressuscita a concessão revogada (re-conceder é ato explícito).
    expect((await alterarPapel(cookie, alvo.membershipId, 'MEMBER')).status).toBe(200);
    const g2 = await dbC.databaseGrant.findUnique({
      where: { id: grantId },
      select: { state: true },
    });
    expect(g2?.state).toBe('REVOKED');
  });
});

describe('AC4-bis: rebaixar para Convidado RECUSA se houver PipeGrant acima do teto (DEB-PIPEGRANT-GUEST-CEILING)', () => {
  it('PipeGrant MEMBER ativo → alterar para GUEST é 409 PIPE_GRANT_INCOMPATIVEL; NÃO rebaixa em silêncio', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email);

    // Um Pipe + uma concessão MEMBER ao alvo (incompatível com o teto do Convidado — só VIEWER).
    const pipeId = randomUUID();
    const grantId = randomUUID();
    const dbC = withTenantContext(migrator, { orgId }, semLog);
    await dbC.pipe.create({ data: { id: pipeId, orgId, name: 'Pipe teto GUEST' } });
    await dbC.pipeGrant.create({
      data: { id: grantId, orgId, pipeId, membershipId: alvo.membershipId, role: 'MEMBER' },
    });

    // A decisão manda RECUSAR (não rebaixar em silêncio): 409 com erro de domínio sanitizado.
    const res = await alterarPapel(cookie, alvo.membershipId, 'GUEST');
    expect(res.status).toBe(409);
    const corpo = (await res.json()) as { erro: string; pipeGrants?: string[] };
    expect(corpo.erro).toBe('PIPE_GRANT_INCOMPATIVEL');
    expect(corpo.pipeGrants).toContain(grantId);
    // Sanitização: o corpo do erro NÃO vaza orgId nem PII (só ids internos de grant).
    expect(JSON.stringify(corpo)).not.toContain(orgId);

    // Nada mudou: a Membership continua MEMBER e a concessão continua ATIVA (sem rebaixamento silencioso).
    const m = await dbC.membership.findUnique({
      where: { id: alvo.membershipId },
      select: { role: true },
    });
    expect(m?.role).toBe('MEMBER');
    const g = await dbC.pipeGrant.findUnique({ where: { id: grantId }, select: { state: true } });
    expect(g?.state).toBe('ACTIVE');
    // Nenhum evento de alteração foi escrito (a recusa é antes da escrita).
    const n = await dbC.membershipEvent.count({ where: { membershipId: alvo.membershipId } });
    expect(n).toBe(0);

    // Fluxo correto: reduzir/remover o grant ANTES → aí o rebaixamento passa (200).
    await dbC.pipeGrant.update({
      where: { id: grantId },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });
    expect((await alterarPapel(cookie, alvo.membershipId, 'GUEST')).status).toBe(200);
  });

  it('PipeGrant VIEWER (dentro do teto) NÃO bloqueia o rebaixamento → 200; a concessão é preservada', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email);

    const pipeId = randomUUID();
    const grantId = randomUUID();
    const dbC = withTenantContext(migrator, { orgId }, semLog);
    await dbC.pipe.create({ data: { id: pipeId, orgId, name: 'Pipe VIEWER GUEST' } });
    await dbC.pipeGrant.create({
      data: { id: grantId, orgId, pipeId, membershipId: alvo.membershipId, role: 'VIEWER' },
    });

    expect((await alterarPapel(cookie, alvo.membershipId, 'GUEST')).status).toBe(200);
    // VIEWER está dentro do teto: a concessão segue ATIVA (não é tocada).
    const g = await dbC.pipeGrant.findUnique({ where: { id: grantId }, select: { state: true } });
    expect(g?.state).toBe('ACTIVE');
  });
});

describe('autorização, isolamento e validação', () => {
  it('Membro (não-Admin) tentando alterar papel → 403 (guard administrar Organizacao)', async () => {
    const orgId = await criarOrg();
    const membro = await vincular(orgId, 'MEMBER');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(membro.email);
    expect((await alterarPapel(cookie, alvo.membershipId, 'ADMIN')).status).toBe(403);
  });

  it('sem sessão → 401', async () => {
    const orgId = await criarOrg();
    const alvo = await vincular(orgId, 'MEMBER');
    const res = await fetch(`${baseUrl}/organizations/members/${alvo.membershipId}/role`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expect(res.status).toBe(401);
  });

  it('alvo de OUTRA Organização → 404 não-enumerante', async () => {
    const { cookie } = await orgComAdmin();
    const outra = await criarOrg();
    const alvoOutra = await vincular(outra, 'MEMBER');
    expect((await alterarPapel(cookie, alvoOutra.membershipId, 'GUEST')).status).toBe(404);
  });

  it('alterar Membership SUSPENSA → 409 MEMBERSHIP_INATIVA (só ativa muda de papel)', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const suspensoId = randomUUID();
    const conta = await criarConta();
    await withTenantContext(migrator, { orgId }, semLog).membership.create({
      data: { id: suspensoId, accountId: conta.id, orgId, role: 'MEMBER', state: 'SUSPENDED' },
    });
    const cookie = await login(admin.email);
    const res = await alterarPapel(cookie, suspensoId, 'GUEST');
    expect(res.status).toBe(409);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'MEMBERSHIP_INATIVA' });
  });

  it('no-op idempotente: alterar para o MESMO papel → 200, sem novo evento', async () => {
    const orgId = await criarOrg();
    const admin = await vincular(orgId, 'ADMIN');
    const alvo = await vincular(orgId, 'MEMBER');
    const cookie = await login(admin.email);
    expect((await alterarPapel(cookie, alvo.membershipId, 'MEMBER')).status).toBe(200);
    const n = await withTenantContext(migrator, { orgId }, semLog).membershipEvent.count({
      where: { membershipId: alvo.membershipId },
    });
    expect(n).toBe(0); // no-op não emite evento
  });

  it('corpo inválido (papel inexistente / campo extra / id malformado) → 400', async () => {
    const { admin, cookie } = await orgComAdmin();
    expect((await alterarPapel(cookie, admin.membershipId, 'SUPERADMIN')).status).toBe(400);
    const extra = await fetch(`${baseUrl}/organizations/members/${admin.membershipId}/role`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ role: 'MEMBER', orgId: 'x' }),
    });
    expect(extra.status).toBe(400);
    expect((await alterarPapel(cookie, 'nao-uuid', 'MEMBER')).status).toBe(400);
  });
});
