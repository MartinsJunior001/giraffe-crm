import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco da referência de entrada na Fase (`CardPhaseEntry`, Story 2.12) contra um PostgreSQL REAL,
 * pelo papel de runtime `giraffe_app`. Prova o que só o banco garante:
 *   1. a tabela é APPEND-ONLY e IMUTÁVEL: o runtime tem SELECT+INSERT, mas UPDATE e DELETE batem em
 *      `permission denied` — "sem alteração retroativa do histórico" é do GRANT, não da ausência de rota
 *      (como `CardHistory`/`FormVersion`);
 *   2. a RLS isola: uma entrada de outra Org some na leitura (0 linhas), e um INSERT com `orgId` alheio é barrado
 *      pelo WITH CHECK (via `createMany`, sem RETURNING — o RETURNING de `create` esbarraria na policy de SELECT e
 *      poderia mascarar um WITH CHECK desligado).
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
const entryId = randomUUID();

const SNAPSHOT_NULO = {
  expectedDurationMin: null,
  dueDurationMin: null,
  expirationDurationMin: null,
  expectedFieldId: null,
  dueFieldId: null,
  expirationFieldId: null,
};

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Marcos RLS)' } });
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
      idempotencyKey: 'marcos-rls',
      valores: {},
    },
  });
  await dbC.cardPhaseEntry.create({
    data: {
      id: entryId,
      orgId: ORG_C,
      cardId,
      phaseId,
      origin: 'SUBMISSION',
      configSnapshot: SNAPSHOT_NULO,
    },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('CardPhaseEntry é append-only: runtime SELECT+INSERT, sem UPDATE/DELETE', () => {
  it('runtime LÊ a entrada da própria Org (1 linha)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const achadas = await dbC.cardPhaseEntry.findMany({ where: { cardId }, select: { id: true } });
    expect(achadas.map((e) => e.id)).toContain(entryId);
  });

  it('runtime INSERE uma nova entrada (reentrada) da própria Org', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const nova = await dbC.cardPhaseEntry.create({
      data: { orgId: ORG_C, cardId, phaseId, origin: 'MOVE', configSnapshot: SNAPSHOT_NULO },
      select: { id: true },
    });
    expect(nova.id).toBeTruthy();
  });

  it('UPDATE bate em permission denied (imutável — não há reescrita retroativa)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.cardPhaseEntry.updateMany({ where: { id: entryId }, data: { origin: 'MOVE' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE bate em permission denied (sem exclusão de histórico)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.cardPhaseEntry.deleteMany({ where: { id: entryId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('CardPhaseEntry respeita a RLS', () => {
  it('outra Org não enxerga a entrada (0 linhas)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const achadas = await dbA.cardPhaseEntry.findMany({ where: { cardId }, select: { id: true } });
    expect(achadas).toHaveLength(0);
  });

  it('INSERT com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    await expect(
      dbA.cardPhaseEntry.createMany({
        data: [
          { orgId: ORG_C, cardId, phaseId, origin: 'SUBMISSION', configSnapshot: SNAPSHOT_NULO },
        ],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
