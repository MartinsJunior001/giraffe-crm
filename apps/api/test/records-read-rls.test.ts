import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  definirContextoOrg,
  withTenantContext,
  type TenantLogger,
} from '../src/kernel/db/tenant-context';

/**
 * Isolamento da LISTAGEM de Registros (Story 3.5) contra um PostgreSQL REAL, pelo papel de runtime `giraffe_app`.
 * A listagem é uma query RAW rodada pelo primitivo `$transaction([...definirContextoOrg, $queryRaw])` — este
 * teste prova que essa query enxerga **só** os Registros da Org do contexto (RLS aplicada mesmo em raw) e que a
 * contagem é escopada (INV-REPORT-01). Também confirma que ler não exige GRANT novo (segue `SELECT`).
 *
 * Área de escrita = Org C. Fixtures descartáveis (Database + Form DATABASE + FormVersion + Records) pelo migrator.
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

/** Roda a query de listagem crua sob o contexto de `orgId` (mesmo primitivo do RecordsReadService). */
async function listarRaw(orgId: string): Promise<{ id: string }[]> {
  const sql = Prisma.sql`SELECT "id" FROM "Record" WHERE "databaseId" = ${databaseId}::uuid ORDER BY "createdAt" DESC`;
  const res = (await prisma.$transaction([
    ...definirContextoOrg(prisma, { orgId }),
    prisma.$queryRaw<{ id: string }[]>(sql),
  ])) as unknown[];
  return res[res.length - 1] as { id: string }[];
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.database.create({ data: { id: databaseId, orgId: ORG_C, name: 'Base read RLS' } });
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
  await dbC.record.createMany({
    data: [
      {
        orgId: ORG_C,
        databaseId,
        formId,
        formVersionId,
        idempotencyKey: randomUUID(),
        valores: {},
      },
      {
        orgId: ORG_C,
        databaseId,
        formId,
        formVersionId,
        idempotencyKey: randomUUID(),
        valores: {},
      },
      {
        orgId: ORG_C,
        databaseId,
        formId,
        formVersionId,
        idempotencyKey: randomUUID(),
        valores: {},
      },
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

describe('listagem raw sob RLS', () => {
  it('vê os Registros da Org C (contagem escopada) e NADA da Org A (cross-tenant invisível)', async () => {
    const naOrgC = await listarRaw(ORG_C);
    expect(naOrgC.length).toBe(3);

    const naOrgA = await listarRaw(ORG_A);
    expect(naOrgA.length).toBe(0); // INV-REPORT-01: outra Org não enxerga nem conta
  });

  it('COUNT sob contexto respeita a RLS (Org A conta 0)', async () => {
    const countSql = Prisma.sql`SELECT COUNT(*)::int AS total FROM "Record" WHERE "databaseId" = ${databaseId}::uuid`;
    const resA = (await prisma.$transaction([
      ...definirContextoOrg(prisma, { orgId: ORG_A }),
      prisma.$queryRaw<{ total: number }[]>(countSql),
    ])) as unknown[];
    const totalA = (resA[resA.length - 1] as { total: number }[])[0]!.total;
    expect(totalA).toBe(0);
  });
});
