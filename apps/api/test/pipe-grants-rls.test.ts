import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento multi-tenant do `PipeGrant` (Story 2.2) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` — sem BYPASSRLS, não é dono da tabela. Quem nega é o BANCO. Espelha `pipes-rls.test.ts`.
 *
 * `PipeGrant` referencia uma `Membership` e um `Pipe`. A Org C é a área de escrita (vazia de Memberships),
 * então este arquivo CRIA suas próprias fixtures descartáveis na Org C (conta global + Membership + Pipe,
 * todas com UUID aleatório) pelo migrator, e as apaga no fim. O runtime não tem DELETE em Pipe/PipeGrant;
 * a faxina é do dono (FORCE RLS aplica a policy até a ele, daí o contexto).
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
// Segunda pessoa: o teste do índice único parcial precisa de um par (pipe, pessoa) SEM concessão ativa
// preexistente — os outros testes deixam uma concessão ativa em `membershipId`.
const contaId2 = randomUUID();
const membershipId2 = randomUUID();
const pipeId = randomUUID();
const grantsCriados: string[] = [];

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: RLS de PipeGrant exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Contas são GLOBAIS (sem RLS, sem contexto).
  await migrator.account.createMany({
    data: [
      { id: contaId, email: `grant-rls-${contaId}@exemplo.test`, name: 'Alvo RLS' },
      { id: contaId2, email: `grant-rls-${contaId2}@exemplo.test`, name: 'Alvo RLS 2' },
    ],
  });
  // Memberships e Pipe na Org C, com contexto (FORCE RLS sujeita até o dono).
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: membershipId, accountId: contaId, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      { id: membershipId2, accountId: contaId2, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo de concessão' } });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    // Apagar o Pipe cascateia os PipeGrants; depois a Membership; a conta global por último.
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
    await dbC.membership
      .deleteMany({ where: { id: { in: [membershipId, membershipId2] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [contaId, contaId2] } } })
      .catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel e RLS da tabela PipeGrant', () => {
  it('PipeGrant tem RLS ENABLE + FORCE e NÃO é do runtime (é do migrator)', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relname = 'PipeGrant' AND relkind = 'r' AND relnamespace = 'public'::regnamespace`;
    expect(t).toHaveLength(1);
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });
});

describe('escrita e leitura de PipeGrant com contexto (SC-226)', () => {
  it('cria uma concessão na própria Org e a enxerga; outro tenant NÃO a vê', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    grantsCriados.push(id);
    await dbC.pipeGrant.create({
      data: { id, orgId: ORG_C, pipeId, membershipId, role: 'MEMBER' },
    });
    expect((await dbC.pipeGrant.findUnique({ where: { id } }))?.id).toBe(id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.pipeGrant.findUnique({ where: { id } })).toBeNull();
    expect((await dbA.pipeGrant.findMany()).map((g) => g.id)).not.toContain(id);
  });

  it('bloqueia inserir concessão com orgId de outra Org (WITH CHECK, sem RETURNING)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.pipeGrant.createMany({
        data: [{ id: randomUUID(), orgId: ORG_A, pipeId, membershipId, role: 'VIEWER' }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('contexto ausente falha fechado (SC-226, fase vermelha)', () => {
  it('sem contexto, nenhuma concessão é visível e a escrita é negada', async () => {
    expect(await prisma.pipeGrant.findMany()).toEqual([]);
    await expect(
      prisma.pipeGrant.createMany({
        data: [{ id: randomUUID(), orgId: ORG_C, pipeId, membershipId, role: 'VIEWER' }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('no máximo um papel ATIVO por (Pipe, pessoa) — índice único parcial (SC-223)', () => {
  it('recusa a 2ª concessão ativa ao mesmo par; revogar e re-conceder funciona', async () => {
    // Usa `membershipId2` — um par (pipe, pessoa) sem concessão ativa preexistente nesta suíte.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const primeira = randomUUID();
    grantsCriados.push(primeira);
    await dbC.pipeGrant.create({
      data: { id: primeira, orgId: ORG_C, pipeId, membershipId: membershipId2, role: 'VIEWER' },
    });

    // 2ª ativa ao mesmo (pipe, pessoa) → viola o índice único parcial.
    await expect(
      dbC.pipeGrant.create({
        data: {
          id: randomUUID(),
          orgId: ORG_C,
          pipeId,
          membershipId: membershipId2,
          role: 'ADMIN',
        },
      }),
    ).rejects.toThrow(/unique|constraint|duplicate|P2002/i);

    // Revoga a primeira (soft-delete) e re-concede — o índice parcial libera o slot.
    await dbC.pipeGrant.update({
      where: { id: primeira },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });
    const reconcedida = randomUUID();
    grantsCriados.push(reconcedida);
    await expect(
      dbC.pipeGrant.create({
        data: { id: reconcedida, orgId: ORG_C, pipeId, membershipId: membershipId2, role: 'ADMIN' },
      }),
    ).resolves.toBeTruthy();
  });
});

describe('privilégio mínimo — sem exclusão definitiva (SC-226 / AC4)', () => {
  it('o runtime NÃO tem DELETE em PipeGrant: revogar é estado, não exclusão', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.pipeGrant.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
