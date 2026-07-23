import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { ContextoOrganizacional, RequestContext } from '../src/kernel/context/request-context';
import { NotificationsService } from '../src/notifications/notifications.service';
import type { EventoNotificavel } from '../src/notifications/notifications.dto';

/**
 * Provas COMPORTAMENTAIS da fonte única de escrita de Notificações (Story 5.3) contra um PostgreSQL REAL,
 * dirigindo o `NotificationsService` de ponta a ponta (o serviço testado É o consumidor concreto do modelo —
 * Constitution: sem abstração especulativa). Postgres fora ⇒ suíte VERMELHA, não pulada. Escrita na Org C
 * com ids descartáveis (`randomUUID`).
 *
 * Cobre: AC1 (grava 1 conteúdo imutável + 1 registro por destinatário, `readAt` derivado); AC2 (reprocesso +
 * múltiplos papéis → sem duplicidade, conteúdo congelado); AC4 (params sanitizado — `<script>` escapado, sem
 * objeto aninhado/token); `marcarComoLida` idempotente + `readAt`.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const svcLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as PinoLogger;

const databaseUrl = process.env.DATABASE_URL;
let prisma: PrismaClient;
let service: NotificationsService;

/** Contexto fixo da Org C — um `RequestContext` fake (o guard real é da 5.4, não desta Story). */
function contextoFake(): RequestContext {
  const contexto: ContextoOrganizacional = {
    orgId: ORG_C,
    accountId: randomUUID(),
    papel: 'ADMIN',
  };
  return { obter: () => contexto } as unknown as RequestContext;
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: a fonte única exige PostgreSQL real.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
  service = new NotificationsService(contextoFake(), prisma as unknown as PrismaService, svcLogger);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

function eventoBase(over: Partial<EventoNotificavel> = {}): EventoNotificavel {
  return {
    type: 'TASK_ASSIGNED',
    sourceEventId: randomUUID(),
    resourceType: 'CARD',
    resourceId: randomUUID(),
    actorId: randomUUID(),
    params: { titulo: 'Ola' },
    recipients: [{ membershipId: randomUUID(), userId: randomUUID() }],
    ...over,
  };
}

async function contarRecipients(notificationId: string): Promise<number> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  return db.notificationRecipient.count({ where: { notificationId } });
}

describe('AC1 — gera Notificação (1 conteúdo imutável + 1 registro por destinatário, readAt derivado)', () => {
  it('grava 1 Notification e N NotificationRecipient com readAt nulo (lida=false derivado)', async () => {
    const m1 = randomUUID();
    const m2 = randomUUID();
    const evento = eventoBase({
      recipients: [
        { membershipId: m1, userId: randomUUID() },
        { membershipId: m2, userId: randomUUID() },
      ],
    });
    const { notificacao, destinatariosCriados } = await service.registrarNotificacao(evento);

    expect(destinatariosCriados).toBe(2);
    expect(notificacao.type).toBe('TASK_ASSIGNED');
    expect(notificacao.typeVersion).toBe(1);
    expect((notificacao as unknown as { orgId?: string }).orgId).toBeUndefined();
    expect(await contarRecipients(notificacao.id)).toBe(2);

    // readAt nulo ⇒ lida derivado = false (não há booleano persistido).
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const recs = await db.notificationRecipient.findMany({
      where: { notificationId: notificacao.id },
      select: { readAt: true },
    });
    expect(recs.every((r) => r.readAt === null)).toBe(true);
  });
});

describe('AC2 — sem duplicidade (reprocesso e múltiplos papéis do mesmo destinatário)', () => {
  it('reprocessar o MESMO evento não cria 2º conteúdo nem 2º destinatário (idempotente)', async () => {
    const evento = eventoBase();
    const primeira = await service.registrarNotificacao(evento);
    expect(primeira.destinatariosCriados).toBe(1);

    const segunda = await service.registrarNotificacao(evento);
    expect(segunda.notificacao.id).toBe(primeira.notificacao.id); // mesmo conteúdo
    expect(segunda.destinatariosCriados).toBe(0); // nenhum novo destinatário
    expect(await contarRecipients(primeira.notificacao.id)).toBe(1);
  });

  it('múltiplos papéis que resolvem para a MESMA pessoa colapsam num único destinatário', async () => {
    const m = randomUUID();
    const u = randomUUID();
    const evento = eventoBase({
      recipients: [
        { membershipId: m, userId: u },
        { membershipId: m, userId: u }, // mesmo papel repetido
        { membershipId: m, userId: u },
      ],
    });
    const { notificacao, destinatariosCriados } = await service.registrarNotificacao(evento);
    expect(destinatariosCriados).toBe(1);
    expect(await contarRecipients(notificacao.id)).toBe(1);
  });

  it('reprocesso com params DIFERENTES NÃO sobrescreve o conteúdo congelado (imutável)', async () => {
    const evento = eventoBase({ params: { titulo: 'original' } });
    const primeira = await service.registrarNotificacao(evento);

    const reprocesso = await service.registrarNotificacao({
      ...evento,
      params: { titulo: 'alterado' },
    });
    expect(reprocesso.notificacao.id).toBe(primeira.notificacao.id);
    expect((reprocesso.notificacao.params as Record<string, unknown>).titulo).toBe('original');
  });
});

describe('AC4 — sanitização no write (sem payload/token; HTML escapado)', () => {
  it('escapa <script> e descarta objeto aninhado/token dos params', async () => {
    const evento = eventoBase({
      params: {
        titulo: '<script>alert(1)</script>',
        segredo: { token: 'abc123' }, // objeto aninhado → descartado
        nota: 'ok',
      },
    });
    const { notificacao } = await service.registrarNotificacao(evento);
    const params = notificacao.params as Record<string, unknown>;
    expect(String(params.titulo)).not.toContain('<script>');
    expect(String(params.titulo)).toContain('&lt;script&gt;');
    expect(params.segredo).toBeUndefined();
    expect(params.nota).toBe('ok');
  });

  it('rejeita entrada malformada (tipo/sourceEventId) — fail-closed', async () => {
    await expect(service.registrarNotificacao(eventoBase({ type: 'minusculo' }))).rejects.toThrow(
      /tipo/i,
    );
    await expect(
      service.registrarNotificacao(eventoBase({ sourceEventId: 'nao-uuid' })),
    ).rejects.toThrow(/sourceEventId/i);
    await expect(service.registrarNotificacao(eventoBase({ recipients: [] }))).rejects.toThrow(
      /destinat/i,
    );
  });
});

describe('marcarComoLida — write-side auditável, idempotente (readAt)', () => {
  it('marca readAt e é idempotente; estado lido é derivado', async () => {
    const m = randomUUID();
    const evento = eventoBase({ recipients: [{ membershipId: m, userId: randomUUID() }] });
    const { notificacao } = await service.registrarNotificacao(evento);

    const lida1 = await service.marcarComoLida(notificacao.id, m);
    expect(lida1.readAt).not.toBeNull();
    expect(lida1.lida).toBe(true);

    // Idempotente: 2ª chamada devolve o mesmo readAt, sem erro.
    const lida2 = await service.marcarComoLida(notificacao.id, m);
    expect(lida2.lida).toBe(true);
    expect(lida2.readAt?.getTime()).toBe(lida1.readAt?.getTime());
  });

  it('destinatário inexistente → 404 (não-enumerante)', async () => {
    const evento = eventoBase();
    const { notificacao } = await service.registrarNotificacao(evento);
    await expect(service.marcarComoLida(notificacao.id, randomUUID())).rejects.toMatchObject({
      status: 404,
    });
  });
});
