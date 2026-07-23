import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `Notification`/`NotificationRecipient` (Story 5.3) contra um PostgreSQL REAL,
 * pelo papel de runtime `giraffe_app` (sem BYPASSRLS, não é dono). Prova: (1) isolamento por Org; (2)
 * `WITH CHECK` no INSERT (orgId alheio negado — fase vermelha); (3) FK COMPOSTA tenant-safe
 * (notificationId de outra Org → violação de FK, não linha invisível); (4) `Notification` APPEND-ONLY (o
 * runtime NÃO tem UPDATE/DELETE); (5) `NotificationRecipient` UPDATE column-scoped — readAt/availabilityState
 * OK; notificationId, recipientMembershipId, orgId, dedupeKey, deliveredAt -> permission denied; e sem DELETE.
 *
 * Área de escrita = Org C, com dados descartáveis (`randomUUID`).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

/** Cria uma Notificação (runtime) na Org dada e devolve seu id. */
async function criarNotificacao(org: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId: org }, semLog);
  const n = await db.notification.create({
    data: {
      orgId: org,
      type: 'TESTE',
      sourceEventId: randomUUID(),
      resourceType: 'CARD',
    },
    select: { id: true },
  });
  return n.id;
}

/** Cria um destinatário (runtime) para uma Notificação na Org dada e devolve seu id. */
async function criarDestinatario(org: string, notificationId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId: org }, semLog);
  const r = await db.notificationRecipient.create({
    data: {
      orgId: org,
      notificationId,
      recipientMembershipId: randomUUID(),
      recipientUserId: randomUUID(),
      dedupeKey: randomUUID(),
    },
    select: { id: true },
  });
  return r.id;
}

describe('isolamento por Organização', () => {
  it('uma Notificação da Org C não é visível pela Org A; INSERT com orgId alheio é negado', async () => {
    const id = await criarNotificacao(ORG_C);
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.notification.findUnique({ where: { id } })).toBeNull();

    // Inserir com orgId alheio (WITH CHECK, sem RETURNING via createMany) → negado.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.notification.createMany({
        data: [{ orgId: ORG_A, type: 'X', sourceEventId: randomUUID(), resourceType: 'CARD' }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('FK COMPOSTA tenant-safe: destinatário com notificationId de OUTRA Org viola a FK (não é invisível)', async () => {
    const idC = await criarNotificacao(ORG_C);
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    await expect(
      dbA.notificationRecipient.create({
        data: {
          orgId: ORG_A,
          notificationId: idC, // notificação da Org C
          recipientMembershipId: randomUUID(),
          recipientUserId: randomUUID(),
          dedupeKey: randomUUID(),
        },
      }),
    ).rejects.toThrow(/foreign key|constraint|violat/i);
  });
});

describe('Notification é APPEND-ONLY no runtime (sem UPDATE/DELETE)', () => {
  it('o runtime NÃO tem UPDATE nem DELETE em Notification', async () => {
    const id = await criarNotificacao(ORG_C);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.notification.updateMany({ where: { id }, data: { type: 'OUTRO' } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(dbC.notification.deleteMany({ where: { id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('NotificationRecipient — GRANT column-scoped (sem DELETE)', () => {
  it('UPDATE de readAt/availabilityState OK; colunas imutáveis → permission denied; sem DELETE', async () => {
    const notificationId = await criarNotificacao(ORG_C);
    const recipientId = await criarDestinatario(ORG_C, notificationId);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Colunas mutáveis → OK.
    await expect(
      dbC.notificationRecipient.updateMany({
        where: { id: recipientId },
        data: { readAt: new Date() },
      }),
    ).resolves.toBeTruthy();
    await expect(
      dbC.notificationRecipient.updateMany({
        where: { id: recipientId },
        data: { availabilityState: 'SUPPRESSED' },
      }),
    ).resolves.toBeTruthy();

    // Colunas NÃO concedidas → permission denied.
    await expect(
      dbC.notificationRecipient.updateMany({ where: { id: recipientId }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.notificationRecipient.updateMany({
        where: { id: recipientId },
        data: { notificationId: randomUUID() },
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.notificationRecipient.updateMany({
        where: { id: recipientId },
        data: { recipientMembershipId: randomUUID() },
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.notificationRecipient.updateMany({
        where: { id: recipientId },
        data: { dedupeKey: randomUUID() },
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.notificationRecipient.updateMany({
        where: { id: recipientId },
        data: { deliveredAt: new Date() },
      }),
    ).rejects.toThrow(/permission denied/i);

    // Sem DELETE (suprimir = availabilityState).
    await expect(
      dbC.notificationRecipient.deleteMany({ where: { id: recipientId } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a dedupeKey única impede um 2º destinatário da mesma pessoa/Evento (idempotência no banco)', async () => {
    const notificationId = await criarNotificacao(ORG_C);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const dedupeKey = randomUUID();
    await dbC.notificationRecipient.create({
      data: {
        orgId: ORG_C,
        notificationId,
        recipientMembershipId: randomUUID(),
        recipientUserId: randomUUID(),
        dedupeKey,
      },
    });
    // 2ª linha com a MESMA dedupeKey (via createMany sem skipDuplicates) → colisão de unicidade.
    await expect(
      dbC.notificationRecipient.createMany({
        data: [
          {
            orgId: ORG_C,
            notificationId,
            recipientMembershipId: randomUUID(),
            recipientUserId: randomUUID(),
            dedupeKey,
          },
        ],
      }),
    ).rejects.toThrow(/unique|constraint|duplicate/i);
  });
});
