import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento multi-tenant do `DatabaseGrant` (Story 3.2) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` — sem BYPASSRLS, não é dono da tabela. Quem nega é o BANCO. Twin de `pipe-grants-rls.test.ts`,
 * entidade DISTINTA (Database ≠ Pipe — RN-061).
 *
 * `DatabaseGrant` referencia uma `Membership` e um `Database`. A Org C é a área de escrita (vazia de
 * Memberships), então este arquivo CRIA suas próprias fixtures descartáveis na Org C (conta global +
 * Membership + Database, todas com UUID aleatório) pelo migrator, e as apaga no fim. O runtime não tem DELETE
 * em Database/DatabaseGrant; a faxina é do dono (FORCE RLS aplica a policy até a ele, daí o contexto).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (dono — setup e faxina)

// Fixtures descartáveis desta suíte (todas na Org C, exceto as contas que são globais).
const contaId = randomUUID();
const membershipId = randomUUID();
// Segunda pessoa: o teste do índice único parcial precisa de um par (database, pessoa) SEM concessão ativa
// preexistente — os outros testes deixam uma concessão ativa em `membershipId`.
const contaId2 = randomUUID();
const membershipId2 = randomUUID();
// Terceira pessoa: o teste de "mover para outra Org no UPDATE" precisa de um par (database, pessoa) SEM
// concessão ativa preexistente — os outros testes ocupam membershipId/membershipId2.
const contaId3 = randomUUID();
const membershipId3 = randomUUID();
const databaseId = randomUUID();
const grantsCriados: string[] = [];

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: RLS de DatabaseGrant exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Contas são GLOBAIS (sem RLS, sem contexto).
  await migrator.account.createMany({
    data: [
      { id: contaId, email: `dbgrant-rls-${contaId}@exemplo.test`, name: 'Alvo RLS' },
      { id: contaId2, email: `dbgrant-rls-${contaId2}@exemplo.test`, name: 'Alvo RLS 2' },
      { id: contaId3, email: `dbgrant-rls-${contaId3}@exemplo.test`, name: 'Alvo RLS 3' },
    ],
  });
  // Memberships e Database na Org C, com contexto (FORCE RLS sujeita até o dono).
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: membershipId, accountId: contaId, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: membershipId2, accountId: contaId2, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: membershipId3, accountId: contaId3, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  await dbC.database.create({
    data: { id: databaseId, orgId: ORG_C, name: 'Database alvo de concessão' },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    // Apagar o Database cascateia os DatabaseGrants; depois a Membership; a conta global por último.
    await dbC.database.deleteMany({ where: { id: databaseId } }).catch(() => {});
    await dbC.membership
      .deleteMany({ where: { id: { in: [membershipId, membershipId2, membershipId3] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [contaId, contaId2, contaId3] } } })
      .catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel e RLS da tabela DatabaseGrant', () => {
  it('DatabaseGrant tem RLS ENABLE + FORCE e NÃO é do runtime (é do migrator)', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relname = 'DatabaseGrant' AND relkind = 'r' AND relnamespace = 'public'::regnamespace`;
    expect(t).toHaveLength(1);
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });
});

describe('escrita e leitura de DatabaseGrant com contexto (isolamento)', () => {
  it('cria uma concessão na própria Org e a enxerga; outro tenant NÃO a vê', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    grantsCriados.push(id);
    await dbC.databaseGrant.create({
      data: { id, orgId: ORG_C, databaseId, membershipId, role: 'MEMBER' },
    });
    expect((await dbC.databaseGrant.findUnique({ where: { id } }))?.id).toBe(id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.databaseGrant.findUnique({ where: { id } })).toBeNull();
    expect((await dbA.databaseGrant.findMany()).map((g) => g.id)).not.toContain(id);
  });

  it('bloqueia inserir concessão com orgId de outra Org (WITH CHECK, sem RETURNING)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.databaseGrant.createMany({
        data: [{ id: randomUUID(), orgId: ORG_A, databaseId, membershipId, role: 'VIEWER' }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia MOVER a concessão para outra Org no UPDATE (WITH CHECK do UPDATE)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    grantsCriados.push(id);
    await dbC.databaseGrant.create({
      data: { id, orgId: ORG_C, databaseId, membershipId: membershipId3, role: 'VIEWER' },
    });
    // Tentar reescrever o orgId para a Org A: o WITH CHECK do UPDATE recusa (não move a linha entre Orgs).
    await expect(
      dbC.databaseGrant.updateMany({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('contexto ausente falha fechado (fase vermelha)', () => {
  it('sem contexto, nenhuma concessão é visível e a escrita é negada', async () => {
    expect(await prisma.databaseGrant.findMany()).toEqual([]);
    await expect(
      prisma.databaseGrant.createMany({
        data: [{ id: randomUUID(), orgId: ORG_C, databaseId, membershipId, role: 'VIEWER' }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('no máximo um papel ATIVO por (Database, pessoa) — índice único parcial', () => {
  it('recusa a 2ª concessão ativa ao mesmo par; revogar e re-conceder funciona', async () => {
    // Usa `membershipId2` — um par (database, pessoa) sem concessão ativa preexistente nesta suíte.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const primeira = randomUUID();
    grantsCriados.push(primeira);
    await dbC.databaseGrant.create({
      data: { id: primeira, orgId: ORG_C, databaseId, membershipId: membershipId2, role: 'VIEWER' },
    });

    // 2ª ativa ao mesmo (database, pessoa) → viola o índice único parcial.
    await expect(
      dbC.databaseGrant.create({
        data: {
          id: randomUUID(),
          orgId: ORG_C,
          databaseId,
          membershipId: membershipId2,
          role: 'ADMIN',
        },
      }),
    ).rejects.toThrow(/unique|constraint|duplicate|P2002/i);

    // Revoga a primeira (soft-delete) e re-concede — o índice parcial libera o slot.
    await dbC.databaseGrant.update({
      where: { id: primeira },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });
    const reconcedida = randomUUID();
    grantsCriados.push(reconcedida);
    await expect(
      dbC.databaseGrant.create({
        data: {
          id: reconcedida,
          orgId: ORG_C,
          databaseId,
          membershipId: membershipId2,
          role: 'ADMIN',
        },
      }),
    ).resolves.toBeTruthy();
  });
});

describe('privilégio mínimo — sem exclusão definitiva (AC4)', () => {
  it('o runtime NÃO tem DELETE em DatabaseGrant: revogar é estado, não exclusão', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.databaseGrant.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
