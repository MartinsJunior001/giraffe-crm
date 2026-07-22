import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import {
  definirContextoOrg,
  withTenantContext,
  type TenantLogger,
} from '../src/kernel/db/tenant-context';

/**
 * Trilha de auditoria e sanitização da versão de Automação (Story 4.2 — requisito (h)).
 *
 * O snapshot de `AutomationVersion` congela `quando`/`condicoes`/`entao`, que podem carregar valores de
 * Campo (possível PII). Prova que:
 *   1. `AutomationVersion` está em `MODELOS_AUDITADOS` — a mutação entra na trilha;
 *   2. o SNAPSHOT nunca vai para o log — a auditoria registra só ator/Org/ação/recurso/resultado, jamais
 *      os `args` (mesmo critério que mantém `valores` fora da lista do Kanban — NFR-1/8/16);
 *   3. uma tentativa NEGADA por RLS não é registrada como sucesso.
 *
 * Escrita sempre na **Org C** com recursos descartáveis (`randomUUID`) — TEST-ISO-01.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

class LoggerEspiao implements TenantLogger {
  registros: { obj: Record<string, unknown>; msg?: string }[] = [];
  info(obj: object, msg?: string): void {
    this.registros.push({ obj: obj as Record<string, unknown>, msg });
  }
  warn(obj: object, msg?: string): void {
    this.registros.push({ obj: obj as Record<string, unknown>, msg });
  }
  debug(obj: object, msg?: string): void {
    this.registros.push({ obj: obj as Record<string, unknown>, msg });
  }
  auditorias(): Record<string, unknown>[] {
    return this.registros.map((r) => r.obj).filter((o) => o.event === 'audit');
  }
  tudo(): string {
    return JSON.stringify(this.registros);
  }
}

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;
let prisma: PrismaClient;
let migrator: PrismaClient;
const pipesCriados: { id: string; orgId: string }[] = [];
const automacoesCriadas: string[] = [];

const VALOR_SENSIVEL = 'CPF-987.654.321-00-do-titular';
const SNAPSHOT = {
  schemaVersion: 1,
  quando: { tipo: 'CARD_CREATED', refs: [] },
  condicoes: [{ tipo: 'CAMPO', operador: 'IGUAL', valor: VALOR_SENSIVEL, refs: [] }],
  entao: [{ tipo: 'MOVER_CARD', parametros: { nota: VALOR_SENSIVEL }, refs: [] }],
};

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: este teste exige um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  if (migrator) {
    for (const orgId of [ORG_A, ORG_C]) {
      const db = withTenantContext(migrator, { orgId }, new LoggerEspiao());
      if (automacoesCriadas.length > 0) {
        await db.automation.deleteMany({ where: { id: { in: automacoesCriadas } } });
      }
    }
    for (const { id, orgId } of pipesCriados) {
      const db = withTenantContext(migrator, { orgId }, new LoggerEspiao());
      await db.automation.deleteMany({ where: { pipeId: id } });
      await db.pipe.deleteMany({ where: { id } });
    }
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

async function criarAutomacao(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, new LoggerEspiao());
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-log-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipesCriados.push({ id: pipe.id, orgId });
  const a = await db.automation.create({
    data: {
      orgId,
      pipeId: pipe.id,
      name: 'para-versao',
      quando: SNAPSHOT.quando,
      condicoes: SNAPSHOT.condicoes,
      entao: SNAPSHOT.entao,
    },
    select: { id: true },
  });
  automacoesCriadas.push(a.id);
  return a.id;
}

describe('AutomationVersion entra na trilha de auditoria, sanitizada', () => {
  it('a criação da versão é auditada como mutação de AutomationVersion', async () => {
    const id = await criarAutomacao(ORG_C);
    const espiao = new LoggerEspiao();
    await prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, { orgId: ORG_C })) await p;
      await withTenantContext(prisma, { orgId: ORG_C }, espiao).automationVersion.create({
        data: {
          orgId: ORG_C,
          automationId: id,
          version: 1,
          snapshot: SNAPSHOT,
          revision: 'rev-1',
          configSchemaVersion: 1,
        },
      });
    });
    const daVersao = espiao.auditorias().filter((a) => a.resource === 'AutomationVersion');
    expect(daVersao.length).toBeGreaterThan(0);
    expect(daVersao[0]).toMatchObject({ action: 'create', orgId: ORG_C });
  });

  it('o SNAPSHOT (possível PII) nunca aparece na trilha', async () => {
    const id = await criarAutomacao(ORG_C);
    const espiao = new LoggerEspiao();
    await withTenantContext(prisma, { orgId: ORG_C }, espiao).automationVersion.create({
      data: {
        orgId: ORG_C,
        automationId: id,
        version: 1,
        snapshot: SNAPSHOT,
        revision: 'rev-1',
        configSchemaVersion: 1,
      },
    });
    const tudo = espiao.tudo();
    expect(tudo).not.toContain(VALOR_SENSIVEL);
    expect(tudo).not.toContain('CPF');
    expect(tudo).not.toContain('MOVER_CARD');
  });

  it('tentativa NEGADA pela policy não é registrada como sucesso', async () => {
    const idA = await criarAutomacao(ORG_A);
    const espiao = new LoggerEspiao();
    // Contexto da Org C tentando gravar versão da Org A: barrado pelo WITH CHECK (createMany, sem RETURNING).
    const db = withTenantContext(prisma, { orgId: ORG_C }, espiao);
    await expect(
      db.automationVersion.createMany({
        data: [
          {
            orgId: ORG_A,
            automationId: idA,
            version: 1,
            snapshot: SNAPSHOT,
            revision: 'x',
            configSchemaVersion: 1,
          },
        ],
      }),
    ).rejects.toThrow();
    const sucessos = espiao
      .auditorias()
      .filter((a) => a.resource === 'AutomationVersion' && a.result === 'allowed');
    expect(sucessos).toHaveLength(0);
  });
});
