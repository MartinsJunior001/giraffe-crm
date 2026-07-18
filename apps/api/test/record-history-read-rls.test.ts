import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento da LEITURA do Histórico do Registro (Story 3.6) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app`. O read-side lê `RecordHistory` via `findMany` do modelo embrulhado por `withTenantContext` — este
 * teste prova que essa leitura enxerga **só** os eventos da Org do contexto (RLS por `orgId`), e que ler não exige
 * GRANT novo (segue `SELECT`; `RecordHistory` é append-only desde 3.4). A timeline de outra Org é invisível.
 *
 * Área de escrita = Org C. Fixtures descartáveis (Database + Form + FormVersion + Record + RecordHistory) pelo
 * migrator.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;

const databaseId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();
const recordId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.database.create({ data: { id: databaseId, orgId: ORG_C, name: 'Base hist RLS' } });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'DATABASE', databaseId } });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId: ORG_C,
      formId,
      version: 1,
      snapshot: { fields: [] },
      revision: 'r',
    },
  });
  await dbC.record.create({
    data: {
      id: recordId,
      orgId: ORG_C,
      databaseId,
      formId,
      formVersionId,
      idempotencyKey: randomUUID(),
      valores: {},
    },
  });
  await dbC.recordHistory.createMany({
    data: [
      { orgId: ORG_C, recordId, type: 'CREATED', summary: 'Registro criado' },
      { orgId: ORG_C, recordId, type: 'VALUES_UPDATED', summary: 'Valores atualizados' },
      { orgId: ORG_C, recordId, type: 'ARCHIVED', summary: 'Registro arquivado' },
    ],
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.database.deleteMany({ where: { id: databaseId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('leitura do Histórico sob RLS', () => {
  it('vê os eventos da Org C (contagem escopada) e NADA da Org A (cross-tenant invisível)', async () => {
    const naOrgC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const eventosC = await naOrgC.recordHistory.findMany({ where: { recordId } });
    expect(eventosC.length).toBe(3);

    const naOrgA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const eventosA = await naOrgA.recordHistory.findMany({ where: { recordId } });
    expect(eventosA.length).toBe(0); // outra Org não enxerga a timeline alheia

    // O próprio Registro também é invisível para a Org A (o gate de acesso cai antes, mas provamos a RLS).
    const recordA = await naOrgA.record.findFirst({ where: { id: recordId, databaseId } });
    expect(recordA).toBeNull();
  });

  it('COUNT sob contexto respeita a RLS (Org A conta 0)', async () => {
    const naOrgA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await naOrgA.recordHistory.count({ where: { recordId } })).toBe(0);
    const naOrgC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    expect(await naOrgC.recordHistory.count({ where: { recordId } })).toBe(3);
  });
});
