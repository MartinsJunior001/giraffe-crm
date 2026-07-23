import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e FRONTEIRA DE PRIVILÉGIO da tabela de prevenção de ciclo `AutomationChainVisit` (Story 4.7) e a
 * IMUTABILIDADE de `chainDepth` — contra um PostgreSQL REAL, pelo papel `giraffe_app`. Quem nega é o BANCO.
 * Postgres fora ⇒ suíte VERMELHA, não pulada.
 *
 * Prova os pontos de RISCO ALTO:
 *  · `AutomationChainVisit`: GRANT SÓ `SELECT/INSERT` (append-only) — UPDATE e DELETE NEGADOS; RLS FORCE + WITH CHECK.
 *  · A cadeia é POR ORGANIZAÇÃO (g): a mesma `(executionChainId, signature)` em DUAS Orgs NÃO colide (o `orgId`
 *    entra no índice único) — um `executionChainId` nunca cruza tenant; e o cross-tenant read é invisível (RLS).
 *  · `AutomationExecution.chainDepth` é IMUTÁVEL por GRANT (fora do UPDATE column-scoped) — não migra de nível.
 *
 * Escrita sempre na **Org C** (e Org A onde o teste exige duas Orgs) com recursos descartáveis (`randomUUID`).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;

const visitas: { chainId: string; orgId: string }[] = [];
const pipes: { id: string; orgId: string }[] = [];
const automacoes: { id: string; orgId: string }[] = [];
const execucoes: { id: string; orgId: string }[] = [];

async function criarVisita(orgId: string, chainId: string, signature: string): Promise<void> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  await db.automationChainVisit.create({
    data: { orgId, executionChainId: chainId, signature, eventId: randomUUID(), executionId: randomUUID() },
  });
  visitas.push({ chainId, orgId });
}

async function criarExecucao(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-4-7-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipes.push({ id: pipe.id, orgId });
  const auto = await db.automation.create({
    data: {
      orgId,
      pipeId: pipe.id,
      name: `auto-4-7-${randomUUID().slice(0, 8)}`,
      quando: { tipo: 'CARD_CREATED', refs: [] },
      entao: [{ tipo: 'CARD_ARCHIVE', parametros: {}, refs: [] }],
    },
    select: { id: true },
  });
  automacoes.push({ id: auto.id, orgId });
  const exec = await db.automationExecution.create({
    data: {
      orgId,
      eventId: randomUUID(),
      automationId: auto.id,
      automationVersionId: 1,
      configSnapshotRevision: 'rev',
      pipeId: pipe.id,
      initiatorType: 'SISTEMA',
      correlationId: randomUUID(),
      executionChainId: randomUUID(),
      chainDepth: 0,
    },
    select: { id: true },
  });
  execucoes.push({ id: exec.id, orgId });
  return exec.id;
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: os testes de RLS de 4.7 exigem um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  if (migrator) {
    for (const { chainId, orgId } of visitas) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.automationChainVisit.deleteMany({ where: { executionChainId: chainId } });
    }
    for (const { id, orgId } of execucoes) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.automationExecution.deleteMany({ where: { id } });
    }
    for (const { id, orgId } of automacoes) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.automation.deleteMany({ where: { id } });
    }
    for (const { id, orgId } of pipes) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.pipe.deleteMany({ where: { id } });
    }
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('propriedade e RLS de AutomationChainVisit', () => {
  it('tem RLS ENABLE + FORCE e é do migrator, não do runtime', async () => {
    const t = await prisma.$queryRawUnsafe<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >(
      `SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'AutomationChainVisit'`,
    );
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });

  it('tem as 4 policies, com WITH CHECK no INSERT e no UPDATE', async () => {
    const policies = await prisma.$queryRawUnsafe<{ cmd: string; withcheck: string | null }[]>(
      `SELECT cmd, with_check::text AS withcheck FROM pg_policies WHERE tablename = 'AutomationChainVisit'`,
    );
    expect(policies.map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    expect(policies.find((p) => p.cmd === 'INSERT')?.withcheck).toContain('current_org_id()');
    expect(policies.find((p) => p.cmd === 'UPDATE')?.withcheck).toContain('current_org_id()');
  });
});

describe('GRANT como fronteira — AutomationChainVisit é append-only', () => {
  it('no nível da TABELA o runtime tem SÓ SELECT/INSERT', async () => {
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'AutomationChainVisit' AND grantee = 'giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('INSERT permitido; UPDATE e DELETE NEGADOS (fase vermelha do GRANT)', async () => {
    const chainId = randomUUID();
    await criarVisita(ORG_C, chainId, `sig-${randomUUID()}`);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationChainVisit.updateMany({
        where: { executionChainId: chainId },
        data: { signature: 'outra' },
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.automationChainVisit.deleteMany({ where: { executionChainId: chainId } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('prevenção de ciclo: a 2ª visita da mesma (cadeia, assinatura) colide (unique)', async () => {
    const chainId = randomUUID();
    const sig = `sig-${randomUUID()}`;
    await criarVisita(ORG_C, chainId, sig);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationChainVisit.create({
        data: {
          orgId: ORG_C,
          executionChainId: chainId,
          signature: sig,
          eventId: randomUUID(),
          executionId: randomUUID(),
        },
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });
});

describe('(g) a cadeia é POR ORGANIZAÇÃO — nunca cruza tenant', () => {
  it('a MESMA (cadeia, assinatura) em Orgs distintas NÃO colide (o orgId entra no índice único)', async () => {
    const chainId = randomUUID();
    const sig = `sig-${randomUUID()}`;
    await criarVisita(ORG_C, chainId, sig);
    // A MESMA assinatura na MESMA cadeia, porém em OUTRA Org, é aceita — um ciclo de uma Org não barra a outra.
    await expect(criarVisita(ORG_A, chainId, sig)).resolves.toBeUndefined();
  });

  it('cross-tenant read invisível — Org A não enxerga a visita da Org C (RLS)', async () => {
    const chainId = randomUUID();
    await criarVisita(ORG_C, chainId, `sig-${randomUUID()}`);
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.automationChainVisit.findMany({ where: { executionChainId: chainId } })).toEqual([]);
  });

  it('sem contexto de Organização, nada é visível (deny-by-default)', async () => {
    expect(await prisma.automationChainVisit.findMany({ take: 1 })).toEqual([]);
  });
});

describe('chainDepth é IMUTÁVEL por GRANT (não migra de nível)', () => {
  it('AutomationExecution: UPDATE de `chainDepth` é NEGADO (fora do UPDATE column-scoped)', async () => {
    const execId = await criarExecucao(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationExecution.updateMany({ where: { id: execId }, data: { chainDepth: 9 } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('AutomationExecution: `chainDepth` NÃO está entre as colunas de UPDATE do runtime', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'AutomationExecution' AND grantee = 'giraffe_app' AND privilege_type = 'UPDATE'`;
    expect(cols.map((c) => c.column_name)).not.toContain('chainDepth');
  });
});
