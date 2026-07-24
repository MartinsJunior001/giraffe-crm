import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import { AutomationEngineService } from '../src/pipes/automations/engine/automation-engine.service';
import { MAX_CHAIN_DEPTH } from '../src/pipes/automations/engine/chain-guard.core';

/**
 * Provas ADVERSARIAIS do ENCADEAMENTO e da PREVENÇÃO DE CICLOS (Story 4.7 — NFR-7, AD-18) contra um PostgreSQL
 * REAL, dirigindo o `AutomationEngineService` de ponta a ponta. Postgres fora ⇒ suíte VERMELHA, não pulada.
 *
 * Cobre:
 *  (a) ENCADEAMENTO LEGÍTIMO: Ação→Evento→Automação-filha executa, com `executionChainId` herdado e profundidade
 *      incrementada;
 *  (b) CICLO DIRETO A→A (mesmo alvo/cadeia) é BARRADO (`CYCLE_DETECTED`, não executa, dead-letter);
 *  (c) CICLO INDIRETO (re-entrada por outra Automação no mesmo alvo/cadeia) é BARRADO pela assinatura de visita;
 *  (d) PROFUNDIDADE: cadeia que expande (alvos novos) além de MAX_CHAIN_DEPTH é barrada (`DEPTH_EXCEEDED`);
 *  (e) SEM FALSO POSITIVO: a MESMA Automação em cadeias DISTINTAS não é barrada;
 *  (f) TIMEOUT DE CADEIA: um filho de cadeia velha é barrado (`CHAIN_TIMEOUT`);
 *  (i) AUDITORIA SANITIZADA: a Execução barrada registra `lastErrorCode` estrutural (sem id/valor/PII).
 *
 * Escrita sempre na **Org C** com recursos descartáveis (`randomUUID`) — nunca fixtures de leitura (TEST-ISO-01).
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const engineLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as PinoLogger;

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;
let engine: AutomationEngineService;

const criados = {
  automationIds: [] as string[],
  databaseIds: [] as string[],
  pipeIds: [] as string[],
  chainIds: [] as string[],
  accountIds: [] as string[],
  membershipIds: [] as string[],
  pipeGrantIds: [] as string[],
  phaseIds: [] as string[],
  cardIds: [] as string[],
  formIds: [] as string[],
  formVersionIds: [] as string[],
};

/** Pipe + Database + Formulário de Database publicado (1 Campo texto, opcional) — reusável para criar Cards. */
async function cenarioBase() {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId: ORG_C, name: `p-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  criados.pipeIds.push(pipe.id);
  const database = await db.database.create({
    data: { orgId: ORG_C, name: `d-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  criados.databaseIds.push(database.id);
  const form = await db.form.create({
    data: { orgId: ORG_C, context: 'DATABASE', databaseId: database.id, publishedVersion: 1 },
    select: { id: true },
  });
  criados.formIds.push(form.id);
  const fieldId = randomUUID();
  const fv = await db.formVersion.create({
    data: {
      orgId: ORG_C,
      formId: form.id,
      version: 1,
      snapshot: { fields: [{ id: fieldId, type: 'TEXT_SHORT', label: 'Nome' }] },
      revision: `r-${randomUUID().slice(0, 8)}`,
    },
    select: { id: true },
  });
  criados.formVersionIds.push(fv.id);
  return { pipeId: pipe.id, databaseId: database.id, formId: form.id, formVersionId: fv.id };
}

async function criarAutomacaoAtiva(
  pipeId: string,
  quando: object,
  entao: object[],
): Promise<string> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const auto = await db.automation.create({
    data: {
      orgId: ORG_C,
      pipeId,
      name: `a-${randomUUID().slice(0, 8)}`,
      state: 'ACTIVE',
      activeVersion: 1,
      quando,
      condicoes: [],
      entao,
    },
    select: { id: true },
  });
  criados.automationIds.push(auto.id);
  await db.automationVersion.create({
    data: {
      orgId: ORG_C,
      automationId: auto.id,
      version: 1,
      snapshot: { schemaVersion: 1, quando, condicoes: [], entao },
      revision: `rev-${randomUUID().slice(0, 8)}`,
      configSchemaVersion: 1,
    },
  });
  return auto.id;
}

async function emitirEvento(
  eventType: string,
  resourceType: string,
  resourceId: string,
  pipeId: string | null,
  opts: { executionChainId?: string; chainDepth?: number } = {},
): Promise<string> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const eventId = randomUUID();
  await db.domainEvent.create({
    data: {
      orgId: ORG_C,
      eventId,
      eventType,
      pipeId,
      resourceType,
      resourceId,
      origin: 'SUBMISSION',
      correlationId: randomUUID(),
      executionChainId: opts.executionChainId ?? null,
      chainDepth: opts.chainDepth ?? 0,
    },
  });
  // A raiz de uma cadeia é o próprio eventId; um evento com executionChainId explícito pertence àquela cadeia.
  criados.chainIds.push(opts.executionChainId ?? eventId);
  return eventId;
}

async function criarContaEMembership(): Promise<string> {
  const accountId = randomUUID();
  await migrator.account.create({
    data: { id: accountId, email: `u-${accountId}@teste.local`, name: 'Alvo' },
  });
  criados.accountIds.push(accountId);
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const m = await db.membership.create({
    data: { accountId, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    select: { id: true },
  });
  criados.membershipIds.push(m.id);
  return m.id;
}

async function darAcessoOperacional(pipeId: string, membershipId: string): Promise<void> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const g = await db.pipeGrant.create({
    data: { orgId: ORG_C, pipeId, membershipId, role: 'MEMBER', state: 'ACTIVE' },
    select: { id: true },
  });
  criados.pipeGrantIds.push(g.id);
}

async function criarCard(pipeId: string, formId: string, formVersionId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const phase = await db.phase.create({
    data: { orgId: ORG_C, pipeId, name: 'F1', position: 1000, state: 'ACTIVE' },
    select: { id: true },
  });
  criados.phaseIds.push(phase.id);
  const card = await db.card.create({
    data: {
      orgId: ORG_C,
      pipeId,
      phaseId: phase.id,
      formId,
      formVersionId,
      idempotencyKey: randomUUID(),
    },
    select: { id: true },
  });
  criados.cardIds.push(card.id);
  return card.id;
}

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: o E2E de encadeamento exige um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
  // A distribuição (5.6) só é consumida por `NOTIFICATION_SEND`, que este E2E não exercita — stub inerte.
  const distribuicaoStub = {
    distribuir: async () => {
      throw new Error('distribuição não usada neste E2E');
    },
  } as never;
  engine = new AutomationEngineService(
    prisma as unknown as PrismaService,
    engineLogger,
    distribuicaoStub,
  );
});

// Desativa as Automações criadas ao FIM de cada teste — um Evento pipeless (RECORD_CREATED) enfileira para TODA
// Automação ativa da Org cujo gatilho casa; sem isto, a Automação de um teste dispararia no Evento do vizinho.
afterEach(async () => {
  if (!prisma) return;
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  await db.automation.updateMany({
    where: { id: { in: criados.automationIds } },
    data: { state: 'INACTIVE' },
  });
});

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    for (const chainId of criados.chainIds) {
      await db.automationChainVisit.deleteMany({ where: { executionChainId: chainId } });
      const execs = await db.automationExecution.findMany({
        where: { executionChainId: chainId },
        select: { id: true },
      });
      for (const e of execs)
        await db.automationActionResult.deleteMany({ where: { executionId: e.id } });
      await db.automationExecution.deleteMany({ where: { executionChainId: chainId } });
      await db.domainEvent.deleteMany({ where: { executionChainId: chainId } });
    }
    for (const id of criados.automationIds) {
      await db.automationExecution.deleteMany({ where: { automationId: id } });
      await db.automationVersion.deleteMany({ where: { automationId: id } });
      await db.automation.deleteMany({ where: { id } });
    }
    await db.domainEvent.deleteMany({ where: { eventId: { in: criados.chainIds } } });
    for (const id of criados.databaseIds) {
      const recs = await db.record.findMany({ where: { databaseId: id }, select: { id: true } });
      for (const r of recs) await db.recordHistory.deleteMany({ where: { recordId: r.id } });
      await db.record.deleteMany({ where: { databaseId: id } });
    }
    for (const id of criados.cardIds) {
      await db.cardResponsavel.deleteMany({ where: { cardId: id } });
      await db.cardHistory.deleteMany({ where: { cardId: id } });
      await db.card.deleteMany({ where: { id } });
    }
    for (const id of criados.pipeGrantIds) await db.pipeGrant.deleteMany({ where: { id } });
    for (const id of criados.membershipIds) await db.membership.deleteMany({ where: { id } });
    for (const id of criados.accountIds) await migrator.account.deleteMany({ where: { id } });
    for (const id of criados.formVersionIds) await db.formVersion.deleteMany({ where: { id } });
    for (const id of criados.formIds) await db.form.deleteMany({ where: { id } });
    for (const id of criados.phaseIds) await db.phase.deleteMany({ where: { id } });
    for (const id of criados.databaseIds) await db.database.deleteMany({ where: { id } });
    for (const id of criados.pipeIds) await db.pipe.deleteMany({ where: { id } });
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('(a) encadeamento legítimo', () => {
  it('A1(CARD_CREATED→ASSIGN) → CARD_RESPONSIBLE_CHANGED → A2(RECORD_CREATE) executa; cadeia herdada, profundidade +1', async () => {
    const base = await cenarioBase();
    const cardId = await criarCard(base.pipeId, base.formId, base.formVersionId);
    const alvo = await criarContaEMembership();
    await darAcessoOperacional(base.pipeId, alvo); // SC-2101: o alvo já tem acesso operacional

    await criarAutomacaoAtiva(base.pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      { tipo: 'CARD_ASSIGN_RESPONSIBLE', parametros: { membershipId: alvo }, refs: [] },
    ]);
    const a2 = await criarAutomacaoAtiva(
      base.pipeId,
      { tipo: 'CARD_RESPONSIBLE_CHANGED', refs: [] },
      [
        {
          tipo: 'RECORD_CREATE',
          parametros: {},
          refs: [{ tipo: 'DATABASE', id: base.databaseId }],
        },
      ],
    );

    const raiz = await emitirEvento('CARD_CREATED', 'CARD', cardId, base.pipeId);
    await engine.processarEventoAgora(ORG_C, raiz);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // A2 (filha) EXECUTOU: criou um Registro DE VERDADE (o encadeamento realmente aconteceu).
    expect(await db.record.count({ where: { databaseId: base.databaseId } })).toBe(1);
    const execA2 = await db.automationExecution.findFirst({
      where: { automationId: a2 },
      select: { state: true, executionChainId: true, chainDepth: true },
    });
    expect(execA2?.state).toBe('SUCCEEDED');
    expect(execA2?.executionChainId).toBe(raiz); // cadeia HERDADA da raiz
    expect(execA2?.chainDepth).toBe(1); // profundidade INCREMENTADA
  });
});

describe('(b) ciclo direto A→A é barrado (CYCLE_DETECTED) + (i) auditoria sanitizada', () => {
  it('A(CARD_RESPONSIBLE_CHANGED→ASSIGN no mesmo Card) re-dispara ⇒ 2ª Execução HALTED_BY_LIMIT, não roda', async () => {
    const base = await cenarioBase();
    const cardId = await criarCard(base.pipeId, base.formId, base.formVersionId);
    const alvo = await criarContaEMembership();
    await darAcessoOperacional(base.pipeId, alvo);

    const a = await criarAutomacaoAtiva(
      base.pipeId,
      { tipo: 'CARD_RESPONSIBLE_CHANGED', refs: [] },
      [{ tipo: 'CARD_ASSIGN_RESPONSIBLE', parametros: { membershipId: alvo }, refs: [] }],
    );
    const raiz = await emitirEvento('CARD_RESPONSIBLE_CHANGED', 'CARD', cardId, base.pipeId);
    await engine.processarEventoAgora(ORG_C, raiz);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const execs = await db.automationExecution.findMany({
      where: { automationId: a },
      select: { state: true, chainDepth: true, lastErrorCode: true },
      orderBy: { chainDepth: 'asc' },
    });
    // Exatamente 2 Execuções: a raiz (profundidade 0, roda) e a re-entrada (profundidade 1, BARRADA) — sem loop.
    expect(execs).toHaveLength(2);
    expect(execs[0]!.state).toBe('SUCCEEDED');
    expect(execs[1]!.state).toBe('HALTED_BY_LIMIT');
    expect(execs[1]!.lastErrorCode).toBe('CYCLE_DETECTED');
    // (i) auditoria sanitizada: o motivo é enum ESTRUTURAL (sem UUID/valor/PII/stack).
    expect(execs[1]!.lastErrorCode).toMatch(/^[A-Z_]+$/);
    // O Responsável foi atribuído UMA vez (a raiz); a re-entrada não mutou nada.
    expect(await db.cardResponsavel.count({ where: { cardId, state: 'ACTIVE' } })).toBe(1);
  });
});

describe('(c) ciclo indireto (re-entrada por outra Automação no mesmo alvo/cadeia) é barrado', () => {
  it('A e B (ambas em CARD_RESPONSIBLE_CHANGED, mesmo Card) ⇒ as re-entradas na cadeia são HALTED (CYCLE_DETECTED)', async () => {
    const base = await cenarioBase();
    const cardId = await criarCard(base.pipeId, base.formId, base.formVersionId);
    const mA = await criarContaEMembership();
    const mB = await criarContaEMembership();
    await darAcessoOperacional(base.pipeId, mA);
    await darAcessoOperacional(base.pipeId, mB);

    await criarAutomacaoAtiva(base.pipeId, { tipo: 'CARD_RESPONSIBLE_CHANGED', refs: [] }, [
      { tipo: 'CARD_ASSIGN_RESPONSIBLE', parametros: { membershipId: mA }, refs: [] },
    ]);
    await criarAutomacaoAtiva(base.pipeId, { tipo: 'CARD_RESPONSIBLE_CHANGED', refs: [] }, [
      { tipo: 'CARD_ASSIGN_RESPONSIBLE', parametros: { membershipId: mB }, refs: [] },
    ]);
    const raiz = await emitirEvento('CARD_RESPONSIBLE_CHANGED', 'CARD', cardId, base.pipeId);
    await engine.processarEventoAgora(ORG_C, raiz);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const execs = await db.automationExecution.findMany({
      where: { executionChainId: raiz },
      select: { state: true, lastErrorCode: true },
    });
    // A cadeia NÃO cresce indefinidamente: existe ≥1 re-entrada barrada por CYCLE_DETECTED e NENHUMA em loop.
    const barradas = execs.filter((e) => e.state === 'HALTED_BY_LIMIT');
    expect(barradas.length).toBeGreaterThan(0);
    expect(barradas.every((e) => e.lastErrorCode === 'CYCLE_DETECTED')).toBe(true);
    // Cota de segurança: a cadeia inteira é pequena (não houve tempestade) — bem abaixo do teto de drain.
    expect(execs.length).toBeLessThan(20);
  });
});

describe('(d) profundidade máxima — cadeia que expande alvos novos é barrada (DEPTH_EXCEEDED) + (e) sem falso positivo', () => {
  it('A(RECORD_CREATED→RECORD_CREATE) encadeia até MAX_CHAIN_DEPTH e a próxima é HALTED (DEPTH_EXCEEDED)', async () => {
    const base = await cenarioBase();
    const a = await criarAutomacaoAtiva(base.pipeId, { tipo: 'RECORD_CREATED', refs: [] }, [
      { tipo: 'RECORD_CREATE', parametros: {}, refs: [{ tipo: 'DATABASE', id: base.databaseId }] },
    ]);
    // Raiz: um RECORD_CREATED "externo" (o resourceId é um Registro qualquer — a Ação cria em `base.databaseId`).
    const raiz = await emitirEvento('RECORD_CREATED', 'RECORD', randomUUID(), null);
    await engine.processarEventoAgora(ORG_C, raiz);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const execs = await db.automationExecution.findMany({
      where: { automationId: a },
      select: { state: true, chainDepth: true, lastErrorCode: true },
      orderBy: { chainDepth: 'asc' },
    });
    // Profundidades 0..MAX rodam (alvos SEMPRE novos ⇒ assinatura distinta ⇒ NÃO é ciclo — (e) sem falso positivo);
    // a profundidade MAX+1 é BARRADA por DEPTH_EXCEEDED.
    const rodadas = execs.filter((e) => e.state === 'SUCCEEDED');
    const barrada = execs.find((e) => e.state === 'HALTED_BY_LIMIT');
    expect(rodadas.length).toBe(MAX_CHAIN_DEPTH + 1); // níveis 0..MAX
    expect(rodadas.every((e) => e.chainDepth <= MAX_CHAIN_DEPTH)).toBe(true); // (e) distintos alvos NÃO barram
    expect(barrada?.chainDepth).toBe(MAX_CHAIN_DEPTH + 1);
    expect(barrada?.lastErrorCode).toBe('DEPTH_EXCEEDED');
    // A cadeia PAROU: só uma barrada, nenhuma além dela (sem loop silencioso — §1432).
    expect(execs.filter((e) => e.state === 'HALTED_BY_LIMIT')).toHaveLength(1);
  });

  it('(e) a MESMA Automação em cadeias DISTINTAS NÃO é barrada (assinatura por cadeia)', async () => {
    const base = await cenarioBase();
    const cardId = await criarCard(base.pipeId, base.formId, base.formVersionId);
    const a = await criarAutomacaoAtiva(base.pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      { tipo: 'RECORD_CREATE', parametros: {}, refs: [{ tipo: 'DATABASE', id: base.databaseId }] },
    ]);
    // Dois Eventos-RAIZ independentes sobre o MESMO Card e MESMO tipo ⇒ DUAS cadeias distintas.
    const raiz1 = await emitirEvento('CARD_CREATED', 'CARD', cardId, base.pipeId);
    const raiz2 = await emitirEvento('CARD_CREATED', 'CARD', cardId, base.pipeId);
    await engine.processarEventoAgora(ORG_C, raiz1);
    await engine.processarEventoAgora(ORG_C, raiz2);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const execs = await db.automationExecution.findMany({
      where: { automationId: a },
      select: { state: true, executionChainId: true },
    });
    // As duas raízes rodam (assinatura igual, mas cadeias distintas ⇒ SEM colisão): nenhuma barrada.
    expect(execs).toHaveLength(2);
    expect(execs.every((e) => e.state === 'SUCCEEDED')).toBe(true);
    expect(new Set(execs.map((e) => e.executionChainId)).size).toBe(2);
  });
});

describe('(f) timeout de cadeia — filho de cadeia velha é barrado (CHAIN_TIMEOUT)', () => {
  it('cadeia com 1ª visita antiga ⇒ um novo filho é HALTED_BY_LIMIT/CHAIN_TIMEOUT (não executa)', async () => {
    const base = await cenarioBase();
    const cardId = await criarCard(base.pipeId, base.formId, base.formVersionId);
    const a = await criarAutomacaoAtiva(base.pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      { tipo: 'RECORD_CREATE', parametros: {}, refs: [{ tipo: 'DATABASE', id: base.databaseId }] },
    ]);
    // Fabrica uma cadeia VELHA: uma visita com createdAt muito no passado (> duração máxima).
    const chainId = randomUUID();
    criados.chainIds.push(chainId);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await db.automationChainVisit.create({
      data: {
        orgId: ORG_C,
        executionChainId: chainId,
        signature: `velha-${randomUUID()}`,
        eventId: randomUUID(),
        executionId: randomUUID(),
        createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hora atrás
      },
    });
    // Um Evento-FILHO daquela cadeia (executionChainId setado, profundidade > 0).
    const filho = await emitirEvento('CARD_CREATED', 'CARD', cardId, base.pipeId, {
      executionChainId: chainId,
      chainDepth: 1,
    });
    await engine.enfileirarParaEvento(ORG_C, filho);

    const exec = await db.automationExecution.findFirst({
      where: { automationId: a, eventId: filho },
      select: { state: true, lastErrorCode: true },
    });
    expect(exec?.state).toBe('HALTED_BY_LIMIT');
    expect(exec?.lastErrorCode).toBe('CHAIN_TIMEOUT');
    // Não executou: nenhum Registro criado.
    expect(await db.record.count({ where: { databaseId: base.databaseId } })).toBe(0);
  });
});
