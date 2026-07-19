import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Trilha de auditoria e sanitização de log da Automação (Story 4.1 — F-A3).
 *
 * Prova três coisas distintas, que costumam ser confundidas:
 *
 *   1. **`Automation` é auditada** — a mutação entra em `MODELOS_AUDITADOS`. Sem isso, a criação de uma
 *      regra que um dia moverá Cards não deixaria rastro nenhum.
 *   2. **Tentativa NEGADA não vira sucesso** — um INSERT barrado pela policy tem de aparecer como falha,
 *      nunca como `allowed`. É a razão de a trilha existir: registrar o vandalismo cross-tenant.
 *   3. **A configuração NÃO vai para o log** — `quando`/`condicoes`/`entao` podem conter valores de Campo
 *      (possível PII), pelo mesmo critério que mantém `valores` fora da lista do Kanban (NFR-1/8/16).
 *
 * Sobre o "caminho no-op não gera falso `updateMany`" (F-A3): na 4.1 ele **não pode existir** — o runtime
 * não tem GRANT de UPDATE em `Automation`, então não há caminho idempotente capaz de emitir um
 * `updateMany` com `{ count: 0 }`. Isso vira exigência real na 4.2, junto do primeiro UPDATE.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/** Captura tudo que o interceptor de auditoria entrega ao logger. */
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

/** Valor de Campo plantado na configuração — se vazar em log, é PII vazada. */
const VALOR_SENSIVEL = 'CPF-123.456.789-01-do-titular';

const CONFIG = () => ({
  quando: { tipo: 'CARD_CRIADO', refs: [] },
  condicoes: [{ tipo: 'CAMPO', operador: 'IGUAL', valor: VALOR_SENSIVEL, refs: [] }],
  entao: [{ tipo: 'MOVER_CARD', parametros: { nota: VALOR_SENSIVEL }, refs: [] }],
});

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

async function criarPipe(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, new LoggerEspiao());
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-log-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipesCriados.push({ id: pipe.id, orgId });
  return pipe.id;
}

describe('F-A3 — Automation entra na trilha de auditoria', () => {
  it('a criação é registrada como auditoria da tabela Automation', async () => {
    const pipeId = await criarPipe(ORG_C);
    const espiao = new LoggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_C }, espiao);

    const criada = await db.automation.create({
      data: { orgId: ORG_C, pipeId, name: 'auditada', ...CONFIG() },
      select: { id: true },
    });
    automacoesCriadas.push(criada.id);

    const auditorias = espiao.auditorias();
    const daAutomacao = auditorias.filter((a) => a.resource === 'Automation');
    expect(daAutomacao.length).toBeGreaterThan(0);
    expect(daAutomacao[0]).toMatchObject({ action: 'create', orgId: ORG_C });
  });

  it('tentativa NEGADA pela policy não é registrada como sucesso', async () => {
    const pipeA = await criarPipe(ORG_A);
    const espiao = new LoggerEspiao();
    // Contexto da Org C tentando gravar linha da Org A: barrado pelo WITH CHECK.
    const db = withTenantContext(prisma, { orgId: ORG_C }, espiao);

    await expect(
      db.automation.createMany({
        data: [{ orgId: ORG_A, pipeId: pipeA, name: 'forjada', ...CONFIG() }],
      }),
    ).rejects.toThrow();

    // A tentativa não pode aparecer como permitida. O que se exige aqui é a AUSÊNCIA de um registro
    // de sucesso — um `allowed` para uma escrita que o banco recusou seria pior que não logar nada.
    const sucessos = espiao
      .auditorias()
      .filter((a) => a.resource === 'Automation' && a.result === 'allowed');
    expect(sucessos).toHaveLength(0);
  });
});

describe('F-A3 — log sem PII: a configuração nunca sai na trilha', () => {
  it('nem o valor de Campo, nem os parâmetros da Ação aparecem em log', async () => {
    const pipeId = await criarPipe(ORG_C);
    const espiao = new LoggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_C }, espiao);

    const criada = await db.automation.create({
      data: { orgId: ORG_C, pipeId, name: 'sem-pii-no-log', ...CONFIG() },
      select: { id: true },
    });
    automacoesCriadas.push(criada.id);

    const tudo = espiao.tudo();
    // O valor plantado na Condição E nos parâmetros da Ação.
    expect(tudo).not.toContain(VALOR_SENSIVEL);
    expect(tudo).not.toContain('CPF');
    // Nem os documentos de configuração inteiros.
    expect(tudo).not.toContain('MOVER_CARD');
  });
});
