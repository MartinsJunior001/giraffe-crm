import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import { AutomationEngineService } from '../src/pipes/automations/engine/automation-engine.service';
import { montarSnapshotEContexto } from '../src/pipes/automations/engine/snapshot-builder';

/**
 * Provas COMPORTAMENTAIS do MOTOR (Story 4.6) contra um PostgreSQL REAL, dirigindo o `AutomationEngineService`
 * de ponta a ponta (Evento do outbox → snapshot sob RLS → Condição AND → Ação EXECUTADA de verdade). Postgres
 * fora ⇒ suíte VERMELHA, não pulada.
 *
 * Cobre: **(a)** execução real (RECORD_CREATE cria um Registro de verdade sob o principal); **(b)** dedup/
 * at-least-once (reprocessar o mesmo Evento não duplica Execução nem Registro); **(g)** fail-closed (Condição
 * não satisfeita ⇒ nenhuma Ação); **(d) M-1** (alvo de Registro derivado do Evento cross-Pipe é REJEITADO pelo
 * snapshot-builder — não vira alvo). Escrita sempre na **Org C** com recursos descartáveis (`randomUUID`).
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

// Rastreio para faxina (o runtime não tem DELETE em várias tabelas — a faxina é pelo migrator).
const criados = {
  execIds: [] as string[],
  automationIds: [] as string[],
  recordIds: [] as string[],
  linkIds: [] as string[],
  cardIds: [] as string[],
  formVersionIds: [] as string[],
  formIds: [] as string[],
  phaseIds: [] as string[],
  databaseIds: [] as string[],
  pipeIds: [] as string[],
  eventIds: [] as string[],
};

/** Cria um cenário: Pipe + Database + Formulário de Database publicado (1 Campo texto). */
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
  const snapshot = { fields: [{ id: fieldId, type: 'TEXT_SHORT', label: 'Nome' }] };
  const fv = await db.formVersion.create({
    data: {
      orgId: ORG_C,
      formId: form.id,
      version: 1,
      snapshot,
      revision: 'r1',
    },
    select: { id: true },
  });
  criados.formVersionIds.push(fv.id);
  return { pipeId: pipe.id, databaseId: database.id, formId: form.id, formVersionId: fv.id };
}

/** Cria uma Automação ATIVA v1 com o gatilho/condições/ações dados e sua AutomationVersion congelada. */
async function criarAutomacaoAtiva(
  pipeId: string,
  quando: object,
  condicoes: object[],
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
      condicoes,
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
      snapshot: { schemaVersion: 1, quando, condicoes, entao },
      revision: `rev-${randomUUID().slice(0, 8)}`,
      configSchemaVersion: 1,
    },
  });
  return auto.id;
}

/** Emite um DomainEvent (outbox) direto — como o produtor 4.3 faria na tx de origem. */
async function emitirEvento(
  eventType: string,
  resourceType: string,
  resourceId: string,
  pipeId: string | null,
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
    },
  });
  criados.eventIds.push(eventId);
  return eventId;
}

beforeAll(async () => {
  if (!databaseUrl)
    throw new Error('DATABASE_URL ausente: o E2E do motor exige um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
  engine = new AutomationEngineService(prisma as unknown as PrismaService, engineLogger);
});

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    for (const id of criados.linkIds) await db.cardRecordLink.deleteMany({ where: { id } });
    for (const id of criados.execIds)
      await db.automationActionResult.deleteMany({ where: { executionId: id } });
    await db.automationExecution.deleteMany({
      where: { automationId: { in: criados.automationIds } },
    });
    for (const id of criados.automationIds) {
      await db.automationVersion.deleteMany({ where: { automationId: id } });
      await db.automation.deleteMany({ where: { id } });
    }
    for (const id of criados.recordIds) {
      await db.recordHistory.deleteMany({ where: { recordId: id } });
      await db.record.deleteMany({ where: { id } });
    }
    for (const id of criados.cardIds) {
      await db.cardHistory.deleteMany({ where: { cardId: id } });
      await db.card.deleteMany({ where: { id } });
    }
    for (const id of criados.eventIds) await db.domainEvent.deleteMany({ where: { eventId: id } });
    for (const id of criados.formVersionIds) await db.formVersion.deleteMany({ where: { id } });
    for (const id of criados.formIds) await db.form.deleteMany({ where: { id } });
    for (const id of criados.phaseIds) await db.phase.deleteMany({ where: { id } });
    for (const id of criados.databaseIds) await db.database.deleteMany({ where: { id } });
    for (const id of criados.pipeIds) await db.pipe.deleteMany({ where: { id } });
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('(a) execução real + (b) dedup/at-least-once', () => {
  it('Evento → Condição vazia (aprovada) → RECORD_CREATE cria um Registro DE VERDADE; reprocessar não duplica', async () => {
    const { pipeId, databaseId } = await cenarioBase();
    await criarAutomacaoAtiva(
      pipeId,
      { tipo: 'CARD_CREATED', refs: [] },
      [],
      [{ tipo: 'RECORD_CREATE', parametros: {}, refs: [{ tipo: 'DATABASE', id: databaseId }] }],
    );
    const eventId = await emitirEvento('CARD_CREATED', 'CARD', randomUUID(), pipeId);

    // 1ª passagem: o motor executa a Ação de verdade.
    await engine.processarEventoAgora(ORG_C, eventId);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    let registros = await db.record.findMany({ where: { databaseId }, select: { id: true } });
    registros.forEach((r) => criados.recordIds.push(r.id));
    expect(registros).toHaveLength(1); // (a) — o Registro foi CRIADO

    const execs = await db.automationExecution.findMany({
      where: { eventId },
      select: { id: true, state: true },
    });
    execs.forEach((e) => criados.execIds.push(e.id));
    expect(execs).toHaveLength(1);
    expect(execs[0]!.state).toBe('SUCCEEDED');
    const resultados = await db.automationActionResult.findMany({
      where: { executionId: execs[0]!.id },
    });
    expect(resultados).toHaveLength(1);
    expect(resultados[0]!.state).toBe('SUCCEEDED');

    // 2ª passagem (at-least-once): reprocessar o MESMO Evento — dedup por Execução e por Ação.
    await engine.processarEventoAgora(ORG_C, eventId);
    registros = await db.record.findMany({ where: { databaseId }, select: { id: true } });
    expect(registros).toHaveLength(1); // (b) — NÃO duplicou o Registro
    expect(await db.automationExecution.count({ where: { eventId } })).toBe(1); // NÃO duplicou a Execução
  });
});

describe('(g) fail-closed — Condição não satisfeita ⇒ nenhuma Ação', () => {
  it('Condição sobre um Card inexistente ⇒ SKIPPED_CONDITIONS, sem Registro', async () => {
    const { pipeId, databaseId } = await cenarioBase();
    await criarAutomacaoAtiva(
      pipeId,
      { tipo: 'CARD_CREATED', refs: [] },
      // O Card do Evento não existe ⇒ snapshot.card=null ⇒ a Condição é fail-closed (falso) ⇒ não aprova.
      [{ tipo: 'CARD_LIFECYCLE_STATE', operador: 'igual', valor: 'ATIVO', refs: [] }],
      [{ tipo: 'RECORD_CREATE', parametros: {}, refs: [{ tipo: 'DATABASE', id: databaseId }] }],
    );
    const eventId = await emitirEvento('CARD_CREATED', 'CARD', randomUUID(), pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    expect(await db.record.count({ where: { databaseId } })).toBe(0); // nenhuma Ação executou
    const execs = await db.automationExecution.findMany({
      where: { eventId },
      select: { id: true, state: true },
    });
    execs.forEach((e) => criados.execIds.push(e.id));
    expect(execs[0]!.state).toBe('SKIPPED_CONDITIONS');
  });
});

describe('(d) M-1 — containment do alvo derivado do Evento cross-Pipe', () => {
  it('um Registro vinculado a Card do Pipe X NÃO vira alvo de Automação de OUTRO Pipe', async () => {
    const base = await cenarioBase();
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Uma Fase e um Card no Pipe X (FKs satisfeitas reusando o Form/FormVersion do cenário).
    const phase = await db.phase.create({
      data: { orgId: ORG_C, pipeId: base.pipeId, name: 'F1', position: 1000, state: 'ACTIVE' },
      select: { id: true },
    });
    criados.phaseIds.push(phase.id);
    const card = await db.card.create({
      data: {
        orgId: ORG_C,
        pipeId: base.pipeId,
        phaseId: phase.id,
        formId: base.formId,
        formVersionId: base.formVersionId,
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    criados.cardIds.push(card.id);
    const record = await db.record.create({
      data: {
        orgId: ORG_C,
        databaseId: base.databaseId,
        formId: base.formId,
        formVersionId: base.formVersionId,
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    criados.recordIds.push(record.id);
    const link = await db.cardRecordLink.create({
      data: {
        orgId: ORG_C,
        cardId: card.id,
        recordId: record.id,
        state: 'ACTIVE',
        correlationId: randomUUID(),
      },
      select: { id: true },
    });
    criados.linkIds.push(link.id);

    const evento = {
      orgId: ORG_C,
      eventType: 'RECORD_ARCHIVED',
      pipeId: null,
      resourceType: 'RECORD',
      resourceId: record.id,
      occurredAt: new Date(),
    };

    // Automação do PRÓPRIO Pipe X ⇒ o Registro É alvo (vínculo ativo com Card do Pipe proprietário).
    const doPipe = await montarSnapshotEContexto(db, evento, base.pipeId);
    expect(doPipe.contexto.recordId).toBe(record.id);

    // Automação de OUTRO Pipe ⇒ M-1 REJEITA: o Registro não é alcançável, `recordId` fica NULL (fail-closed).
    const outroPipe = randomUUID();
    const deOutroPipe = await montarSnapshotEContexto(db, evento, outroPipe);
    expect(deOutroPipe.contexto.recordId).toBeNull();
  });
});
