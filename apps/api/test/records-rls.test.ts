import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `Record`/`RecordHistory` (Story 3.4) contra um PostgreSQL REAL, pelo papel de
 * runtime `giraffe_app` (sem BYPASSRLS, não é dono). Prova: (1) isolamento por Org; (2) `WITH CHECK` no INSERT
 * (orgId alheio negado — fase vermelha); (3) GRANT column-scoped — o runtime UPDATE só `lifecycleState`/`valores`/
 * `updatedAt`; `databaseId`/`orgId`/`formVersionId` → **permission denied**; e **sem DELETE** em `Record`;
 * (4) idempotência por índice único (P2002); (5) `RecordHistory` IMUTÁVEL (sem UPDATE/DELETE).
 *
 * Área de escrita = Org C. Fixtures descartáveis (Database + Form DATABASE + FormVersion) criadas pelo migrator.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)
let migrator: PrismaClient; // dono (giraffe_migrator) — setup e faxina

const databaseId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.database.create({ data: { id: databaseId, orgId: ORG_C, name: 'Base RLS' } });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'DATABASE', databaseId } });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId: ORG_C,
      formId,
      version: 1,
      snapshot: { fields: [] },
      revision: 'rev-rls',
    },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.database.deleteMany({ where: { id: databaseId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

/** Cria um Record (runtime) na Org C e devolve seu id. */
async function criarRecord(idempotencyKey: string): Promise<string> {
  const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const rec = await dbC.record.create({
    data: { orgId: ORG_C, databaseId, formId, formVersionId, idempotencyKey, valores: {} },
    select: { id: true },
  });
  return rec.id;
}

describe('isolamento por Organização', () => {
  it('um Record da Org C não é visível pela Org A; INSERT com orgId alheio é negado', async () => {
    const id = await criarRecord(randomUUID());
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.record.findUnique({ where: { id } })).toBeNull();

    // Inserir com orgId alheio (WITH CHECK, sem RETURNING via createMany) → negado.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.record.createMany({
        data: [{ orgId: ORG_A, databaseId, formId, formVersionId, idempotencyKey: randomUUID() }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('idempotência (índice único)', () => {
  it('recusa um 2º Record com a mesma (orgId, databaseId, idempotencyKey)', async () => {
    const chave = randomUUID();
    await criarRecord(chave);
    await expect(criarRecord(chave)).rejects.toThrow(/unique|constraint|duplicate|P2002/i);
  });
});

describe('GRANT column-scoped (o runtime UPDATE só lifecycleState/valores/updatedAt)', () => {
  it('UPDATE de lifecycleState e valores OK; databaseId/orgId/formVersionId → permission denied; sem DELETE', async () => {
    const id = await criarRecord(randomUUID());
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Colunas concedidas: OK.
    await expect(
      dbC.record.updateMany({ where: { id }, data: { lifecycleState: 'ARQUIVADO' } }),
    ).resolves.toBeTruthy();
    await expect(
      dbC.record.updateMany({ where: { id }, data: { valores: { x: 1 } } }),
    ).resolves.toBeTruthy();

    // Colunas NÃO concedidas: permission denied (não transferível — RN-063; definição congelada — AD-12).
    await expect(
      dbC.record.updateMany({ where: { id }, data: { databaseId: randomUUID() } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.record.updateMany({ where: { id }, data: { formVersionId: randomUUID() } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(dbC.record.updateMany({ where: { id }, data: { orgId: ORG_A } })).rejects.toThrow(
      /permission denied/i,
    );

    // Sem DELETE (sem exclusão física — LGPD).
    await expect(dbC.record.deleteMany({ where: { id } })).rejects.toThrow(/permission denied/i);
  });
});

describe('RecordHistory permanece imutável no runtime', () => {
  it('o runtime NÃO tem UPDATE nem DELETE em RecordHistory', async () => {
    const recordId = await criarRecord(randomUUID());
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const evento = await dbC.recordHistory.create({
      data: { orgId: ORG_C, recordId, type: 'CREATED', summary: 'x' },
      select: { id: true },
    });
    await expect(
      dbC.recordHistory.updateMany({ where: { id: evento.id }, data: { summary: 'y' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(dbC.recordHistory.deleteMany({ where: { id: evento.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
