import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento multi-tenant de `Phase` (Story 2.3) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` — sem BYPASSRLS, não é dono da tabela. Quem nega é o BANCO. Espelha
 * `pipe-grants-rls.test.ts`.
 *
 * `Phase` referencia um `Pipe`. A Org C é a área de escrita; esta suíte cria seu próprio Pipe descartável
 * na Org C pelo migrator e o apaga no fim (apagar o Pipe cascateia as Fases; o runtime não tem DELETE).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (dono — setup e faxina)

const pipeId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS de Phase exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo de Fases (RLS)' } });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia as Fases
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel e RLS da tabela Phase', () => {
  it('Phase tem RLS ENABLE + FORCE e NÃO é do runtime (é do migrator)', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relname = 'Phase' AND relkind = 'r' AND relnamespace = 'public'::regnamespace`;
    expect(t).toHaveLength(1);
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });
});

describe('escrita e leitura de Phase com contexto (SC-238)', () => {
  it('cria uma Fase na própria Org e a enxerga; outro tenant NÃO a vê', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    await dbC.phase.create({ data: { id, orgId: ORG_C, pipeId, name: 'Fase C', position: 1 } });
    expect((await dbC.phase.findUnique({ where: { id } }))?.id).toBe(id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.phase.findUnique({ where: { id } })).toBeNull();
    expect((await dbA.phase.findMany()).map((f) => f.id)).not.toContain(id);
  });

  it('bloqueia inserir Fase com orgId de outra Org (WITH CHECK, sem RETURNING)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.phase.createMany({
        data: [{ id: randomUUID(), orgId: ORG_A, pipeId, name: 'Fase intrusa', position: 2 }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia MOVER (UPDATE) uma Fase para outra Org (WITH CHECK no UPDATE)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    await dbC.phase.create({
      data: { id, orgId: ORG_C, pipeId, name: 'Fase a mover', position: 3 },
    });
    // Tentar reescrever o orgId para a Org A: o WITH CHECK do UPDATE recusa (a linha "sairia" da Org C).
    await expect(dbC.phase.updateMany({ where: { id }, data: { orgId: ORG_A } })).rejects.toThrow(
      /row-level security/i,
    );
  });
});

describe('contexto ausente falha fechado (SC-238, fase vermelha)', () => {
  it('sem contexto, nenhuma Fase é visível e a escrita é negada', async () => {
    expect(await prisma.phase.findMany()).toEqual([]);
    await expect(
      prisma.phase.createMany({
        data: [{ id: randomUUID(), orgId: ORG_C, pipeId, name: 'Fase sem contexto', position: 4 }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('privilégio mínimo — sem exclusão definitiva (SC-238)', () => {
  it('o runtime NÃO tem DELETE em Phase: arquivar é estado, não exclusão', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.phase.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
