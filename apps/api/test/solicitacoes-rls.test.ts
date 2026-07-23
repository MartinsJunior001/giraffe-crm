import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `Solicitacao`/`SolicitacaoHistory` (Story 5.2) contra um PostgreSQL REAL, pelo
 * papel de runtime `giraffe_app` (sem BYPASSRLS, não é dono). Twin do `tasks-rls` sem eixo temporal. Prova:
 * (1) isolamento por Org; (2) `WITH CHECK` no INSERT (orgId alheio negado — fase vermelha); (3) FK COMPOSTA
 * tenant-safe (pipeId de outra Org → violação de FK, não linha invisível); (4) GRANT column-scoped — o
 * runtime UPDATE só as colunas mutáveis; `orgId`/`pipeId`/`creatorMembershipId` → **permission denied**; e
 * **sem DELETE** em `Solicitacao`; (5) `SolicitacaoHistory` IMUTÁVEL (sem UPDATE/DELETE).
 *
 * Área de escrita = Org C. Fixtures descartáveis (Pipe) criadas pelo migrator.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)
let migrator: PrismaClient; // dono (giraffe_migrator)

const pipeC = randomUUID();
const pipeA = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  await withTenantContext(migrator, { orgId: ORG_C }, semLog).pipe.create({
    data: { id: pipeC, orgId: ORG_C, name: 'Pipe Sol RLS C' },
  });
  await withTenantContext(migrator, { orgId: ORG_A }, semLog).pipe.create({
    data: { id: pipeA, orgId: ORG_A, name: 'Pipe Sol RLS A' },
  });
});

afterAll(async () => {
  if (migrator) {
    await withTenantContext(migrator, { orgId: ORG_C }, semLog)
      .pipe.deleteMany({ where: { id: pipeC } })
      .catch(() => {});
    await withTenantContext(migrator, { orgId: ORG_A }, semLog)
      .pipe.deleteMany({ where: { id: pipeA } })
      .catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

/** Cria uma Solicitacao (runtime) na Org C e devolve seu id. */
async function criarSolicitacao(): Promise<string> {
  const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const s = await dbC.solicitacao.create({
    data: { orgId: ORG_C, pipeId: pipeC, title: 'S' },
    select: { id: true },
  });
  return s.id;
}

describe('isolamento por Organização', () => {
  it('uma Solicitacao da Org C não é visível pela Org A; INSERT com orgId alheio é negado', async () => {
    const id = await criarSolicitacao();
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.solicitacao.findUnique({ where: { id } })).toBeNull();

    // Inserir com orgId alheio (WITH CHECK, sem RETURNING via createMany) → negado.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.solicitacao.createMany({ data: [{ orgId: ORG_A, pipeId: pipeC, title: 'x' }] }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('FK COMPOSTA tenant-safe: uma Solicitacao com pipeId de OUTRA Org viola a FK (não é linha invisível)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.solicitacao.create({ data: { orgId: ORG_C, pipeId: pipeA, title: 'cross' } }),
    ).rejects.toThrow(/foreign key|constraint|violat/i);
  });
});

describe('GRANT column-scoped (o runtime não muta orgId/pipeId/creator; sem DELETE)', () => {
  it('UPDATE das colunas mutáveis OK; orgId/pipeId/creatorMembershipId → permission denied; sem DELETE', async () => {
    const id = await criarSolicitacao();
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    await expect(
      dbC.solicitacao.updateMany({ where: { id }, data: { lifecycleState: 'RESOLVIDA' } }),
    ).resolves.toBeTruthy();
    await expect(
      dbC.solicitacao.updateMany({ where: { id }, data: { archiveState: 'ARQUIVADA' } }),
    ).resolves.toBeTruthy();
    await expect(
      dbC.solicitacao.updateMany({ where: { id }, data: { title: 'novo' } }),
    ).resolves.toBeTruthy();

    // Colunas NÃO concedidas → permission denied.
    await expect(
      dbC.solicitacao.updateMany({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.solicitacao.updateMany({ where: { id }, data: { pipeId: randomUUID() } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.solicitacao.updateMany({ where: { id }, data: { creatorMembershipId: randomUUID() } }),
    ).rejects.toThrow(/permission denied/i);

    // Sem DELETE (arquivar/resolver = state).
    await expect(dbC.solicitacao.deleteMany({ where: { id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('SolicitacaoHistory permanece imutável no runtime', () => {
  it('o runtime NÃO tem UPDATE nem DELETE em SolicitacaoHistory', async () => {
    const solicitacaoId = await criarSolicitacao();
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const ev = await dbC.solicitacaoHistory.create({
      data: { orgId: ORG_C, solicitacaoId, type: 'CREATED', summary: 'x' },
      select: { id: true },
    });
    await expect(
      dbC.solicitacaoHistory.updateMany({ where: { id: ev.id }, data: { summary: 'y' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(dbC.solicitacaoHistory.deleteMany({ where: { id: ev.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
