import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento multi-tenant de `Form` e `Field` (Story 2.4) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` — sem BYPASSRLS, não é dono das tabelas. Quem nega é o BANCO. Espelha `phases-rls.test.ts`.
 *
 * A Org C é a área de escrita: esta suíte cria seu próprio Pipe + Form (PIPE_INITIAL) descartáveis pelo
 * migrator e os apaga no fim (apagar o Pipe cascateia Form e Field; o runtime não tem DELETE).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (dono — setup e faxina)

const pipeId = randomUUID();
const formId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: RLS de Form/Field exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo de Forms (RLS)' } });
  await dbC.form.create({
    data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia Form e Field
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel e RLS das tabelas Form e Field', () => {
  it.each(['Form', 'Field'])(
    '%s tem RLS ENABLE + FORCE e é do migrator, não do runtime',
    async (rel) => {
      const t = await prisma.$queryRawUnsafe<
        { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >(
        `SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relname = $1 AND relkind = 'r' AND relnamespace = 'public'::regnamespace`,
        rel,
      );
      expect(t).toHaveLength(1);
      expect(t[0]?.relrowsecurity).toBe(true);
      expect(t[0]?.relforcerowsecurity).toBe(true);
      expect(t[0]?.dono).toBe('giraffe_migrator');
    },
  );
});

describe('escrita e leitura de Field com contexto (SC-248)', () => {
  it('cria um Campo na própria Org e o enxerga; outro tenant NÃO o vê', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    await dbC.field.create({
      data: { id, orgId: ORG_C, formId, label: 'Campo C', type: 'TEXT_SHORT', position: 1 },
    });
    expect((await dbC.field.findUnique({ where: { id } }))?.id).toBe(id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.field.findUnique({ where: { id } })).toBeNull();
    expect((await dbA.field.findMany()).map((c) => c.id)).not.toContain(id);
  });

  it('bloqueia inserir Campo com orgId de outra Org (WITH CHECK, sem RETURNING)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.field.createMany({
        data: [
          {
            id: randomUUID(),
            orgId: ORG_A,
            formId,
            label: 'intruso',
            type: 'TEXT_SHORT',
            position: 2,
          },
        ],
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia MOVER (UPDATE) um Campo para outra Org (WITH CHECK no UPDATE)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    await dbC.field.create({
      data: { id, orgId: ORG_C, formId, label: 'a mover', type: 'NUMBER', position: 3 },
    });
    await expect(dbC.field.updateMany({ where: { id }, data: { orgId: ORG_A } })).rejects.toThrow(
      /row-level security/i,
    );
  });
});

describe('bloqueia inserir Form de outra Org (WITH CHECK)', () => {
  it('createMany de Form com orgId alheio é negado', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.form.createMany({
        data: [{ id: randomUUID(), orgId: ORG_A, context: 'PIPE_INITIAL', pipeId }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('contexto ausente falha fechado (SC-248, fase vermelha)', () => {
  it('sem contexto, nenhum Form/Field é visível e a escrita é negada', async () => {
    expect(await prisma.form.findMany()).toEqual([]);
    expect(await prisma.field.findMany()).toEqual([]);
    await expect(
      prisma.field.createMany({
        data: [
          { id: randomUUID(), orgId: ORG_C, formId, label: 'sem ctx', type: 'URL', position: 4 },
        ],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('privilégio mínimo — sem exclusão definitiva (SC-248)', () => {
  it('o runtime NÃO tem DELETE em Field nem em Form', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.field.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
    await expect(dbC.form.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
