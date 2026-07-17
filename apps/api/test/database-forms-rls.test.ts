import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade do **Formulário de Database** (Story 3.3) contra um PostgreSQL REAL, pelo papel de
 * runtime `giraffe_app` (sem BYPASSRLS, não é dono). Prova: (1) o CHECK de coerência contexto↔owner aceita
 * `DATABASE` só com `databaseId` (e rejeita `pipeId`/sem owner — fase vermelha); (2) isolamento por Org do Form
 * de contexto DATABASE; (3) unicidade "um Form por Database" (índice parcial); (4) `FormVersion` segue IMUTÁVEL
 * (sem UPDATE/DELETE no runtime), inclusive para o contexto DATABASE.
 *
 * Área de escrita = Org C. Fixtures descartáveis (Database + contas) criadas pelo migrator; faxina no fim.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)
let migrator: PrismaClient; // dono (giraffe_migrator) — setup e faxina

const databaseId = randomUUID();
const databaseId2 = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.database.createMany({
    data: [
      { id: databaseId, orgId: ORG_C, name: 'Base com schema' },
      { id: databaseId2, orgId: ORG_C, name: 'Base 2' },
    ],
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    // Apagar o Database cascateia Form(DATABASE) → Field/FormVersion.
    await dbC.database
      .deleteMany({ where: { id: { in: [databaseId, databaseId2] } } })
      .catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('CHECK de coerência contexto↔owner (fase vermelha)', () => {
  it('aceita Form DATABASE com databaseId; rejeita sem owner e com pipeId', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Válido: DATABASE + databaseId.
    const ok = randomUUID();
    await dbC.form.create({ data: { id: ok, orgId: ORG_C, context: 'DATABASE', databaseId } });
    expect((await dbC.form.findUnique({ where: { id: ok } }))?.context).toBe('DATABASE');

    // Inválido: DATABASE sem databaseId → CHECK viola.
    await expect(
      dbC.form.createMany({ data: [{ id: randomUUID(), orgId: ORG_C, context: 'DATABASE' }] }),
    ).rejects.toThrow(/Form_context_owner_ck|check constraint|violates/i);

    // Inválido: DATABASE com pipeId (owner do contexto errado) → CHECK viola.
    await expect(
      dbC.form.createMany({
        data: [
          { id: randomUUID(), orgId: ORG_C, context: 'DATABASE', databaseId, pipeId: randomUUID() },
        ],
      }),
    ).rejects.toThrow(/Form_context_owner_ck|check constraint|violates/i);

    // Inválido: DATABASE com phaseId (owner do contexto errado) → CHECK viola.
    await expect(
      dbC.form.createMany({
        data: [
          {
            id: randomUUID(),
            orgId: ORG_C,
            context: 'DATABASE',
            databaseId,
            phaseId: randomUUID(),
          },
        ],
      }),
    ).rejects.toThrow(/Form_context_owner_ck|check constraint|violates/i);
  });
});

describe('isolamento por Organização do Formulário de Database', () => {
  it('um Form DATABASE de outra Org não é visível', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    await dbC.form.create({
      data: { id, orgId: ORG_C, context: 'DATABASE', databaseId: databaseId2 },
    });

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.form.findUnique({ where: { id } })).toBeNull();

    // Inserir Form DATABASE com orgId alheio (WITH CHECK, sem RETURNING) → negado.
    await expect(
      dbC.form.createMany({
        data: [{ id: randomUUID(), orgId: ORG_A, context: 'DATABASE', databaseId }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('unicidade "um Form por Database" (índice único parcial)', () => {
  it('recusa um 2º Form DATABASE para o mesmo Database', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // databaseId já tem um Form (criado no 1º teste). Um 2º ao mesmo Database → P2002.
    await expect(
      dbC.form.create({
        data: { id: randomUUID(), orgId: ORG_C, context: 'DATABASE', databaseId },
      }),
    ).rejects.toThrow(/unique|constraint|duplicate|P2002/i);
  });
});

describe('FormVersion permanece imutável no runtime (contexto DATABASE)', () => {
  it('o runtime NÃO tem UPDATE nem DELETE em FormVersion', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // Reusa o Form DATABASE de `databaseId2` (criado no teste de isolamento).
    const form = await dbC.form.findFirst({
      where: { context: 'DATABASE', databaseId: databaseId2 },
      select: { id: true },
    });
    expect(form).not.toBeNull();

    const versaoId = randomUUID();
    await dbC.formVersion.create({
      data: {
        id: versaoId,
        orgId: ORG_C,
        formId: form!.id,
        version: 1,
        snapshot: { fields: [] },
        revision: 'rev-teste',
      },
    });
    await expect(
      dbC.formVersion.updateMany({ where: { id: versaoId }, data: { revision: 'x' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(dbC.formVersion.deleteMany({ where: { id: versaoId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
