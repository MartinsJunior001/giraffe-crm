import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { RequestContext } from '../src/kernel/context/request-context';
import { AutomationEngineService } from '../src/pipes/automations/engine/automation-engine.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationDistributionService } from '../src/notifications/distribution/notification-distribution.service';

/**
 * Story 5.7 — Integração de E5 (Tarefa/Solicitação/Notificação) com o motor de Automação (E4), contra um
 * PostgreSQL REAL. Prova COMPORTAMENTAL de que as Ações de E5 executam PELO motor existente (Execução + Trilha
 * 4.8 + encadeamento), com alvo/Membership determinísticos, criação idempotente, "nenhuma ref fora da Org" e
 * NÃO-AMPLIAÇÃO; e que `NOTIFICATION_SEND` reusa integralmente a distribuição 5.6 (acesso/preferências/dedup) —
 * fechando `DEB-5.6-CARD-MOVED-AUTOMATION-WIRING`. Postgres fora ⇒ suíte VERMELHA, não pulada. Escrita SEMPRE na
 * Org C com recursos descartáveis (`randomUUID`) — nunca reusa Ana/Bruno/Carla/Eva (TEST-ISO-01).
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
  execIds: [] as string[],
  automationIds: [] as string[],
  taskIds: [] as string[],
  solicitacaoIds: [] as string[],
  cardIds: [] as string[],
  phaseIds: [] as string[],
  pipeIds: [] as string[],
  eventIds: [] as string[],
  notificationIds: [] as string[],
  responsavelIds: [] as string[],
  membershipIds: [] as string[],
  accountIds: [] as string[],
};

function db() {
  return withTenantContext(prisma, { orgId: ORG_C }, semLog);
}

async function criarPipe(): Promise<string> {
  const pipe = await db().pipe.create({
    data: { orgId: ORG_C, name: `p-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  criados.pipeIds.push(pipe.id);
  return pipe.id;
}

/** Cria uma Fase + Card ATIVO nela (o Card é o gatilho dos Eventos CARD_*). Sem Formulário (não exigido). */
async function criarCard(pipeId: string): Promise<{ cardId: string; phaseId: string }> {
  const phase = await db().phase.create({
    data: { orgId: ORG_C, pipeId, name: 'F1', position: 1000, state: 'ACTIVE' },
    select: { id: true },
  });
  criados.phaseIds.push(phase.id);
  // Card sem Form/FormVersion: as colunas são nuláveis? Não — reusa um cenário mínimo com Form fake.
  const form = await db().form.create({
    data: { orgId: ORG_C, context: 'PIPE_INITIAL', pipeId, publishedVersion: 1 },
    select: { id: true },
  });
  const fv = await db().formVersion.create({
    data: { orgId: ORG_C, formId: form.id, version: 1, snapshot: { fields: [] }, revision: 'r1' },
    select: { id: true },
  });
  const card = await db().card.create({
    data: {
      orgId: ORG_C,
      pipeId,
      phaseId: phase.id,
      formId: form.id,
      formVersionId: fv.id,
      idempotencyKey: randomUUID(),
    },
    select: { id: true },
  });
  criados.cardIds.push(card.id);
  return { cardId: card.id, phaseId: phase.id };
}

async function criarContaEMembership(): Promise<string> {
  const accountId = randomUUID();
  await migrator.account.create({
    data: { id: accountId, email: `u-${accountId}@teste.local`, name: 'Alvo' },
  });
  criados.accountIds.push(accountId);
  const m = await db().membership.create({
    data: { accountId, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    select: { id: true },
  });
  criados.membershipIds.push(m.id);
  return m.id;
}

/** Cria uma Automação ATIVA v1 (gatilho/condições/ações) + a AutomationVersion congelada. */
async function criarAutomacaoAtiva(
  pipeId: string,
  quando: object,
  entao: object[],
): Promise<string> {
  const auto = await db().automation.create({
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
  await db().automationVersion.create({
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

/** Emite um DomainEvent (outbox) direto — como o produtor 4.3/5.7 faria na tx de origem. */
async function emitirEvento(
  eventType: string,
  resourceType: string,
  resourceId: string,
  pipeId: string | null,
): Promise<string> {
  const eventId = randomUUID();
  await db().domainEvent.create({
    data: {
      orgId: ORG_C,
      eventId,
      eventType,
      pipeId,
      resourceType,
      resourceId,
      origin: 'USER',
      correlationId: randomUUID(),
    },
  });
  criados.eventIds.push(eventId);
  return eventId;
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: o E2E de E5 exige um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Distribuição 5.6 REAL (context-explícito) — `registrarNotificacaoNoContexto` não usa o RequestContext.
  const requestContextStub = {
    obter: () => {
      throw new Error('RequestContext não usado no caminho de sistema');
    },
  } as unknown as RequestContext;
  const notifications = new NotificationsService(
    requestContextStub,
    prisma as unknown as PrismaService,
    engineLogger,
  );
  const distribuicao = new NotificationDistributionService(
    prisma as unknown as PrismaService,
    engineLogger,
    notifications,
  );
  engine = new AutomationEngineService(
    prisma as unknown as PrismaService,
    engineLogger,
    distribuicao,
  );
});

afterEach(async () => {
  if (!prisma) return;
  // Desativa as Automações do teste — um Evento pipeless enfileiraria para toda Automação ativa da Org.
  await db().automation.updateMany({
    where: { id: { in: criados.automationIds } },
    data: { state: 'INACTIVE' },
  });
});

afterAll(async () => {
  if (migrator) {
    const m = migrator;
    // Faxina pelo migrator (o runtime não tem DELETE em várias tabelas). Ordem: dependentes → base.
    // ESCOPADA aos recursos criados por ESTE arquivo (nunca `where: { orgId: ORG_C }` em massa) — a Org C é
    // compartilhada por toda a suíte, e uma varredura por Org apaga o setup dos vizinhos (lição TEST-ISO-01).
    const execs = await m.automationExecution
      .findMany({ where: { automationId: { in: criados.automationIds } }, select: { id: true } })
      .catch(() => [] as Array<{ id: string }>);
    const execIds = execs.map((e) => e.id);
    await m.automationActionResult
      .deleteMany({ where: { executionId: { in: execIds } } })
      .catch(() => {});
    await m.automationChainVisit
      .deleteMany({ where: { executionId: { in: execIds } } })
      .catch(() => {});
    await m.automationExecution.deleteMany({ where: { id: { in: execIds } } }).catch(() => {});
    await m.automationVersion
      .deleteMany({ where: { automationId: { in: criados.automationIds } } })
      .catch(() => {});
    await m.automation.deleteMany({ where: { id: { in: criados.automationIds } } }).catch(() => {});
    const tasks = await m.task
      .findMany({ where: { pipeId: { in: criados.pipeIds } }, select: { id: true } })
      .catch(() => [] as Array<{ id: string }>);
    const taskIds = tasks.map((t) => t.id);
    const sols = await m.solicitacao
      .findMany({ where: { pipeId: { in: criados.pipeIds } }, select: { id: true } })
      .catch(() => [] as Array<{ id: string }>);
    const solIds = sols.map((s) => s.id);
    const notifs = await m.notification
      .findMany({
        where: { resourceId: { in: [...criados.cardIds, ...taskIds, ...solIds] } },
        select: { id: true },
      })
      .catch(() => [] as Array<{ id: string }>);
    const notifIds = notifs.map((n) => n.id);
    await m.notificationRecipient
      .deleteMany({ where: { notificationId: { in: notifIds } } })
      .catch(() => {});
    await m.notification.deleteMany({ where: { id: { in: notifIds } } }).catch(() => {});
    await m.taskHistory.deleteMany({ where: { taskId: { in: taskIds } } }).catch(() => {});
    await m.task.deleteMany({ where: { id: { in: taskIds } } }).catch(() => {});
    await m.solicitacaoHistory
      .deleteMany({ where: { solicitacaoId: { in: solIds } } })
      .catch(() => {});
    await m.solicitacao.deleteMany({ where: { id: { in: solIds } } }).catch(() => {});
    await m.cardResponsavel
      .deleteMany({ where: { cardId: { in: criados.cardIds } } })
      .catch(() => {});
    await m.cardGrant.deleteMany({ where: { cardId: { in: criados.cardIds } } }).catch(() => {});
    await m.pipeGrant.deleteMany({ where: { pipeId: { in: criados.pipeIds } } }).catch(() => {});
    await m.domainEvent.deleteMany({ where: { pipeId: { in: criados.pipeIds } } }).catch(() => {});
    await m.card.deleteMany({ where: { id: { in: criados.cardIds } } }).catch(() => {});
    const forms = await m.form
      .findMany({ where: { pipeId: { in: criados.pipeIds } }, select: { id: true } })
      .catch(() => [] as Array<{ id: string }>);
    const formIds = forms.map((f) => f.id);
    await m.formVersion.deleteMany({ where: { formId: { in: formIds } } }).catch(() => {});
    await m.form.deleteMany({ where: { id: { in: formIds } } }).catch(() => {});
    await m.phase.deleteMany({ where: { id: { in: criados.phaseIds } } }).catch(() => {});
    await m.pipe.deleteMany({ where: { id: { in: criados.pipeIds } } }).catch(() => {});
    await m.membership.deleteMany({ where: { id: { in: criados.membershipIds } } }).catch(() => {});
    await m.account.deleteMany({ where: { id: { in: criados.accountIds } } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

// ── AC1/AC2 — Criar Tarefa executa PELO motor, alvo determinístico, idempotente, com trilha ────────────

describe('AC2 — Ação Criar Tarefa (TASK_CREATE)', () => {
  it('cria a Tarefa no Pipe alvo, com trilha (Execução/Ação SUCCEEDED) e Evento TASK_CREATED encadeável', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      {
        tipo: 'TASK_CREATE',
        parametros: { title: 'Revisar', vincularCardDoEvento: true },
        refs: [{ tipo: 'PIPE', id: pipeId }],
      },
    ]);

    const eventId = await emitirEvento('CARD_CREATED', 'CARD', cardId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const tarefas = await db().task.findMany({ where: { pipeId, title: 'Revisar' } });
    expect(tarefas).toHaveLength(1);
    criados.taskIds.push(tarefas[0]!.id);
    // Alvo determinístico + vínculo do Card do Evento + chave idempotente determinística.
    expect(tarefas[0]!.cardId).toBe(cardId);
    expect(tarefas[0]!.idempotencyKey).toMatch(/^auto:/);
    expect(tarefas[0]!.creatorMembershipId).toBeNull(); // autoria = principal Automação, não Membership

    // Consome a TRILHA de E4 (4.8): Execução + resultado da Ação, sem trilha paralela.
    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    expect(exec?.state).toBe('SUCCEEDED');
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'TASK_CREATE' },
    });
    expect(resultado?.state).toBe('SUCCEEDED');
    expect(resultado?.targetResourceId).toBe(tarefas[0]!.id);

    // Evento canônico TASK_CREATED emitido pela Ação (mesma tx; encadeável — 4.7).
    const ev = await db().domainEvent.findFirst({
      where: { eventType: 'TASK_CREATED', resourceId: tarefas[0]!.id },
    });
    expect(ev).not.toBeNull();
    expect(ev?.origin).toBe('AUTOMATION');
  });

  it('idempotente: reprocessar o MESMO Evento não cria uma 2ª Tarefa (dedup por Execução do motor)', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      { tipo: 'TASK_CREATE', parametros: { title: 'Unica' }, refs: [{ tipo: 'PIPE', id: pipeId }] },
    ]);
    const eventId = await emitirEvento('CARD_CREATED', 'CARD', cardId, pipeId);

    await engine.processarEventoAgora(ORG_C, eventId);
    await engine.processarEventoAgora(ORG_C, eventId); // redelivery

    const tarefas = await db().task.findMany({ where: { pipeId, title: 'Unica' } });
    expect(tarefas).toHaveLength(1);
    criados.taskIds.push(tarefas[0]!.id);
  });

  it('não-ampliação: responsável inexistente ⇒ DENIED, sem Tarefa criada (regra canônica 5.1)', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      {
        tipo: 'TASK_CREATE',
        parametros: { title: 'ComResp', responsavelMembershipId: randomUUID() },
        refs: [{ tipo: 'PIPE', id: pipeId }],
      },
    ]);
    const eventId = await emitirEvento('CARD_CREATED', 'CARD', cardId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const tarefas = await db().task.findMany({ where: { pipeId, title: 'ComResp' } });
    expect(tarefas).toHaveLength(0);
    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'TASK_CREATE' },
    });
    expect(resultado?.state).toBe('DENIED');
  });

  it('nenhuma ref fora da Org: Pipe alvo inexistente/cross-tenant (invisível sob RLS) ⇒ DENIED NAO_ENCONTRADO', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    // Pipe alvo = id que NÃO existe na Org C (análogo a cross-tenant sob RLS).
    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      {
        tipo: 'TASK_CREATE',
        parametros: { title: 'Fantasma' },
        refs: [{ tipo: 'PIPE', id: randomUUID() }],
      },
    ]);
    const eventId = await emitirEvento('CARD_CREATED', 'CARD', cardId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'TASK_CREATE' },
    });
    expect(resultado?.state).toBe('DENIED');
    expect(resultado?.errorCode).toBe('NAO_ENCONTRADO');
  });
});

// ── AC2 — Criar Solicitação ────────────────────────────────────────────────────────────────────────────

describe('AC2 — Ação Criar Solicitação (REQUEST_CREATE)', () => {
  it('cria a Solicitação no Pipe alvo, com trilha SUCCEEDED e Evento REQUEST_CREATED', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_CREATED', refs: [] }, [
      {
        tipo: 'REQUEST_CREATE',
        parametros: { title: 'Aprovar', description: 'gerada por automação' },
        refs: [{ tipo: 'PIPE', id: pipeId }],
      },
    ]);
    const eventId = await emitirEvento('CARD_CREATED', 'CARD', cardId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const solicitacoes = await db().solicitacao.findMany({ where: { pipeId, title: 'Aprovar' } });
    expect(solicitacoes).toHaveLength(1);
    criados.solicitacaoIds.push(solicitacoes[0]!.id);
    expect(solicitacoes[0]!.idempotencyKey).toMatch(/^auto:/);

    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'REQUEST_CREATE' },
    });
    expect(resultado?.state).toBe('SUCCEEDED');
    const ev = await db().domainEvent.findFirst({
      where: { eventType: 'REQUEST_CREATED', resourceId: solicitacoes[0]!.id },
    });
    expect(ev).not.toBeNull();
  });
});

// ── AC3 — Enviar Notificação reusa a distribuição 5.6 (fecha DEB-5.6-CARD-MOVED-AUTOMATION-WIRING) ──────

describe('AC3 — Ação Enviar Notificação in-app (NOTIFICATION_SEND)', () => {
  it('when CARD_MOVED → notifica as PARTES do Card (5.6): destinatário com acesso recebe', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    const membershipId = await criarContaEMembership();
    // A pessoa é PARTE do Card via concessão DIRETA (`CardGrant` podeLer ATIVO): é candidato da estratégia
    // PARTES_DO_CARD **e** tem acesso ATUAL (o que a distribuição 5.6 revalida — sem acesso, não recebe).
    const grant = await db().cardGrant.create({
      data: {
        orgId: ORG_C,
        cardId,
        membershipId,
        state: 'ACTIVE',
        podeLer: true,
        podeOperar: false,
        podeMover: false,
      },
      select: { id: true },
    });
    criados.responsavelIds.push(grant.id);

    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_MOVED', refs: [] }, [
      {
        tipo: 'NOTIFICATION_SEND',
        parametros: { notificationType: 'CARD_MOVED_BY_AUTOMATION' },
        refs: [],
      },
    ]);
    const eventId = await emitirEvento('CARD_MOVED', 'CARD', cardId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'NOTIFICATION_SEND' },
    });
    expect(resultado?.state).toBe('SUCCEEDED');

    // A Notificação foi criada e ENTREGUE à parte com acesso (reuso integral de 5.6).
    const notif = await db().notification.findFirst({
      where: { type: 'CARD_MOVED_BY_AUTOMATION', resourceId: cardId },
      select: { id: true },
    });
    expect(notif).not.toBeNull();
    criados.notificationIds.push(notif!.id);
    const destinatarios = await db().notificationRecipient.findMany({
      where: { notificationId: notif!.id },
    });
    expect(destinatarios.map((d) => d.recipientMembershipId)).toContain(membershipId);
  });

  it('tipo com estratégia ALVO_DIRETO (destinatário arbitrário) NÃO é permitido ⇒ DENIED', async () => {
    const pipeId = await criarPipe();
    const { cardId } = await criarCard(pipeId);
    // CARD_RESPONSIBLE_ASSIGNED usa ALVO_DIRETO — a Automação não pode fornecer destinatário arbitrário.
    await criarAutomacaoAtiva(pipeId, { tipo: 'CARD_MOVED', refs: [] }, [
      {
        tipo: 'NOTIFICATION_SEND',
        parametros: { notificationType: 'CARD_RESPONSIBLE_ASSIGNED' },
        refs: [],
      },
    ]);
    const eventId = await emitirEvento('CARD_MOVED', 'CARD', cardId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'NOTIFICATION_SEND' },
    });
    expect(resultado?.state).toBe('DENIED');
  });
});

// ── AC1/AC4 — Gatilho TASK_*: uma Automação REAGE a Evento de Tarefa (review 5.7) ───────────────────────

describe('AC1/AC4 — Automação reagindo a Evento TASK_* (snapshot-builder + RESPONSAVEL_TAREFA_ATUAL)', () => {
  /** Cria uma Tarefa direto no banco (como 5.1 faria), com Responsável opcional. */
  async function criarTarefaDireta(pipeId: string, responsavelMembershipId: string | null) {
    const t = await db().task.create({
      data: {
        orgId: ORG_C,
        pipeId,
        title: `t-${randomUUID().slice(0, 8)}`,
        dueVersion: 0,
        responsavelMembershipId,
        lifecycleState: 'ABERTA',
        archiveState: 'ATIVA',
      },
      select: { id: true },
    });
    criados.taskIds.push(t.id);
    return t.id;
  }

  it('when TASK_CREATED → NOTIFICATION_SEND notifica o Responsável ATUAL da Tarefa (estratégia RESPONSAVEL_TAREFA_ATUAL)', async () => {
    const pipeId = await criarPipe();
    const membershipId = await criarContaEMembership();
    // A distribuição 5.6 revalida ACESSO ATUAL ao Pipe dono da Tarefa (fail-closed): sem PipeGrant, o
    // Responsável seria EXCLUÍDO (não-ampliação). O teste dá o acesso que o cenário feliz exige.
    await db().pipeGrant.create({
      data: { orgId: ORG_C, pipeId, membershipId, role: 'MEMBER', state: 'ACTIVE' },
    });
    const taskId = await criarTarefaDireta(pipeId, membershipId);
    // `TASK_OVERDUE` é o tipo de catálogo com estratégia RESPONSAVEL_TAREFA_ATUAL e resourceType TASK.
    await criarAutomacaoAtiva(pipeId, { tipo: 'TASK_CREATED', refs: [] }, [
      { tipo: 'NOTIFICATION_SEND', parametros: { notificationType: 'TASK_OVERDUE' }, refs: [] },
    ]);

    const eventId = await emitirEvento('TASK_CREATED', 'TASK', taskId, pipeId);
    await engine.processarEventoAgora(ORG_C, eventId);

    // A Automação EXECUTOU a partir de um Evento TASK_* (metade "reajam" do AC1) …
    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    expect(exec?.state).toBe('SUCCEEDED');
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'NOTIFICATION_SEND' },
    });
    expect(resultado?.state).toBe('SUCCEEDED');

    // … e o destinatário é o RESPONSÁVEL ATUAL da Tarefa (5.6, sem destinatário arbitrário).
    const notif = await db().notification.findFirst({
      where: { type: 'TASK_OVERDUE', resourceId: taskId },
      select: { id: true },
    });
    expect(notif).not.toBeNull();
    criados.notificationIds.push(notif!.id);
    const destinatarios = await db().notificationRecipient.findMany({
      where: { notificationId: notif!.id },
    });
    expect(destinatarios.map((d) => d.recipientMembershipId)).toContain(membershipId);
  });

  it('contenção M-1: Tarefa de OUTRO Pipe no Evento ⇒ contexto vazio ⇒ Ação DENIED (fail-closed)', async () => {
    const pipeDaAutomacao = await criarPipe();
    const outroPipe = await criarPipe();
    const membershipId = await criarContaEMembership();
    const taskDeOutroPipe = await criarTarefaDireta(outroPipe, membershipId);
    await criarAutomacaoAtiva(pipeDaAutomacao, { tipo: 'TASK_CREATED', refs: [] }, [
      { tipo: 'NOTIFICATION_SEND', parametros: { notificationType: 'TASK_OVERDUE' }, refs: [] },
    ]);

    // Evento apontando o Pipe da Automação, mas com recurso de OUTRO Pipe (envelope adulterado/estado torto).
    const eventId = await emitirEvento('TASK_CREATED', 'TASK', taskDeOutroPipe, pipeDaAutomacao);
    await engine.processarEventoAgora(ORG_C, eventId);

    const exec = await db().automationExecution.findFirst({ where: { eventId } });
    const resultado = await db().automationActionResult.findFirst({
      where: { executionId: exec!.id, actionType: 'NOTIFICATION_SEND' },
    });
    expect(resultado?.state).toBe('DENIED');
    const notif = await db().notification.findFirst({
      where: { type: 'TASK_OVERDUE', resourceId: taskDeOutroPipe },
    });
    expect(notif).toBeNull();
  });
});

// ── Config-time — a fonte REAL do invariante de não-ampliação por Pipe (review 5.7) ─────────────────────

describe('config-time — ref PIPE diferente do proprietário é rejeitada (revalidarReferencias)', () => {
  it('config com alvo PIPE ≠ Pipe proprietário ⇒ 400 REFERENCIA_INALCANCAVEL (fase vermelha do gate)', async () => {
    const { revalidarReferencias } = await import('../src/pipes/automations/automation-references');
    const { validarConfiguracao } = await import('../src/pipes/automations/automation-config');
    const pipeProprietario = await criarPipe();
    const pipeAlheio = await criarPipe(); // existe na MESMA Org — o filtro é por proprietário, não por RLS
    const validada = validarConfiguracao({
      quando: { tipo: 'CARD_CREATED', refs: [] },
      condicoes: [],
      entao: [
        {
          tipo: 'TASK_CREATE',
          parametros: { title: 'x' },
          refs: [{ tipo: 'PIPE', id: pipeAlheio }],
        },
      ],
    });
    await expect(revalidarReferencias(db(), pipeProprietario, validada)).rejects.toMatchObject({
      response: { motivo: 'REFERENCIA_INALCANCAVEL', tipo: 'PIPE' },
    });
    // Fase verde do MESMO gate: a ref do próprio proprietário passa.
    const propria = validarConfiguracao({
      quando: { tipo: 'CARD_CREATED', refs: [] },
      condicoes: [],
      entao: [
        {
          tipo: 'TASK_CREATE',
          parametros: { title: 'x' },
          refs: [{ tipo: 'PIPE', id: pipeProprietario }],
        },
      ],
    });
    await expect(revalidarReferencias(db(), pipeProprietario, propria)).resolves.toBeUndefined();
  });
});
