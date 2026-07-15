import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco da MOVIMENTAÇÃO do Card (Story 2.14) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app`. Prova o que só o banco garante:
 *   1. o GRANT de UPDATE em `Card` ganhou `phaseId` (2.14), ADITIVO ao column-scoped da 2.11: mover um Card para
 *      outra Fase (do mesmo Pipe) é permitido NO CONTEXTO (count 1);
 *   2. o escopo continua column-scoped: UPDATE de `valores` e de `orgId` ainda bate em `permission denied` — o Card
 *      não é reescrito nem muda de Organização por aqui;
 *   3. a RLS segue isolando: outra Org não move o Card (count 0 — `USING`); o `WITH CHECK` da policy `card_update`
 *      (desde a 2.7) impede mover a linha para outra Org;
 *   4. sem DELETE.
 *
 * FASE VERMELHA (documentada): antes desta migration, `card-lifecycle-rls` e `kanban-rls` asseveravam que UPDATE de
 * `phaseId` batia em `permission denied` — essa era a fase vermelha. A migration `card_movement` é reversível por
 * `REVOKE UPDATE ("phaseId") ON "Card"`, que restaura aquele estado. O boundary column-scoped segue PROVADO aqui e
 * agora pelas negações de `valores`/`orgId`: se o GRANT fosse blanket, esses UPDATEs passariam.
 *
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
const phaseOrigemId = randomUUID();
const phaseDestinoId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();
const cardId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Move RLS)' } });
  await dbC.phase.create({
    data: { id: phaseOrigemId, orgId: ORG_C, pipeId, name: 'A Fazer', position: '1' },
  });
  await dbC.phase.create({
    data: { id: phaseDestinoId, orgId: ORG_C, pipeId, name: 'Fazendo', position: '2' },
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
      phaseId: phaseOrigemId,
      formId,
      formVersionId,
      idempotencyKey: 'move-rls',
      valores: {},
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

describe('GRANT column-scoped da 2.14: phaseId sim; valores/orgId não', () => {
  it('UPDATE de phaseId (mover para outra Fase do mesmo Pipe) é permitido no contexto (count 1)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const { count } = await dbC.card.updateMany({
      where: { id: cardId, phaseId: phaseOrigemId },
      data: { phaseId: phaseDestinoId },
    });
    expect(count).toBe(1);
  });

  it('UPDATE de valores ainda bate em permission denied (Card não é reescrito por aqui)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.card.updateMany({ where: { id: cardId }, data: { valores: { hack: true } } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('UPDATE de orgId ainda bate em permission denied (não se evade o tenant)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.card.updateMany({ where: { id: cardId }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE de Card ainda bate em permission denied (sem exclusão)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.card.deleteMany({ where: { id: cardId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('a movimentação respeita a RLS (isolamento por Organização)', () => {
  it('outra Org não move o Card (count 0); a própria, sim', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    const alheia = await dbA.card.updateMany({
      where: { id: cardId },
      data: { phaseId: phaseOrigemId },
    });
    expect(alheia.count).toBe(0); // RLS filtra: nenhuma linha da Org A casa este id

    const propria = await dbC.card.updateMany({
      where: { id: cardId },
      data: { phaseId: phaseOrigemId },
    });
    expect(propria.count).toBe(1);
  });
});
