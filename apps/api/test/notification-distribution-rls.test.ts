import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { ContextoOrganizacional, RequestContext } from '../src/kernel/context/request-context';
import { NotificationsService } from '../src/notifications/notifications.service';
import { NotificationDistributionService } from '../src/notifications/distribution/notification-distribution.service';
import { TaskOverdueService } from '../src/tasks/task-overdue.service';

/**
 * Provas COMPORTAMENTAIS da distribuição de Notificações (Story 5.6) contra um PostgreSQL REAL, dirigindo o
 * `NotificationDistributionService` de ponta a ponta (o serviço testado É o consumidor concreto). Postgres fora
 * ⇒ suíte VERMELHA. Escreve na Org C com contas descartáveis (`randomUUID`) — nunca reusa fixtures de leitura.
 *
 * Cobre o gate OQ-33: resolução por tipo (só Membership ativa + acesso atual; ninguém fora da Org), dedup
 * (múltiplos papéis → 1), preferências ANTES da entrega (silenciado → sem entrega), ausência → resultado
 * EXPLÍCITO, regra do ator, idempotência via fonte 5.3, isolamento cross-tenant, e os tipos de E5 + a
 * distribuição de "movido por Automação".
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const svcLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as PinoLogger;

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)
let distribuicao: NotificationDistributionService;
let overdue: TaskOverdueService;

// Contas globais descartáveis.
const contaR = randomUUID(); // destinatário COM acesso
const contaAtor = randomUUID(); // ator
const contaSem = randomUUID(); // ativa, SEM acesso ao Pipe
const contaInativa = randomUUID(); // SUSPENDED
const contaPref = randomUUID(); // com acesso, mas silencia o tipo

const mR = randomUUID();
const mAtor = randomUUID();
const mSem = randomUUID();
const mInativa = randomUUID();
const mPref = randomUUID();

const pipeId = randomUUID();
const phaseId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();
const cardId = randomUUID();
const taskId = randomUUID();
const overdueTaskId = randomUUID();

/** Contexto fixo da Org C — `RequestContext` fake (a distribuição usa o caminho context-explícito). */
function contextoFake(): RequestContext {
  const contexto: ContextoOrganizacional = { orgId: ORG_C, accountId: contaAtor, papel: 'ADMIN' };
  return { obter: () => contexto } as unknown as RequestContext;
}

async function contarRecipients(type: string, resourceId: string): Promise<number> {
  const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const n = await dbC.notification.findFirst({ where: { type, resourceId }, select: { id: true } });
  if (!n) return 0;
  return dbC.notificationRecipient.count({ where: { notificationId: n.id } });
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: a distribuição exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Contas GLOBAIS (sem RLS) — criadas antes das Memberships que as referenciam.
  await migrator.account.createMany({
    data: [
      { id: contaR, email: `dist-r-${contaR}@exemplo.test`, name: 'Destinatário' },
      { id: contaAtor, email: `dist-ator-${contaAtor}@exemplo.test`, name: 'Ator' },
      { id: contaSem, email: `dist-sem-${contaSem}@exemplo.test`, name: 'Sem acesso' },
      { id: contaInativa, email: `dist-in-${contaInativa}@exemplo.test`, name: 'Inativa' },
      { id: contaPref, email: `dist-pref-${contaPref}@exemplo.test`, name: 'Silencia' },
    ],
  });

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: mR, orgId: ORG_C, accountId: contaR, role: 'MEMBER', state: 'ACTIVE' },
      { id: mAtor, orgId: ORG_C, accountId: contaAtor, role: 'MEMBER', state: 'ACTIVE' },
      { id: mSem, orgId: ORG_C, accountId: contaSem, role: 'MEMBER', state: 'ACTIVE' },
      { id: mInativa, orgId: ORG_C, accountId: contaInativa, role: 'MEMBER', state: 'SUSPENDED' },
      { id: mPref, orgId: ORG_C, accountId: contaPref, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe (dist 5.6)' } });
  await dbC.phase.create({
    data: { id: phaseId, orgId: ORG_C, pipeId, name: 'A Fazer', position: '1' },
  });
  // PipeGrant MEMBER → acesso ao Pipe/Card para R, Ator e Pref. SEM e Inativa não recebem grant.
  await dbC.pipeGrant.createMany({
    data: [
      { orgId: ORG_C, pipeId, membershipId: mR, role: 'MEMBER' },
      { orgId: ORG_C, pipeId, membershipId: mAtor, role: 'MEMBER' },
      { orgId: ORG_C, pipeId, membershipId: mPref, role: 'MEMBER' },
    ],
  });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId } });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId: ORG_C,
      formId,
      version: 1,
      snapshot: { formId, fields: [] },
      revision: 'r1',
    },
  });
  await dbC.card.create({
    data: {
      id: cardId,
      orgId: ORG_C,
      pipeId,
      phaseId,
      formId,
      formVersionId,
      idempotencyKey: `dist-${cardId}`,
      valores: {},
    },
  });
  // Card: R é Responsável ATUAL e TAMBÉM tem concessão direta (múltiplos papéis → dedup).
  await dbC.cardResponsavel.create({ data: { orgId: ORG_C, cardId, membershipId: mR } });
  await dbC.cardGrant.create({
    data: { orgId: ORG_C, cardId, membershipId: mR, podeLer: true, podeOperar: true },
  });
  // Tarefa (para acesso Pipe-scoped) + Tarefa atrasada (dueAt no passado, ABERTA+ATIVA).
  await dbC.task.create({
    data: {
      id: taskId,
      orgId: ORG_C,
      pipeId,
      title: 'Tarefa alvo',
      dueVersion: 0,
      responsavelMembershipId: mR,
      lifecycleState: 'ABERTA',
      archiveState: 'ATIVA',
    },
  });
  await dbC.task.create({
    data: {
      id: overdueTaskId,
      orgId: ORG_C,
      pipeId,
      title: 'Tarefa atrasada',
      dueAt: new Date(Date.now() - 3_600_000),
      dueVersion: 0,
      responsavelMembershipId: mR,
      lifecycleState: 'ABERTA',
      archiveState: 'ATIVA',
    },
  });
  // Preferência: mPref SILENCIA CARD_RESPONSIBLE_ASSIGNED.
  await dbC.notificationPreference.create({
    data: { orgId: ORG_C, membershipId: mPref, type: 'CARD_RESPONSIBLE_ASSIGNED', enabled: false },
  });

  const notifications = new NotificationsService(
    contextoFake(),
    prisma as unknown as PrismaService,
    svcLogger,
  );
  distribuicao = new NotificationDistributionService(
    prisma as unknown as PrismaService,
    svcLogger,
    notifications,
  );
  overdue = new TaskOverdueService(prisma as unknown as PrismaService, svcLogger, distribuicao);
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.task.deleteMany({ where: { pipeId } }).catch(() => {});
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {});
    await dbC.membership
      .deleteMany({ where: { id: { in: [mR, mAtor, mSem, mInativa, mPref] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [contaR, contaAtor, contaSem, contaInativa, contaPref] } } })
      .catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

const ctx = () => ({ orgId: ORG_C, actorId: contaAtor });

describe('AC1 — entrega ao alvo com acesso; ator excluído', () => {
  it('TASK_RESPONSIBLE_ASSIGNED entrega 1 Notificação ao Responsável com acesso ao Pipe', async () => {
    const r = await distribuicao.distribuir(ctx(), {
      type: 'TASK_RESPONSIBLE_ASSIGNED',
      resourceId: taskId,
      sourceEventId: randomUUID(),
      alvosDiretos: [mR],
    });
    expect(r.tipo).toBe('entregue');
    if (r.tipo === 'entregue') expect(r.destinatariosCriados).toBe(1);
    expect(await contarRecipients('TASK_RESPONSIBLE_ASSIGNED', taskId)).toBe(1);
  });

  it('exclui o ator: quem se atribui não recebe da própria ação → resultado explícito', async () => {
    const r = await distribuicao.distribuir(ctx(), {
      type: 'TASK_RESPONSIBLE_ASSIGNED',
      resourceId: taskId,
      sourceEventId: randomUUID(),
      alvosDiretos: [mAtor], // Membership do próprio ator
    });
    expect(r.tipo).toBe('sem_destinatario');
    if (r.tipo === 'sem_destinatario') expect(r.motivo).toBe('nenhum_candidato_resolvido');
  });
});

describe('AC1 — dedup (múltiplos papéis → 1 Notificação)', () => {
  it('CARD_MOVED_BY_AUTOMATION: R como Responsável E concessão direta colapsa em 1 destinatário', async () => {
    const r = await distribuicao.distribuir(
      { orgId: ORG_C, actorId: null }, // automação (sistema)
      { type: 'CARD_MOVED_BY_AUTOMATION', resourceId: cardId, sourceEventId: randomUUID() },
    );
    expect(r.tipo).toBe('entregue');
    if (r.tipo === 'entregue') expect(r.destinatariosCriados).toBe(1);
    expect(await contarRecipients('CARD_MOVED_BY_AUTOMATION', cardId)).toBe(1);
  });
});

describe('AC1 — só Membership ativa com acesso atual', () => {
  it('destinatário SEM acesso ao recurso → resultado explícito (nenhum_com_acesso_atual)', async () => {
    const r = await distribuicao.distribuir(ctx(), {
      type: 'TASK_RESPONSIBLE_ASSIGNED',
      resourceId: taskId,
      sourceEventId: randomUUID(),
      alvosDiretos: [mSem], // ativa, mas sem PipeGrant
    });
    expect(r.tipo).toBe('sem_destinatario');
    if (r.tipo === 'sem_destinatario') expect(r.motivo).toBe('nenhum_com_acesso_atual');
  });

  it('Membership inativa (SUSPENDED) nunca é candidato', async () => {
    const r = await distribuicao.distribuir(ctx(), {
      type: 'TASK_RESPONSIBLE_ASSIGNED',
      resourceId: taskId,
      sourceEventId: randomUUID(),
      alvosDiretos: [mInativa],
    });
    expect(r.tipo).toBe('sem_destinatario');
    if (r.tipo === 'sem_destinatario') expect(r.motivo).toBe('nenhum_candidato_resolvido');
  });
});

describe('AC1 — preferências aplicadas ANTES da entrega', () => {
  it('tipo silenciado pelo destinatário → sem entrega (todos_silenciados)', async () => {
    const r = await distribuicao.distribuir(ctx(), {
      type: 'CARD_RESPONSIBLE_ASSIGNED',
      resourceId: cardId,
      sourceEventId: randomUUID(),
      alvosDiretos: [mPref], // silenciou CARD_RESPONSIBLE_ASSIGNED
    });
    expect(r.tipo).toBe('sem_destinatario');
    if (r.tipo === 'sem_destinatario') expect(r.motivo).toBe('todos_silenciados');
  });
});

describe('AC1 — idempotência via fonte 5.3', () => {
  it('reprocessar o MESMO sourceEventId não cria 2º destinatário', async () => {
    const sourceEventId = randomUUID();
    const entrada = {
      type: 'CARD_RESPONSIBLE_ASSIGNED' as const,
      resourceId: cardId,
      sourceEventId,
      alvosDiretos: [mR],
    };
    const primeira = await distribuicao.distribuir(ctx(), entrada);
    const segunda = await distribuicao.distribuir(ctx(), entrada);
    expect(primeira.tipo).toBe('entregue');
    expect(segunda.tipo).toBe('entregue');
    if (primeira.tipo === 'entregue') expect(primeira.destinatariosCriados).toBe(1);
    if (segunda.tipo === 'entregue') expect(segunda.destinatariosCriados).toBe(0);
    if (primeira.tipo === 'entregue' && segunda.tipo === 'entregue') {
      expect(segunda.notificationId).toBe(primeira.notificationId);
    }
  });
});

describe('AC3 — isolamento cross-tenant (ninguém fora da Org recebe)', () => {
  it('distribuir sob Org A referenciando um Card da Org C não resolve destinatário nenhum', async () => {
    const r = await distribuicao.distribuir(
      { orgId: ORG_A, actorId: null },
      { type: 'CARD_MOVED_BY_AUTOMATION', resourceId: cardId, sourceEventId: randomUUID() },
    );
    expect(r.tipo).toBe('sem_destinatario');
    // Nada foi materializado na Org A (RLS isolou o Card).
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const n = await dbA.notification.findFirst({
      where: { type: 'CARD_MOVED_BY_AUTOMATION', resourceId: cardId },
      select: { id: true },
    });
    expect(n).toBeNull();
  });
});

describe('AC2 — fail-closed: slots E6/E8 e tipos desconhecidos', () => {
  it('distribuir um SLOT (registrado, sem produtor) lança', async () => {
    await expect(
      distribuicao.distribuir(ctx(), {
        type: 'INVITE_ACCEPTED',
        resourceId: cardId,
        sourceEventId: randomUUID(),
      }),
    ).rejects.toThrow(/produtor|desconhecido/i);
  });

  it('distribuir um tipo desconhecido lança', async () => {
    await expect(
      distribuicao.distribuir(ctx(), {
        type: 'NAO_EXISTE',
        resourceId: cardId,
        sourceEventId: randomUUID(),
      }),
    ).rejects.toThrow(/desconhecido/i);
  });
});

describe('TASK_OVERDUE — sistema, end-to-end via escanearOrg', () => {
  it('o scan materializa a ocorrência e distribui a Notificação ao Responsável', async () => {
    const count = await overdue.escanearOrg(ORG_C);
    expect(count).toBeGreaterThanOrEqual(1);
    // A Notificação TASK_OVERDUE da minha Tarefa foi entregue ao Responsável (mR, com acesso).
    expect(await contarRecipients('TASK_OVERDUE', overdueTaskId)).toBe(1);
  });

  it('re-scan é idempotente (sourceEventId determinístico por ocorrência) — sem nova Notificação', async () => {
    await overdue.escanearOrg(ORG_C);
    expect(await contarRecipients('TASK_OVERDUE', overdueTaskId)).toBe(1);
  });
});
