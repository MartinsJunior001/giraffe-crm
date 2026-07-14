import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e IMUTABILIDADE de `Card`/`CardHistory` (Story 2.7) contra um PostgreSQL REAL, pelo papel de
 * runtime `giraffe_app`. Prova o que só o banco garante:
 *   1. RLS ENABLE+FORCE em `Card` e `CardHistory`: outra Org não vê nem insere linha alheia; sem contexto, nada;
 *   2. Card SEM DELETE pelo GRANT — um Card não é apagável (bate `permission denied`), independentemente de rota;
 *   3. CardHistory APPEND-ONLY pelo GRANT — o runtime tem SELECT/INSERT, mas NÃO UPDATE nem DELETE: o histórico
 *      não pode ser reescrito nem apagado (trilha inviolável — AD-13);
 *   4. idempotência estrutural: `@@unique([orgId, formId, idempotencyKey])` barra a 2ª submissão da mesma chave
 *      (P2002) — é o backstop que garante 1 submissão lógica ≤ 1 Card, no banco.
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

  // Fixtures na Org C, pelo migrator (dono do schema): Pipe → Fase → Form → FormVersion → Card + evento.
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Cards RLS)' } });
  await dbC.phase.create({
    data: { id: phaseId, orgId: ORG_C, pipeId, name: 'Triagem', position: '1' },
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
      idempotencyKey: 'fixa-rls',
      valores: {},
    },
  });
  await dbC.cardHistory.create({
    data: { orgId: ORG_C, cardId, type: 'CREATED', summary: 'fixture' },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia Fase/Form/Version/Card/History
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('RLS de Card respeita o contexto (isolamento)', () => {
  it('outra Org não vê o Card; sem contexto não vê; a própria Org vê', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    expect(await dbA.card.findMany({ where: { id: cardId } })).toHaveLength(0); // Org A não enxerga
    expect(await prisma.card.findMany({ where: { id: cardId } })).toHaveLength(0); // sem contexto
    expect(await dbC.card.findMany({ where: { id: cardId } })).toHaveLength(1); // a própria Org
  });

  it('INSERT de Card com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.card.createMany({
        data: [
          {
            orgId: ORG_A, // dado marcado como Org A sob contexto Org C
            pipeId,
            phaseId,
            formId,
            formVersionId,
            idempotencyKey: 'cross',
            valores: {},
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe('Card só SELECT+INSERT pelo GRANT (SC-277)', () => {
  it('o runtime não tem GRANT de DELETE em Card — um Card não é apagável', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.card.deleteMany({ where: { id: cardId } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('o runtime não tem GRANT de UPDATE em Card na 2.7 — nada de mutar Card antes do consumidor (2.9/2.11)', async () => {
    // A 2.7 só CRIA Card; conceder UPDATE agora seria privilégio sem consumidor nem teste de escopo. Move de Fase
    // / evolução de estado (que usam UPDATE) chegam na 2.9/2.11, com o GRANT e este teste ampliados junto.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.card.updateMany({ where: { id: cardId }, data: { idempotencyKey: 'mutada' } }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('CardHistory APPEND-ONLY pelo GRANT — trilha inviolável (SC-278)', () => {
  it('o runtime não tem GRANT de UPDATE em CardHistory — evento não é reescrito', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.cardHistory.updateMany({ where: { cardId }, data: { summary: 'adulterado' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o runtime não tem GRANT de DELETE em CardHistory — evento não some', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.cardHistory.deleteMany({ where: { cardId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('idempotência estrutural — UNIQUE barra a mesma chave (SC-272)', () => {
  it('inserir a MESMA (orgId, formId, idempotencyKey) uma 2ª vez viola o UNIQUE (P2002)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // A chave 'fixa-rls' já existe (fixture). Uma segunda submissão lógica com a mesma chave colide.
    await expect(
      dbC.card.create({
        data: {
          orgId: ORG_C,
          pipeId,
          phaseId,
          formId,
          formVersionId,
          idempotencyKey: 'fixa-rls',
          valores: {},
        },
      }),
    ).rejects.toThrow();
  });
});
