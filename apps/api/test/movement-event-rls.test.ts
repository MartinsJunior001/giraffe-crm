import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco do EVENTO CANÔNICO de movimentação (`MovementEvent`, Story 2.16) contra um PostgreSQL REAL,
 * pelo papel de runtime `giraffe_app`. Prova o que só o banco garante:
 *   1. a tabela é APPEND-ONLY e IMUTÁVEL: o runtime tem SELECT+INSERT, mas UPDATE e DELETE batem em
 *      `permission denied` — "sem alteração/exclusão do evento canônico" é do GRANT (como CardHistory/FormVersion);
 *   2. a idempotência lógica: um 2º INSERT com o MESMO `(orgId, eventId)` é rejeitado pelo UNIQUE (CA3);
 *   3. a RLS isola: um evento de outra Org some na leitura (0 linhas), e um INSERT com `orgId` alheio é barrado pelo
 *      WITH CHECK (via `createMany`, sem RETURNING — o RETURNING de `create` esbarraria na policy de SELECT e poderia
 *      mascarar um WITH CHECK desligado).
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
const eventRowId = randomUUID();
const eventId = randomUUID();
const correlationId = randomUUID();

function dadosEvento(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orgId: ORG_C,
    eventId,
    pipeId,
    cardId,
    sourcePhaseId: phaseOrigemId,
    targetPhaseId: phaseDestinoId,
    origin: 'MOVE',
    correlationId,
    type: 'CARD_MOVED',
    version: 1,
    payload: {},
    ...over,
  };
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Evento RLS)' } });
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
      idempotencyKey: 'evento-rls',
      valores: {},
    },
  });
  await dbC.movementEvent.create({ data: { id: eventRowId, ...dadosEvento() } as never });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('MovementEvent é append-only: runtime SELECT+INSERT, sem UPDATE/DELETE', () => {
  it('runtime LÊ o evento da própria Org (1 linha)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const achados = await dbC.movementEvent.findMany({ where: { cardId }, select: { id: true } });
    expect(achados.map((e) => e.id)).toContain(eventRowId);
  });

  it('runtime INSERE um novo evento (outra operação) da própria Org', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const nova = await dbC.movementEvent.create({
      data: dadosEvento({ eventId: randomUUID(), correlationId: randomUUID() }) as never,
      select: { id: true },
    });
    expect(nova.id).toBeTruthy();
  });

  it('UPDATE bate em permission denied (imutável — evento não é reescrito)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.movementEvent.updateMany({ where: { id: eventRowId }, data: { type: 'HACK' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE bate em permission denied (sem exclusão do evento canônico)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.movementEvent.deleteMany({ where: { id: eventRowId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('MovementEvent — idempotência lógica e RLS', () => {
  it('2º INSERT com o mesmo (orgId, eventId) é rejeitado pelo UNIQUE (CA3)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.movementEvent.create({ data: dadosEvento() as never })).rejects.toThrow(
      /unique|constraint|P2002/i,
    );
  });

  it('outra Org não enxerga o evento (0 linhas)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const achados = await dbA.movementEvent.findMany({ where: { cardId }, select: { id: true } });
    expect(achados).toHaveLength(0);
  });

  it('INSERT com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    await expect(
      dbA.movementEvent.createMany({
        data: [dadosEvento({ eventId: randomUUID(), correlationId: randomUUID() })] as never,
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
