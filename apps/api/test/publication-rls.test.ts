import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e IMUTABILIDADE de `FormVersion` (Story 2.6) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app`. Prova três coisas que só o banco garante:
 *   1. RLS ENABLE+FORCE: outra Org não vê nem insere versão alheia; sem contexto, nada;
 *   2. IMUTABILIDADE pelo GRANT: o runtime NÃO tem UPDATE nem DELETE em `FormVersion` — uma versão publicada
 *      não pode ser alterada nem apagada (bate em `permission denied`), independentemente de rota;
 *   3. numeração monotônica: `@@unique([orgId, formId, version])` barra número duplicado (P2002).
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
const formId = randomUUID();

const snapshotFixo = { formId, fields: [] } as object;

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({
    data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Publication RLS)' },
  });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId } });
  await dbC.formVersion.create({
    data: { orgId: ORG_C, formId, version: 1, snapshot: snapshotFixo, revision: 'r1' },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia Form e FormVersion
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('RLS de FormVersion respeita o contexto (isolamento)', () => {
  it('outra Org não vê a versão; sem contexto não vê; a própria Org vê', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    expect(await dbA.formVersion.findMany({ where: { formId } })).toHaveLength(0); // Org A não enxerga
    expect(await prisma.formVersion.findMany({ where: { formId } })).toHaveLength(0); // sem contexto
    expect(await dbC.formVersion.findMany({ where: { formId } })).toHaveLength(1); // a própria Org
  });

  it('INSERT com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    // Contexto Org C, mas dado marcado como Org A: o WITH CHECK do INSERT rejeita. `createMany` não tem
    // RETURNING — não esbarra na policy de SELECT, isolando a prova do WITH CHECK (lição 2.2/2.4).
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.formVersion.createMany({
        data: [{ orgId: ORG_A, formId, version: 99, snapshot: snapshotFixo, revision: 'x' }],
      }),
    ).rejects.toThrow();
  });
});

describe('IMUTABILIDADE pelo GRANT — runtime sem UPDATE/DELETE em FormVersion (SC-262)', () => {
  it('o runtime não tem GRANT de UPDATE em FormVersion — versão publicada é inalterável', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.formVersion.updateMany({ where: { formId }, data: { revision: 'adulterada' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o runtime não tem GRANT de DELETE em FormVersion — versão publicada não some', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.formVersion.deleteMany({ where: { formId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('numeração monotônica — UNIQUE barra número duplicado (SC-263)', () => {
  it('inserir a MESMA (orgId, formId, version) uma segunda vez viola o UNIQUE (P2002)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // A versão 1 já existe (fixture). Uma segunda versão 1 do mesmo Form colide — é o backstop de concorrência.
    await expect(
      dbC.formVersion.create({
        data: { orgId: ORG_C, formId, version: 1, snapshot: snapshotFixo, revision: 'r1-bis' },
      }),
    ).rejects.toThrow();
  });
});
