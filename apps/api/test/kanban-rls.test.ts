import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento da superfície de LEITURA do Kanban (Story 2.9) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app`. Prova o que só o banco garante para esta fatia:
 *   1. as leituras que o Kanban usa — `phase.findMany` (colunas), `card.findMany` (coluna) e `card.groupBy`
 *      (contagem por Fase) — respeitam a RLS: outra Org vê 0; sem contexto, 0;
 *   2. a fatia é **somente leitura**: o Kanban nunca reescreve o Card — UPDATE de `Card.valores` bate em
 *      `permission denied` (o runtime não tem esse GRANT). Nota: `phaseId` passou a ser concedido pela 2.14
 *      (movimentação); a prova do seu escopo column-scoped vive em `card-move-rls`.
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
const snapshotFixo = { formId, fields: [] } as object;

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Kanban RLS)' } });
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
      snapshot: snapshotFixo,
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
      idempotencyKey: 'kanban-rls',
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

describe('as leituras do Kanban respeitam a RLS (isolamento)', () => {
  it('phase.findMany e card.findMany: outra Org vê 0; sem contexto vê 0; a própria vê', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    expect(await dbA.phase.findMany({ where: { pipeId } })).toHaveLength(0);
    expect(await dbA.card.findMany({ where: { pipeId } })).toHaveLength(0);
    expect(await prisma.card.findMany({ where: { pipeId } })).toHaveLength(0); // sem contexto
    expect(await dbC.card.findMany({ where: { pipeId } })).toHaveLength(1);
  });

  it('card.groupBy (contagem por Fase) é filtrado pela RLS: outra Org conta 0', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    expect(
      await dbA.card.groupBy({ by: ['phaseId'], where: { pipeId }, _count: { _all: true } }),
    ).toHaveLength(0);
    const contagemC = await dbC.card.groupBy({
      by: ['phaseId'],
      where: { pipeId },
      _count: { _all: true },
    });
    expect(contagemC).toHaveLength(1);
    expect(contagemC[0]!._count._all).toBe(1);
  });
});

describe('cursor forjado não é canal de vazamento (Edge R5)', () => {
  it('paginar com um cursor de Card de OUTRA Org não devolve o Card alheio (RLS filtra o cursor)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    // Org A tenta paginar o Pipe da Org C usando o id do Card da Org C como cursor. A RLS torna tudo invisível.
    const r = await dbA.card
      .findMany({
        where: { pipeId },
        cursor: { id: cardId },
        skip: 1,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      .catch(() => [] as { id: string }[]);
    expect(r.map((c) => c.id)).not.toContain(cardId); // nunca o Card alheio
  });
});

describe('a fatia 2.9 é somente leitura — o Kanban nunca reescreve o Card (SC-295)', () => {
  it('UPDATE de Card.valores bate em permission denied (o runtime não tem esse GRANT)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.card.updateMany({ where: { id: cardId }, data: { valores: { hack: true } } }),
    ).rejects.toThrow(/permission denied/i);
  });
});
