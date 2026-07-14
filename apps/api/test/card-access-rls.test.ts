import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento das tabelas novas da Story 2.10 (`CardGrant`, `CardResponsavel`) contra um PostgreSQL REAL, pelo papel
 * de runtime `giraffe_app`. Prova o que só o banco garante:
 *   1. SELECT respeita a RLS — outra Org vê 0; sem contexto, 0; a própria vê;
 *   2. `WITH CHECK` no INSERT (via `createMany`, sem RETURNING) barra `orgId` alheio, e no UPDATE barra MOVER a
 *      linha para outra Org;
 *   3. o runtime pode UPDATE (revogar/remover é `state`) mas **não** DELETE (`permission denied`) — a "sem
 *      exclusão" é do banco, não da ausência de rota.
 * Escreve na Org C (área de escrita).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTA = '11111111-1111-1111-1111-111111111111'; // Account global (Ana) — reusada p/ um vínculo na Org C
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

const membershipId = randomUUID();
const pipeId = randomUUID();
const phaseId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();
const cardId = randomUUID();
const grantId = randomUUID();
const responsavelId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: { id: membershipId, orgId: ORG_C, accountId: CONTA, role: 'MEMBER', state: 'ACTIVE' },
  });
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (CardAccess RLS)' } });
  await dbC.phase.create({
    data: { id: phaseId, orgId: ORG_C, pipeId, name: 'A Fazer', position: '1' },
  });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId } });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId: ORG_C,
      formId,
      version: 1,
      snapshot: { formId, fields: [] },
      revision: 'r1',
    },
  });
  await dbC.card.create({
    data: {
      id: cardId,
      orgId: ORG_C,
      pipeId,
      phaseId,
      formId,
      formVersionId,
      idempotencyKey: 'ca-rls',
      valores: {},
    },
  });
  await dbC.cardGrant.create({
    data: { id: grantId, orgId: ORG_C, cardId, membershipId, podeLer: true, podeOperar: true },
  });
  await dbC.cardResponsavel.create({
    data: { id: responsavelId, orgId: ORG_C, cardId, membershipId },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
    await dbC.membership.deleteMany({ where: { id: membershipId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('SELECT de CardGrant/CardResponsavel respeita a RLS (isolamento)', () => {
  it('outra Org vê 0; sem contexto vê 0; a própria Org vê', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    expect(await dbA.cardGrant.findMany({ where: { cardId } })).toHaveLength(0);
    expect(await dbA.cardResponsavel.findMany({ where: { cardId } })).toHaveLength(0);
    expect(await prisma.cardGrant.findMany({ where: { cardId } })).toHaveLength(0); // sem contexto
    expect(await dbC.cardGrant.findMany({ where: { cardId } })).toHaveLength(1);
    expect(await dbC.cardResponsavel.findMany({ where: { cardId } })).toHaveLength(1);
  });
});

describe('WITH CHECK barra INSERT/UPDATE cross-tenant', () => {
  it('INSERT (createMany, sem RETURNING) com orgId alheio é barrado pela policy', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    // Contexto A tentando inserir uma linha marcada como Org C — o WITH CHECK do INSERT recusa.
    await expect(
      dbA.cardGrant.createMany({
        data: [{ orgId: ORG_C, cardId, membershipId, podeLer: true, podeOperar: false }],
      }),
    ).rejects.toThrow(/row-level security|violates/i);
    await expect(
      dbA.cardResponsavel.createMany({ data: [{ orgId: ORG_C, cardId, membershipId }] }),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('UPDATE que tenta MOVER a linha para outra Org é barrado pelo WITH CHECK', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.cardGrant.updateMany({ where: { id: grantId }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/row-level security|violates/i);
  });
});

describe('GRANT preciso: runtime pode UPDATE (state), não DELETE', () => {
  it('revogar (UPDATE de state) é permitido', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const { count } = await dbC.cardGrant.updateMany({
      where: { id: grantId },
      data: { state: 'REVOKED', revokedAt: new Date() },
    });
    expect(count).toBe(1);
  });

  it('DELETE de CardGrant/CardResponsavel bate em permission denied (sem GRANT de DELETE)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.cardGrant.deleteMany({ where: { cardId } })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(dbC.cardResponsavel.deleteMany({ where: { cardId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
