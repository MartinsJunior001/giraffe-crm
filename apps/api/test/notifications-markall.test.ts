import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { ContextoOrganizacional, RequestContext } from '../src/kernel/context/request-context';
import { NotificationsService } from '../src/notifications/notifications.service';
import type { EventoNotificavel } from '../src/notifications/notifications.dto';

/**
 * "Marcar todas como lidas" com CORTE do servidor (Story 5.4, §1584–1585, D4) — write-side na fonte única,
 * contra PostgreSQL REAL. Prova: (1) marca todas as não-lidas até o corte; (2) idempotente (2ª vez marca 0);
 * (3) NÃO marca uma entrega materializada APÓS o corte (concorrência). Escrita na Org C, ids descartáveis.
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

function contextoFake(): RequestContext {
  const contexto: ContextoOrganizacional = {
    orgId: ORG_C,
    accountId: randomUUID(),
    papel: 'ADMIN',
  };
  return { obter: () => contexto } as unknown as RequestContext;
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: exige PostgreSQL real.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
  service = new NotificationsService(contextoFake(), prisma as unknown as PrismaService, svcLogger);
});

afterAll(async () => {
  await prisma?.$disconnect();
});

/** Registra uma Notificação para `membershipId` e devolve o notificationId. */
async function notificar(membershipId: string): Promise<string> {
  const evento: EventoNotificavel = {
    type: 'TASK_ASSIGNED',
    sourceEventId: randomUUID(),
    resourceType: 'CARD',
    resourceId: randomUUID(),
    recipients: [{ membershipId, userId: randomUUID() }],
  };
  const { notificacao } = await service.registrarNotificacao(evento);
  return notificacao.id;
}

async function readAtDe(membershipId: string, notificationId: string): Promise<Date | null> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const r = await db.notificationRecipient.findFirst({
    where: { notificationId, recipientMembershipId: membershipId },
    select: { readAt: true },
  });
  return r?.readAt ?? null;
}

describe('marcarTodasComoLidas — corte do servidor', () => {
  it('marca todas as não-lidas até o corte e é idempotente', async () => {
    const m = randomUUID();
    const n1 = await notificar(m);
    const n2 = await notificar(m);

    const { marcadas } = await service.marcarTodasComoLidas(m, new Date());
    expect(marcadas).toBe(2);
    expect(await readAtDe(m, n1)).not.toBeNull();
    expect(await readAtDe(m, n2)).not.toBeNull();

    // Idempotente: nada mais a marcar.
    const segunda = await service.marcarTodasComoLidas(m, new Date());
    expect(segunda.marcadas).toBe(0);
  });

  it('NÃO marca uma entrega materializada APÓS o corte (concorrência)', async () => {
    const m = randomUUID();
    const nAntes = await notificar(m);
    const corte = new Date(); // corte fixado ANTES da entrega concorrente
    await sleep(50); // garante createdAt(nDepois) > corte
    const nDepois = await notificar(m);

    const { marcadas } = await service.marcarTodasComoLidas(m, corte);
    expect(marcadas).toBe(1); // só a de antes do corte
    expect(await readAtDe(m, nAntes)).not.toBeNull();
    expect(await readAtDe(m, nDepois)).toBeNull(); // a de depois do corte segue não-lida
  });
});
