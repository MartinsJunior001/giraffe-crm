import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e fronteira de privilégio de `Invite` (Story 8.2) contra PostgreSQL REAL, pelo papel
 * `giraffe_app`. Quem nega é o BANCO. Se o Postgres estiver fora, VERMELHO (não pulado).
 *
 * Prova: RLS ENABLE+FORCE, WITH CHECK (INSERT/UPDATE), GRANT sem DELETE, e a unicidade PARCIAL
 * "1 PENDING por (orgId, normalizedEmail)" imposta pelo índice. Escrita sempre na Org C com dados
 * descartáveis (`randomUUID`) — nunca reusar fixtures de leitura (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;
let prisma: PrismaClient;
let migrator: PrismaClient;
const criados: string[] = [];

function dadosInvite(orgId: string, over: Partial<Record<string, unknown>> = {}) {
  const email = `wa-8-2-${randomUUID().slice(0, 8)}@exemplo.test`;
  return {
    orgId,
    normalizedEmail: email,
    email,
    role: 'MEMBER' as const,
    tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    lastSentAt: new Date(),
    invitedByAccountId: randomUUID(),
    ...over,
  };
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS de Invite exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  if (migrator && criados.length > 0) {
    for (const orgId of [ORG_A, ORG_C]) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.invite.deleteMany({ where: { id: { in: criados } } });
    }
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel, RLS e GRANT de Invite', () => {
  it('Invite tem RLS ENABLE+FORCE e é do migrator, não do runtime', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) dono, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='Invite'`;
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });

  it('runtime tem SELECT/INSERT/UPDATE e NÃO DELETE', async () => {
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name='Invite' AND grantee='giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });

  it('DELETE é NEGADO pelo banco — cancelar/expirar é state (LGPD)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const inv = await db.invite.create({ data: dadosInvite(ORG_C), select: { id: true } });
    criados.push(inv.id);
    await expect(db.invite.deleteMany({ where: { id: inv.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('isolamento entre Organizações', () => {
  it('cada tenant só enxerga os próprios Convites', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const inv = await dbC.invite.create({ data: dadosInvite(ORG_C), select: { id: true } });
    criados.push(inv.id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.invite.findMany({ where: { id: inv.id } })).toEqual([]);
    expect(await dbC.invite.findMany({ where: { id: inv.id } })).toHaveLength(1);
  });

  it('INSERT com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(db.invite.createMany({ data: [dadosInvite(ORG_A)] })).rejects.toThrow(
      /row-level security|violates/i,
    );
  });

  it('sem contexto, nada é visível (deny-by-default)', async () => {
    expect(await prisma.invite.findMany({ take: 1 })).toEqual([]);
  });
});

describe('unicidade parcial: 1 PENDING por (orgId, normalizedEmail)', () => {
  it('2º PENDING para o mesmo par colide (P2002)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const base = dadosInvite(ORG_C);
    const inv1 = await db.invite.create({ data: base, select: { id: true } });
    criados.push(inv1.id);

    // Mesmo normalizedEmail, novo tokenHash — deve colidir no índice parcial.
    await expect(
      db.invite.create({
        data: {
          ...base,
          tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, ''),
        },
        select: { id: true },
      }),
    ).rejects.toThrow(/Unique constraint|Invite_pending_unico|unique/i);
  });

  it('após o 1º sair de PENDING, um novo PENDING para o mesmo par é permitido', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const base = dadosInvite(ORG_C);
    const inv1 = await db.invite.create({ data: base, select: { id: true } });
    criados.push(inv1.id);

    // Cancela o 1º (state = CANCELLED) — libera o par.
    await db.invite.updateMany({ where: { id: inv1.id }, data: { state: 'CANCELLED' } });

    const inv2 = await db.invite.create({
      data: { ...base, tokenHash: randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '') },
      select: { id: true },
    });
    criados.push(inv2.id);
    expect(inv2.id).not.toBe(inv1.id);
  });
});
