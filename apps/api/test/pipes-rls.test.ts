import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento multi-tenant do `Pipe` (Story 2.1) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` — sem BYPASSRLS, sem superuser, não é dono da tabela. Quem nega é o BANCO. Espelha
 * `rls.test.ts` (Membership) para a primeira entidade de domínio: se o Postgres estiver fora, a suíte
 * fica VERMELHA, não pulada.
 *
 * Limpeza: o runtime NÃO tem GRANT de DELETE em Pipe (é o que o épico exige e o que SC-205 prova).
 * Portanto a faxina dos Pipes criados aqui usa o papel `migrator` (dono da tabela), com contexto —
 * FORCE RLS sujeita até o dono às policies.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // área de escrita (vazia de Memberships)

/** O log é comportamento aqui; observabilidade tem sua própria suíte. */
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (dono — só para faxina)
const criados: string[] = []; // ids de Pipe a remover no final (todos na Org C)

beforeAll(async () => {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL ausente: os testes de RLS de Pipe exigem um PostgreSQL real.');
  }
  if (!migratorUrl) {
    throw new Error(
      'MIGRATION_DATABASE_URL ausente: a faxina dos Pipes de teste exige o migrator.',
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
    await db.pipe.deleteMany({ where: { id: { in: criados } } });
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel e RLS da tabela Pipe', () => {
  it('runtime é giraffe_app, sem BYPASSRLS/SUPERUSER', async () => {
    const papeis = await prisma.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(papeis[0]?.rolname).toBe('giraffe_app');
    expect(papeis[0]?.rolsuper).toBe(false);
    expect(papeis[0]?.rolbypassrls).toBe(false);
  });

  it('Pipe tem RLS ENABLE + FORCE e NÃO é do runtime (é do migrator)', async () => {
    const tabelas = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relname = 'Pipe' AND relkind = 'r' AND relnamespace = 'public'::regnamespace`;
    expect(tabelas).toHaveLength(1);
    expect(tabelas[0]?.relrowsecurity).toBe(true);
    expect(tabelas[0]?.relforcerowsecurity).toBe(true);
    expect(tabelas[0]?.dono).toBe('giraffe_migrator');
    expect(tabelas[0]?.dono).not.toBe('giraffe_app');
  });
});

describe('escrita e leitura de Pipe com contexto (SC-201 / SC-204)', () => {
  it('cria um Pipe na própria Organização e o enxerga — caminho positivo', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    criados.push(id);

    const pipe = await db.pipe.create({ data: { id, orgId: ORG_C, name: 'Pipe RLS positivo' } });
    expect(pipe.orgId).toBe(ORG_C);
    expect(pipe.state).toBe('ACTIVE');

    const lido = await db.pipe.findUnique({ where: { id } });
    expect(lido?.id).toBe(id);
  });

  it('outro tenant NÃO enxerga o Pipe da Org C', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    criados.push(id);
    await db.pipe.create({ data: { id, orgId: ORG_C, name: 'Pipe invisível para A' } });

    // Contexto da Org A: a RLS filtra — o Pipe da Org C simplesmente não está lá.
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.pipe.findUnique({ where: { id } })).toBeNull();
    expect((await dbA.pipe.findMany()).map((p) => p.id)).not.toContain(id);
  });

  it('bloqueia inserir Pipe com orgId de outra Organização (WITH CHECK, sem RETURNING)', async () => {
    // Estou na Org C e tento gravar `orgId: ORG_A`. `createMany` não emite RETURNING, então só o
    // WITH CHECK protege — como no teste equivalente de Membership.
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.pipe.createMany({ data: [{ id: randomUUID(), orgId: ORG_A, name: 'Intruso' }] }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia mover um Pipe próprio para outra Organização (WITH CHECK do UPDATE)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const id = randomUUID();
    criados.push(id);
    await db.pipe.create({ data: { id, orgId: ORG_C, name: 'Não pode migrar de tenant' } });

    // `updateMany` (sem RETURNING) faz a violação bater DIRETO no WITH CHECK do UPDATE — não passa
    // pelo filtro de SELECT, como no teste de INSERT. Se o WITH CHECK do UPDATE fosse removido, a
    // linha seria MOVIDA e este teste ficaria vermelho pela ausência da exceção, não por uma
    // mensagem colateral (fase vermelha provada sem depender da policy de leitura).
    await expect(db.pipe.updateMany({ where: { id }, data: { orgId: ORG_A } })).rejects.toThrow(
      /row-level security/i,
    );
  });
});

describe('contexto ausente falha fechado (SC-204, fase vermelha)', () => {
  it('sem contexto, nenhum Pipe é visível e a escrita é negada', async () => {
    // Client CRU (sem a extensão): current_setting devolve NULL, nenhuma policy casa.
    expect(await prisma.pipe.findMany()).toEqual([]);
    await expect(
      prisma.pipe.createMany({ data: [{ id: randomUUID(), orgId: ORG_C, name: 'Sem contexto' }] }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('privilégio mínimo — sem exclusão definitiva (SC-205 / AC3)', () => {
  it('o runtime NÃO tem DELETE em Pipe: "arquivar" é estado, não exclusão', async () => {
    // O Postgres checa o privilégio ANTES das linhas: deleteMany com filtro que não casa nada ainda
    // falha com "permission denied". Um GRANT DELETE acidental numa migration futura fica VERMELHO.
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(db.pipe.deleteMany({ where: { id: randomUUID() } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
