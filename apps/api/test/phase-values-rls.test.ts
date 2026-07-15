import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco dos valores do Formulário de Fase (`CardPhaseValues`, Story 2.15) contra um PostgreSQL REAL,
 * pelo papel de runtime `giraffe_app`. Prova o que só o banco garante:
 *   1. a tabela é APPEND-ONLY e IMUTÁVEL: o runtime tem SELECT+INSERT, mas UPDATE e DELETE batem em
 *      `permission denied` — "sem alteração/exclusão retroativa dos valores do titular" (também LGPD) é do GRANT,
 *      não da ausência de rota (simétrico a `CardPhaseEntry`/`CardHistory`/`FormVersion`);
 *   2. a RLS isola: uma linha de outra Org some na leitura (0 linhas), e um INSERT com `orgId` alheio é barrado
 *      pelo WITH CHECK (via `createMany`, sem RETURNING — o RETURNING de `create` esbarraria na policy de SELECT e
 *      poderia mascarar um WITH CHECK desligado);
 *   3. a correção é NOVA linha (INSERT), nunca reescrita — o "conjunto corrente" é a mais recente por `createdAt`.
 * Escreve na Org C (área de escrita).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

const pipeId = randomUUID();
const phaseId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();
const cardId = randomUUID();
const valuesId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({
    data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Valores Fase RLS)' },
  });
  await dbC.phase.create({
    data: { id: phaseId, orgId: ORG_C, pipeId, name: 'A Fazer', position: '1' },
  });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'PHASE', phaseId } });
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
      idempotencyKey: 'valores-fase-rls',
      valores: {},
    },
  });
  await dbC.cardPhaseValues.create({
    data: { id: valuesId, orgId: ORG_C, cardId, phaseId, formVersionId, valores: { a: 1 } },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('CardPhaseValues é append-only: runtime SELECT+INSERT, sem UPDATE/DELETE', () => {
  it('runtime LÊ os valores da própria Org (1 linha)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const achadas = await dbC.cardPhaseValues.findMany({ where: { cardId }, select: { id: true } });
    expect(achadas.map((v) => v.id)).toContain(valuesId);
  });

  it('runtime INSERE uma nova linha (correção) da própria Org — nunca reescrita', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const nova = await dbC.cardPhaseValues.create({
      data: { orgId: ORG_C, cardId, phaseId, formVersionId, valores: { a: 2 } },
      select: { id: true },
    });
    expect(nova.id).toBeTruthy();
    // Duas linhas coexistem: a corrente é a mais recente por createdAt (histórico preservado).
    const todas = await dbC.cardPhaseValues.findMany({ where: { cardId }, select: { id: true } });
    expect(todas.length).toBeGreaterThanOrEqual(2);
  });

  it('UPDATE bate em permission denied (imutável — sem alteração retroativa dos valores)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.cardPhaseValues.updateMany({
        where: { id: valuesId },
        data: { valores: { hack: true } },
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE bate em permission denied (sem exclusão retroativa — LGPD-friendly)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.cardPhaseValues.deleteMany({ where: { id: valuesId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('CardPhaseValues respeita a RLS (isolamento por Organização)', () => {
  it('outra Org não enxerga os valores (0 linhas)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const achadas = await dbA.cardPhaseValues.findMany({ where: { cardId }, select: { id: true } });
    expect(achadas).toHaveLength(0);
  });

  it('INSERT com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    await expect(
      dbA.cardPhaseValues.createMany({
        data: [{ orgId: ORG_C, cardId, phaseId, formVersionId, valores: {} }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
