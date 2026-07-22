import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  definirContextoOrg,
  withTenantContext,
  type TenantLogger,
} from '../src/kernel/db/tenant-context';
import { emitirEventoDeDominio } from '../src/domain-events/domain-event-emission';

/**
 * Emissão opt-in pós-persistência (Story 4.3) contra um PostgreSQL REAL — o teste adversarial (b): **não há
 * Evento sem o fato**. O helper `emitirEventoDeDominio` insere DENTRO da transação do produtor; o rollback do
 * fato reverte o Evento por construção. Também prova a idempotência pelo `eventId` determinístico (f).
 *
 * Escrita na **Org C** com Pipe descartável (`randomUUID`) — nunca reusar fixtures de leitura (TEST-ISO-01).
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
const eventosCriados: string[] = [];

async function criarPipe(): Promise<string> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId: ORG_C, name: `pipe-emit-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipesCriados.push(pipe.id);
  return pipe.id;
}

async function existeEvento(eventId: string): Promise<boolean> {
  const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
  return (await db.domainEvent.count({ where: { eventId } })) > 0;
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: exige um PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    if (eventosCriados.length > 0) {
      await db.domainEvent.deleteMany({ where: { eventId: { in: eventosCriados } } });
    }
    for (const id of pipesCriados) await db.pipe.deleteMany({ where: { id } });
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

/** Dados de um CARD_CREATED numa operação identificada por `correlationId` (= resourceId, determinístico). */
function dados(pipeId: string, resourceId: string) {
  return {
    eventType: 'CARD_CREATED',
    pipeId,
    resourceType: 'CARD',
    resourceId,
    actorId: null,
    origin: 'SUBMISSION',
    occurredAt: new Date(),
    correlationId: resourceId,
    payload: { pipeId, cardId: resourceId },
  } as const;
}

describe('emissão opt-in pós-persistência na MESMA transação (b, AD-13)', () => {
  it('COMMIT: o Evento persiste junto com o fato', async () => {
    const pipeId = await criarPipe();
    const resourceId = randomUUID();
    const eventId = await prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, { orgId: ORG_C })) await p;
      const r = await emitirEventoDeDominio(tx, { orgId: ORG_C }, dados(pipeId, resourceId));
      return r.eventId;
    });
    eventosCriados.push(eventId);
    expect(await existeEvento(eventId)).toBe(true);
  });

  it('ROLLBACK do fato reverte o Evento — não há Evento sem o fato', async () => {
    const pipeId = await criarPipe();
    const resourceId = randomUUID();
    let eventId = '';
    await expect(
      prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, { orgId: ORG_C })) await p;
        const r = await emitirEventoDeDominio(tx, { orgId: ORG_C }, dados(pipeId, resourceId));
        eventId = r.eventId;
        // O "fato" falha DEPOIS da emissão: a transação inteira faz rollback (AD-13).
        throw new Error('fato falhou — rollback deliberado');
      }),
    ).rejects.toThrow(/rollback deliberado/);
    expect(eventId).not.toBe('');
    expect(await existeEvento(eventId)).toBe(false);
  });
});

describe('idempotência pelo eventId determinístico (f)', () => {
  it('reprocessar o MESMO fato colide no UNIQUE (P2002) — nunca duplica', async () => {
    const pipeId = await criarPipe();
    const resourceId = randomUUID();

    const eventId = await prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, { orgId: ORG_C })) await p;
      return (await emitirEventoDeDominio(tx, { orgId: ORG_C }, dados(pipeId, resourceId))).eventId;
    });
    eventosCriados.push(eventId);

    // 2ª emissão do mesmo fato (mesmo resourceId+correlationId ⇒ mesmo eventId) → colisão no banco.
    await expect(
      prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, { orgId: ORG_C })) await p;
        return emitirEventoDeDominio(tx, { orgId: ORG_C }, dados(pipeId, resourceId));
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
