import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e FRONTEIRA DE PRIVILÉGIO das tabelas do MOTOR (Story 4.6) — `AutomationExecution` (ledger, UPDATE
 * COLUMN-SCOPED) e `AutomationActionResult` (append-only) — contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app`. Quem nega é o BANCO. Postgres fora ⇒ suíte VERMELHA, não pulada.
 *
 * Prova o ponto de RISCO ALTO da Story: o GRANT como fronteira.
 *   · Execution: GRANT `SELECT/INSERT` + UPDATE só das colunas de PROGRESSO; **UPDATE de `eventId`/`automationId`
 *     é NEGADO** (`permission denied`) — uma Execução não migra de evento/Automação; **DELETE negado**.
 *   · Result: GRANT SÓ `SELECT/INSERT`; **UPDATE e DELETE negados** (append-only imutável, como CardHistory).
 *   · RLS FORCE + WITH CHECK (INSERT e UPDATE); isolamento cross-tenant.
 *   · FK COMPOSTA tenant-safe `(orgId, automationId)`/`(orgId, executionId)`.
 *
 * Escrita sempre na **Org C** com Pipe/Automação descartáveis (`randomUUID`) — nunca fixtures de leitura
 * (TEST-ISO-01). O afrouxamento do GRANT para observar a fase vermelha é drill MANUAL em banco descartável,
 * registrado no PR (débito L1, como `domain-events-rls`/`automations-rls`).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;

const pipes: { id: string; orgId: string }[] = [];
const automacoes: { id: string; orgId: string }[] = [];
const execucoes: { id: string; orgId: string }[] = [];

async function criarPipe(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-4-6-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipes.push({ id: pipe.id, orgId });
  return pipe.id;
}

async function criarAutomacao(orgId: string, pipeId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const auto = await db.automation.create({
    data: {
      orgId,
      pipeId,
      name: `auto-4-6-${randomUUID().slice(0, 8)}`,
      quando: { tipo: 'CARD_CREATED', refs: [] },
      entao: [{ tipo: 'CARD_ARCHIVE', parametros: {}, refs: [] }],
    },
    select: { id: true },
  });
  automacoes.push({ id: auto.id, orgId });
  return auto.id;
}

/** Uma linha de Execução mínima e válida (o `eventId` é um id lógico sem FK; `automationId` tem FK composta). */
function linhaExecucao(orgId: string, pipeId: string, automationId: string) {
  return {
    orgId,
    eventId: randomUUID(),
    automationId,
    automationVersionId: 1,
    configSnapshotRevision: 'rev-teste',
    pipeId,
    initiatorType: 'SISTEMA',
    correlationId: randomUUID(),
  };
}

async function criarExecucao(orgId: string, pipeId: string, automationId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const exec = await db.automationExecution.create({
    data: linhaExecucao(orgId, pipeId, automationId),
    select: { id: true },
  });
  execucoes.push({ id: exec.id, orgId });
  return exec.id;
}

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: os testes de RLS do motor exigem um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  // Faxina pelo DONO (o runtime não tem DELETE). Ordem: resultados/execuções (CASCADE cobre resultados) →
  // execuções → automações (RESTRICT a partir de execução) → pipes.
  if (migrator) {
    for (const { id, orgId } of execucoes) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.automationActionResult.deleteMany({ where: { executionId: id } });
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

describe('propriedade e RLS das tabelas do motor', () => {
  it.each(['AutomationExecution', 'AutomationActionResult'])(
    '%s tem RLS ENABLE + FORCE e é do migrator, não do runtime',
    async (tabela) => {
      const t = await prisma.$queryRawUnsafe<
        { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >(
        `SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = '${tabela}'`,
      );
      expect(t[0]?.relrowsecurity).toBe(true);
      expect(t[0]?.relforcerowsecurity).toBe(true);
      expect(t[0]?.dono).toBe('giraffe_migrator');
    },
  );

  it.each(['AutomationExecution', 'AutomationActionResult'])(
    '%s tem as 4 policies, com WITH CHECK no INSERT e no UPDATE',
    async (tabela) => {
      const policies = await prisma.$queryRawUnsafe<{ cmd: string; withcheck: string | null }[]>(
        `SELECT cmd, with_check::text AS withcheck FROM pg_policies WHERE tablename = '${tabela}'`,
      );
      expect(policies.map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
      expect(policies.find((p) => p.cmd === 'INSERT')?.withcheck).toContain('current_org_id()');
      expect(policies.find((p) => p.cmd === 'UPDATE')?.withcheck).toContain('current_org_id()');
    },
  );
});

describe('GRANT como fronteira — Execution (UPDATE column-scoped) e Result (append-only)', () => {
  it('Execution: no nível da TABELA o runtime tem SÓ SELECT/INSERT (o UPDATE é column-scoped)', async () => {
    // Um GRANT UPDATE COLUMN-SCOPED (`GRANT UPDATE (col...)`) NÃO aparece como privilégio de TABELA em
    // `role_table_grants` — só em `column_privileges` (verificado no teste seguinte). Mesmo padrão de `Record`.
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'AutomationExecution' AND grantee = 'giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('Execution: o UPDATE é COLUMN-SCOPED — só as colunas de progresso', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'AutomationExecution' AND grantee = 'giraffe_app' AND privilege_type = 'UPDATE'`;
    expect(cols.map((c) => c.column_name).sort()).toEqual(
      [
        'attempt',
        'finishedAt',
        'lastErrorCode',
        'leaseExpiresAt',
        'leaseOwner',
        'nextAttemptAt',
        'startedAt',
        'state',
        'updatedAt',
      ].sort(),
    );
  });

  it('Execution: UPDATE de `state`/lease é PERMITIDO (progresso)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const execId = await criarExecucao(ORG_C, pipeId, autoId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const { count } = await db.automationExecution.updateMany({
      where: { id: execId },
      data: { state: 'RUNNING', leaseOwner: randomUUID(), leaseExpiresAt: new Date() },
    });
    expect(count).toBe(1);
  });

  it('Execution: UPDATE de `eventId` é NEGADO — a identidade lógica é imutável (fase vermelha do GRANT)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const execId = await criarExecucao(ORG_C, pipeId, autoId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationExecution.updateMany({ where: { id: execId }, data: { eventId: randomUUID() } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('Execution: UPDATE de `automationId` é NEGADO — não migra de Automação', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const execId = await criarExecucao(ORG_C, pipeId, autoId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationExecution.updateMany({
        where: { id: execId },
        data: { automationId: randomUUID() },
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('Execution: DELETE é NEGADO — a trilha não é apagável', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const execId = await criarExecucao(ORG_C, pipeId, autoId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(db.automationExecution.deleteMany({ where: { id: execId } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('Result: no nível da TABELA o runtime tem SÓ SELECT/INSERT (append-only)', async () => {
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'AutomationActionResult' AND grantee = 'giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('Result: INSERT permitido; UPDATE e DELETE NEGADOS (imutável)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const execId = await criarExecucao(ORG_C, pipeId, autoId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const r = await db.automationActionResult.create({
      data: {
        orgId: ORG_C,
        executionId: execId,
        actionIndex: 0,
        actionType: 'CARD_ARCHIVE',
        state: 'SUCCEEDED',
      },
      select: { id: true },
    });
    await expect(
      db.automationActionResult.updateMany({ where: { id: r.id }, data: { state: 'FAILED' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.automationActionResult.deleteMany({ where: { id: r.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('Result: dedup por (Execução, índice) — o 2º INSERT do mesmo índice colide (§1403)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const execId = await criarExecucao(ORG_C, pipeId, autoId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await db.automationActionResult.create({
      data: {
        orgId: ORG_C,
        executionId: execId,
        actionIndex: 0,
        actionType: 'CARD_ARCHIVE',
        state: 'SUCCEEDED',
      },
    });
    await expect(
      db.automationActionResult.create({
        data: {
          orgId: ORG_C,
          executionId: execId,
          actionIndex: 0,
          actionType: 'CARD_ARCHIVE',
          state: 'FAILED',
        },
      }),
    ).rejects.toThrow(/unique|constraint/i);
  });
});

describe('dedup e FK composta', () => {
  it('Execution: dedup lógica — 2ª Execução do mesmo (evento, Automação, versão) colide (§1402)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const autoId = await criarAutomacao(ORG_C, pipeId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const linha = linhaExecucao(ORG_C, pipeId, autoId);
    const a = await db.automationExecution.create({ data: linha, select: { id: true } });
    execucoes.push({ id: a.id, orgId: ORG_C });
    await expect(
      db.automationExecution.create({ data: { ...linha, correlationId: randomUUID() } }),
    ).rejects.toThrow(/unique|constraint/i);
  });

  it('Execution: FK composta rejeita `automationId` de OUTRA Organização', async () => {
    const pipeA = await criarPipe(ORG_A);
    const autoA = await criarAutomacao(ORG_A, pipeA);
    const pipeC = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationExecution.create({ data: linhaExecucao(ORG_C, pipeC, autoA) }),
    ).rejects.toThrow(/foreign key|fkey/i);
  });
});

describe('isolamento entre Organizações', () => {
  it('cada tenant só enxerga as próprias Execuções', async () => {
    const pipeC = await criarPipe(ORG_C);
    const autoC = await criarAutomacao(ORG_C, pipeC);
    const execId = await criarExecucao(ORG_C, pipeC, autoC);
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.automationExecution.findMany({ where: { id: execId } })).toEqual([]);
  });

  it('sem contexto de Organização, nada é visível (deny-by-default)', async () => {
    expect(await prisma.automationExecution.findMany({ take: 1 })).toEqual([]);
    expect(await prisma.automationActionResult.findMany({ take: 1 })).toEqual([]);
  });
});
