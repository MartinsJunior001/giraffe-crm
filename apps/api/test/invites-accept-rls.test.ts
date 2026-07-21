import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira do aceite (Story 8.3) contra PostgreSQL REAL, papel `giraffe_app`. Quem decide é o BANCO.
 *
 * Prova: (1) `InviteRoute` é GLOBAL (sem RLS) e resolve `tokenHash`→`orgId` SEM contexto — enquanto o
 * `Invite` correspondente é INVISÍVEL sem contexto (a rota é só DICA; a RLS do Invite é a AUTORIDADE);
 * (2) o TRIGGER mantém a rota ao inserir o Invite e ao ROTACIONAR o token (reenvio); (3) o runtime tem
 * na `InviteRoute` GRANT SELECT/INSERT/DELETE e NÃO UPDATE; (4) o runtime cria/ativa `Membership` sob
 * contexto (a 8.3 é o 1º criador de Membership em runtime). Escrita na Org C, descartável (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;
let prisma: PrismaClient;
let migrator: PrismaClient;
const invitesCriados: string[] = [];
const hashesCriados: string[] = [];
const membershipsCriadas: string[] = [];

function hash64(): string {
  return (randomUUID() + randomUUID()).replace(/-/g, '');
}

function dadosInvite(orgId: string, tokenHash: string) {
  const email = `wa-8-3-${randomUUID().slice(0, 8)}@exemplo.test`;
  return {
    orgId,
    normalizedEmail: email,
    email,
    role: 'MEMBER' as const,
    tokenHash,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    lastSentAt: new Date(),
    invitedByAccountId: randomUUID(),
  };
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS do aceite exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  if (migrator) {
    for (const orgId of [ORG_A, ORG_C]) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      if (invitesCriados.length)
        await db.invite.deleteMany({ where: { id: { in: invitesCriados } } });
      if (membershipsCriadas.length)
        await db.membership.deleteMany({ where: { id: { in: membershipsCriadas } } });
    }
    if (hashesCriados.length)
      await migrator.inviteRoute.deleteMany({ where: { tokenHash: { in: hashesCriados } } });
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('InviteRoute — resolvedor global de tenant', () => {
  it('é GLOBAL: runtime resolve tokenHash→orgId SEM contexto, mas o Invite fica INVISÍVEL sem contexto', async () => {
    const tokenHash = hash64();
    hashesCriados.push(tokenHash);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const inv = await db.invite.create({
      data: dadosInvite(ORG_C, tokenHash),
      select: { id: true },
    });
    invitesCriados.push(inv.id);

    // Rota resolvida SEM contexto (global) — o trigger a populou no INSERT do Invite.
    const rota = await prisma.inviteRoute.findUnique({
      where: { tokenHash },
      select: { orgId: true },
    });
    expect(rota?.orgId).toBe(ORG_C);

    // ...mas o próprio Invite é invisível sem contexto (a RLS é a autoridade; a rota é só dica).
    expect(await prisma.invite.findMany({ where: { tokenHash } })).toEqual([]);
  });

  it('o TRIGGER rotaciona a rota quando o tokenHash muda (reenvio)', async () => {
    const hashAntigo = hash64();
    const hashNovo = hash64();
    hashesCriados.push(hashAntigo, hashNovo);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const inv = await db.invite.create({
      data: dadosInvite(ORG_C, hashAntigo),
      select: { id: true },
    });
    invitesCriados.push(inv.id);

    await db.invite.updateMany({ where: { id: inv.id }, data: { tokenHash: hashNovo } });

    // Antigo some, novo aparece — a rota acompanha a rotação.
    expect(await prisma.inviteRoute.findUnique({ where: { tokenHash: hashAntigo } })).toBeNull();
    expect((await prisma.inviteRoute.findUnique({ where: { tokenHash: hashNovo } }))?.orgId).toBe(
      ORG_C,
    );
  });

  it('runtime tem SELECT/INSERT/DELETE e NÃO UPDATE em InviteRoute (só o trigger mantém)', async () => {
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name='InviteRoute' AND grantee='giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['DELETE', 'INSERT', 'SELECT']);
  });

  it('InviteRoute NÃO tem RLS (é global, não pertence a tenant)', async () => {
    const t = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname='InviteRoute'`;
    expect(t[0]?.relrowsecurity).toBe(false);
  });
});

describe('Membership — o aceite é o 1º criador em runtime', () => {
  it('runtime cria e ativa Membership sob contexto (GRANT SELECT/INSERT/UPDATE/DELETE)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const accountId = randomUUID();
    // Cria a conta global (migrator; Account não tem RLS, mas o runtime não a cria).
    await migrator.account.create({
      data: {
        id: accountId,
        email: `wa83-${accountId}@exemplo.test`,
        name: 'WA 8.3',
        emailVerified: true,
      },
    });

    const m = await db.membership.create({
      data: { accountId, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      select: { id: true, state: true },
    });
    membershipsCriadas.push(m.id);
    expect(m.state).toBe('ACTIVE');

    // Reativação (REMOVED→ACTIVE) também é permitida ao runtime.
    await db.membership.updateMany({ where: { id: m.id }, data: { state: 'REMOVED' } });
    const r = await db.membership.updateMany({
      where: { id: m.id, state: 'REMOVED' },
      data: { state: 'ACTIVE', role: 'MEMBER' },
    });
    expect(r.count).toBe(1);

    await migrator.account.delete({ where: { id: accountId } });
  });

  it('Membership de outra Org é invisível sem o contexto dela (isolamento)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    // Uma Membership da Org C não aparece no contexto da Org A.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const accountId = randomUUID();
    await migrator.account.create({
      data: {
        id: accountId,
        email: `wa83b-${accountId}@exemplo.test`,
        name: 'WA',
        emailVerified: true,
      },
    });
    const m = await dbC.membership.create({
      data: { accountId, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      select: { id: true },
    });
    membershipsCriadas.push(m.id);
    expect(await dbA.membership.findMany({ where: { id: m.id } })).toEqual([]);
    await migrator.account.delete({ where: { id: accountId } });
  });
});
