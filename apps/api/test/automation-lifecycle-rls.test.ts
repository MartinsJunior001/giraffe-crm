import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  definirContextoOrg,
  withTenantContext,
  type TenantLogger,
} from '../src/kernel/db/tenant-context';

/**
 * Isolamento e fronteira de privilégio da GESTÃO da Automação (Story 4.2) contra um PostgreSQL REAL, pelo
 * papel de runtime `giraffe_app`. Quem nega é o BANCO. Banco fora ⇒ suíte VERMELHA, não pulada.
 *
 * Prova o que a 4.2 acrescenta à fronteira já consolidada na 4.1:
 *   · **GRANT UPDATE column-scoped em `Automation`** — `state`/`activeVersion`/config SIM; `orgId`/`pipeId`
 *     NÃO (`permission denied`). É a fronteira que reconcilia "evoluir estado/config sim, mover de
 *     Org/Pipe não" — o 1º UPDATE em runtime, exatamente como `Card` fez na 2.11.
 *   · **`AutomationVersion` append-only IMUTÁVEL** — SELECT/INSERT concedidos; UPDATE/DELETE NEGADOS.
 *   · **FK COMPOSTA tenant-safe da versão** — uma versão com `automationId` de outra Org é recusada pelo banco.
 *   · **RLS ENABLE+FORCE + WITH CHECK** e isolamento cross-tenant.
 *
 * Como `automations-rls.test.ts` (4.1): a derrubada de proteção para provar a "fase vermelha" do GRANT/FK é
 * um **drill MANUAL em banco descartável**, registrado no PR — não versionado aqui (não afrouxamos policy
 * dentro de um `it`). Escrita sempre na **Org C** com recursos descartáveis (`randomUUID`) — TEST-ISO-01.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;

const pipesCriados: { id: string; orgId: string }[] = [];
const automacoesCriadas: string[] = [];

const CONFIG = {
  quando: { tipo: 'CARD_CREATED', refs: [] },
  condicoes: [],
  entao: [{ tipo: 'MOVER_CARD', parametros: {}, refs: [] }],
};

async function criarPipe(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-4-2-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipesCriados.push({ id: pipe.id, orgId });
  return pipe.id;
}

async function criarAutomacao(orgId: string, pipeId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const a = await db.automation.create({
    data: { orgId, pipeId, name: `auto-${randomUUID().slice(0, 8)}`, ...CONFIG },
    select: { id: true },
  });
  automacoesCriadas.push(a.id);
  return a.id;
}

/** Congela uma versão pela transação raiz com contexto (o mesmo primitivo do serviço). */
async function congelarVersao(orgId: string, automationId: string, version: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const p of definirContextoOrg(tx, { orgId })) await p;
    await tx.automationVersion.create({
      data: {
        orgId,
        automationId,
        version,
        snapshot: CONFIG,
        revision: `rev-${version}`,
        configSchemaVersion: 1,
      },
    });
  });
}

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: os testes de RLS exigem um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  if (migrator) {
    // Versões e Automações caem por CASCADE ao apagar a Automação; ordem: Automação antes do Pipe (FK RESTRICT).
    for (const orgId of [ORG_A, ORG_C]) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      if (automacoesCriadas.length > 0) {
        await db.automation.deleteMany({ where: { id: { in: automacoesCriadas } } });
      }
    }
    for (const { id, orgId } of pipesCriados) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.automation.deleteMany({ where: { pipeId: id } });
      await db.pipe.deleteMany({ where: { id } });
    }
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('GRANT UPDATE column-scoped em Automation (D-4.2-C) — o 1º UPDATE em runtime', () => {
  it('o UPDATE NÃO é table-wide: no nível da TABELA o runtime tem só SELECT/INSERT (nunca DELETE)', async () => {
    // Um `GRANT UPDATE (colunas)` é privilégio de COLUNA, não de tabela — então `role_table_grants`
    // (nível-tabela) mostra apenas SELECT/INSERT. É exatamente a prova de que o UPDATE é column-scoped:
    // não existe UPDATE table-wide. O UPDATE por-coluna é conferido no caso seguinte (column_privileges).
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'Automation' AND grantee = 'giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('o UPDATE é column-scoped: state/activeVersion/config SIM; orgId/pipeId NÃO', async () => {
    const cols = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.column_privileges
       WHERE table_name = 'Automation' AND grantee = 'giraffe_app' AND privilege_type = 'UPDATE'`;
    const nomes = cols.map((c) => c.column_name).sort();
    expect(nomes).toEqual(
      [
        'activeVersion',
        'condicoes',
        'configSchemaVersion',
        'entao',
        'name',
        'quando',
        'state',
        'updatedAt',
      ].sort(),
    );
    // A fronteira: colunas de identidade/tenant NUNCA aparecem no UPDATE concedido.
    expect(nomes).not.toContain('orgId');
    expect(nomes).not.toContain('pipeId');
    expect(nomes).not.toContain('idempotencyKey');
  });

  it('UPDATE de state (ativar) é PERMITIDO', async () => {
    const pipeId = await criarPipe(ORG_C);
    const id = await criarAutomacao(ORG_C, pipeId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const { count } = await db.automation.updateMany({
      where: { id },
      data: { state: 'ACTIVE', activeVersion: 1 },
    });
    expect(count).toBe(1);
  });

  it('UPDATE de pipeId (mover de Pipe) bate em permission denied — garantido pelo BANCO', async () => {
    const pipeId = await criarPipe(ORG_C);
    const outroPipe = await criarPipe(ORG_C);
    const id = await criarAutomacao(ORG_C, pipeId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automation.updateMany({ where: { id }, data: { pipeId: outroPipe } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('UPDATE de orgId (mover de Organização) bate em permission denied', async () => {
    const pipeId = await criarPipe(ORG_C);
    const id = await criarAutomacao(ORG_C, pipeId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automation.updateMany({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('AutomationVersion — append-only IMUTÁVEL (twin de FormVersion)', () => {
  it('runtime tem SELECT e INSERT, e NÃO tem UPDATE nem DELETE', async () => {
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'AutomationVersion' AND grantee = 'giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('tem RLS ENABLE + FORCE e é do migrator, não do runtime', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE relname = 'AutomationVersion'`;
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });

  it('UPDATE de uma versão congelada é NEGADO pelo banco', async () => {
    const pipeId = await criarPipe(ORG_C);
    const id = await criarAutomacao(ORG_C, pipeId);
    await congelarVersao(ORG_C, id, 1);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.automationVersion.updateMany({ where: { automationId: id }, data: { revision: 'x' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE de uma versão é NEGADO pelo banco', async () => {
    const pipeId = await criarPipe(ORG_C);
    const id = await criarAutomacao(ORG_C, pipeId);
    await congelarVersao(ORG_C, id, 1);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(db.automationVersion.deleteMany({ where: { automationId: id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('a numeração é única por Automação: a mesma versão duas vezes colide (P2002)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const id = await criarAutomacao(ORG_C, pipeId);
    await congelarVersao(ORG_C, id, 1);
    await expect(congelarVersao(ORG_C, id, 1)).rejects.toThrow(/Unique|P2002|constraint/i);
  });
});

describe('FK COMPOSTA tenant-safe da versão', () => {
  it('a constraint aponta para o PAR (orgId, id) de Automation', async () => {
    const fk = await prisma.$queryRaw<{ definicao: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definicao
        FROM pg_constraint WHERE conname = 'AutomationVersion_orgId_automationId_fkey'`;
    expect(fk[0]?.definicao).toMatch(/FOREIGN KEY \("orgId", "automationId"\)/);
    expect(fk[0]?.definicao).toMatch(/REFERENCES "Automation"\("orgId", id\)/);
  });

  it('rejeita versão com automationId de OUTRA Organização', async () => {
    const pipeA = await criarPipe(ORG_A);
    const idA = await criarAutomacao(ORG_A, pipeA); // Automação real, da Org A

    // Contexto da Org C tentando congelar uma versão que aponta para a Automação da Org A: o par
    // (orgId=C, automationId=idA) não existe em Automation(orgId,id) → violação de FK.
    await expect(
      prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, { orgId: ORG_C })) await p;
        await tx.automationVersion.create({
          data: {
            orgId: ORG_C,
            automationId: idA,
            version: 1,
            snapshot: CONFIG,
            revision: 'x',
            configSchemaVersion: 1,
          },
        });
      }),
    ).rejects.toThrow(/foreign key|AutomationVersion_orgId_automationId_fkey/i);
  });
});

describe('isolamento entre Organizações', () => {
  it('cada tenant só enxerga as próprias versões', async () => {
    const pipeC = await criarPipe(ORG_C);
    const idC = await criarAutomacao(ORG_C, pipeC);
    await congelarVersao(ORG_C, idC, 1);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.automationVersion.findMany({ where: { automationId: idC } })).toEqual([]);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    expect(await dbC.automationVersion.findMany({ where: { automationId: idC } })).toHaveLength(1);
  });

  it('sem contexto de Organização, nada é visível (deny-by-default)', async () => {
    expect(await prisma.automationVersion.findMany({ take: 1 })).toEqual([]);
  });
});
