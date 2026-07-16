import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco em que o Histórico do Card (read-side, Story 2.17) se APOIA: `CardHistory` contra um PostgreSQL
 * REAL, pelo papel de runtime `giraffe_app`. A 2.17 não adiciona schema/GRANT — ela depende de a trilha ser
 * READ-ONLY e isolada. Prova:
 *   1. o runtime LÊ os eventos da própria Org, mas UPDATE e DELETE batem em `permission denied` (a timeline não pode
 *      ser reescrita nem apagada — GRANT SELECT/INSERT, como desde a 2.7);
 *   2. a RLS isola: os eventos de outra Org somem na leitura (0 linhas).
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
const eventId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Hist RLS)' } });
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
      idempotencyKey: 'hist-rls',
      valores: {},
    },
  });
  await dbC.cardHistory.create({
    data: { id: eventId, orgId: ORG_C, cardId, type: 'CREATED', summary: 'Card criado' },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('CardHistory é read-only para a timeline (SELECT sim; UPDATE/DELETE não)', () => {
  it('runtime LÊ os eventos da própria Org', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const eventos = await dbC.cardHistory.findMany({ where: { cardId }, select: { id: true } });
    expect(eventos.map((e) => e.id)).toContain(eventId);
  });

  it('UPDATE bate em permission denied (a timeline não é reescrita)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.cardHistory.updateMany({ where: { id: eventId }, data: { summary: 'HACK' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE bate em permission denied (a timeline não é apagada)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.cardHistory.deleteMany({ where: { id: eventId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('CardHistory respeita a RLS (isolamento por Organização)', () => {
  it('outra Org não enxerga os eventos (0 linhas)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const eventos = await dbA.cardHistory.findMany({ where: { cardId }, select: { id: true } });
    expect(eventos).toHaveLength(0);
  });
});
