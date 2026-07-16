import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento multi-tenant do `Database` (Story 3.1) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` — sem BYPASSRLS, sem superuser, não é dono da tabela. Quem nega é o BANCO. Espelha
 * `pipes-rls.test.ts` para a primeira entidade de domínio do Épico 3: se o Postgres estiver fora, a
 * suíte fica VERMELHA, não pulada (banco indisponível é falha, não ausência de evidência).
 *
 * Prova o CA6 (AC5): dois tenants, cada um só vê os próprios Databases; INSERT/UPDATE com `orgId`
 * alheio negados pelo banco (FORCE RLS + WITH CHECK); e o CA5 (AC4): runtime SEM GRANT de DELETE.
 *
 * Limpeza: o runtime NÃO tem GRANT de DELETE em Database (é o que a Story exige). Portanto a faxina
 * usa o papel `migrator` (dono da tabela), com contexto — FORCE RLS sujeita até o dono às policies.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // área de escrita (vazia de Memberships)

/** O log é comportamento aqui; observabilidade tem sua própria suíte. */
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (dono — só para faxina)
const criados: string[] = []; // ids de Database a remover no final (todos na Org C)

beforeAll(async () => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ausente: os testes de RLS de Database exigem um PostgreSQL real.');
  }
  if (!migratorUrl) {
    throw new Error(
      'MIGRATION_DATABASE_URL ausente: a faxina dos Databases de teste exige o migrator.',
    );
  }
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  // Faxina pelo dono, com contexto da Org C (FORCE RLS aplica a policy também ao dono).
  if (migrator && criados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await db.database.deleteMany({ where: { id: { in: criados } } });
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel e RLS da tabela Database', () => {
  it('runtime é giraffe_app, sem BYPASSRLS/SUPERUSER', async () => {
    const papeis = await prisma.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(papeis[0]?.rolname).toBe('giraffe_app');
    expect(papeis[0]?.rolsuper).toBe(false);
    expect(papeis[0]?.rolbypassrls).toBe(false);
  });

  it('Database tem RLS ENABLE + FORCE e NÃO é do runtime (é do migrator)', async () => {
    const tabelas = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relname = 'Database' AND relkind = 'r' AND relnamespace = 'public'::regnamespace`;
    expect(tabelas).toHaveLength(1);
    expect(tabelas[0]?.relrowsecurity).toBe(true);
    expect(tabelas[0]?.relforcerowsecurity).toBe(true);
    expect(tabelas[0]?.dono).toBe('giraffe_migrator');
    expect(tabelas[0]?.dono).not.toBe('giraffe_app');
  });
});

describe('escrita e leitura de Database com contexto (CA6 / AC5)', () => {
  it('cria um Database na própria Organização e o enxerga — caminho positivo', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    criados.push(id);

    const base = await db.database.create({ data: { id, orgId: ORG_C, name: 'Base RLS positiva' } });
    expect(base.orgId).toBe(ORG_C);
    expect(base.state).toBe('ACTIVE');
    expect(base.archivedAt).toBeNull();

    const lido = await db.database.findUnique({ where: { id } });
    expect(lido?.id).toBe(id);
  });

  it('outro tenant NÃO enxerga o Database da Org C', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    criados.push(id);
    await db.database.create({ data: { id, orgId: ORG_C, name: 'Base invisível para A' } });

    // Contexto da Org A: a RLS filtra — o Database da Org C simplesmente não está lá.
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.database.findUnique({ where: { id } })).toBeNull();
    expect((await dbA.database.findMany()).map((d) => d.id)).not.toContain(id);
  });

  it('bloqueia inserir Database com orgId de outra Organização (WITH CHECK, sem RETURNING)', async () => {
    // Estou na Org C e tento gravar `orgId: ORG_A`. `createMany` não emite RETURNING, então só o
    // WITH CHECK protege — um `create` esbarraria antes na policy de SELECT e ficaria verde pelo
    // motivo errado (armadilha já vivida nesta base).
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.database.createMany({ data: [{ id: randomUUID(), orgId: ORG_A, name: 'Intruso' }] }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia mover um Database próprio para outra Organização (WITH CHECK do UPDATE)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    criados.push(id);
    await db.database.create({ data: { id, orgId: ORG_C, name: 'Não pode migrar de tenant' } });

    // `updateMany` (sem RETURNING) faz a violação bater DIRETO no WITH CHECK do UPDATE. Sem esse
    // WITH CHECK, a linha seria MOVIDA para outra Org e este teste ficaria vermelho pela ausência da
    // exceção — fase vermelha provada sem depender da policy de leitura.
    await expect(db.database.updateMany({ where: { id }, data: { orgId: ORG_A } })).rejects.toThrow(
      /row-level security/i,
    );
  });
});

describe('contexto ausente falha fechado', () => {
  it('sem contexto, nenhum Database é visível e a escrita é negada', async () => {
    // Client CRU (sem a extensão): `current_org_id()` devolve NULL, nenhuma policy casa.
    expect(await prisma.database.findMany()).toEqual([]);
    await expect(
      prisma.database.createMany({ data: [{ id: randomUUID(), orgId: ORG_C, name: 'Sem contexto' }] }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('privilégio mínimo — sem exclusão definitiva (CA5 / AC4)', () => {
  it('o runtime NÃO tem DELETE em Database: "arquivar" é estado, não exclusão', async () => {
    // O Postgres checa o privilégio ANTES das linhas: deleteMany com filtro que não casa nada ainda
    // falha com "permission denied". Um GRANT DELETE acidental numa migration futura fica VERMELHO.
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(db.database.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
