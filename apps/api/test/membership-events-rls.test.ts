import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco do EVENTO CANÔNICO de Membership (`MembershipEvent`, Story 8.4) contra um PostgreSQL
 * REAL, pelo papel de runtime `giraffe_app`. Prova o que só o banco garante:
 *   1. APPEND-ONLY e IMUTÁVEL: runtime tem SELECT+INSERT, mas UPDATE/DELETE batem em `permission denied`
 *      — "não se altera nem apaga o fato histórico" é do GRANT (como MovementEvent/CardHistory);
 *   2. idempotência lógica: 2º INSERT com o MESMO `(orgId, eventId)` é rejeitado pelo UNIQUE (outbox);
 *   3. RLS isola: evento de outra Org some na leitura (0 linhas), e INSERT com `orgId` alheio é barrado
 *      pelo WITH CHECK (via `createMany`, sem RETURNING — que esbarraria na policy de SELECT e poderia
 *      MASCARAR um WITH CHECK desligado).
 * Escreve na Org C (área de escrita), com conta/Membership DESCARTÁVEIS (`randomUUID`).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

const conta = randomUUID();
const membId = randomUUID();
const eventRowId = randomUUID();
const eventId = randomUUID();
const correlationId = randomUUID();

function dadosEvento(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orgId: ORG_C,
    eventId,
    membershipId: membId,
    type: 'ROLE_CHANGED',
    fromRole: 'MEMBER',
    toRole: 'ADMIN',
    actorId: conta,
    correlationId,
    version: 1,
    payload: {},
    ...over,
  };
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  await migrator.account.create({
    data: { id: conta, email: `me-rls-${conta}@exemplo.test`, name: 'Membro Evento RLS' },
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: { id: membId, accountId: conta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
  });
  await dbC.membershipEvent.create({ data: { id: eventRowId, ...dadosEvento() } as never });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.membership.deleteMany({ where: { id: membId } }).catch(() => {});
    await migrator.account.deleteMany({ where: { id: conta } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('MembershipEvent é append-only: runtime SELECT+INSERT, sem UPDATE/DELETE', () => {
  it('runtime LÊ o evento da própria Org (1 linha)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const achados = await dbC.membershipEvent.findMany({
      where: { membershipId: membId },
      select: { id: true },
    });
    expect(achados.map((e) => e.id)).toContain(eventRowId);
  });

  it('runtime INSERE um novo evento (outra operação) da própria Org', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const nova = await dbC.membershipEvent.create({
      data: dadosEvento({ eventId: randomUUID(), correlationId: randomUUID() }) as never,
      select: { id: true },
    });
    expect(nova.id).toBeTruthy();
  });

  it('UPDATE bate em permission denied (imutável — o fato não é reescrito)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.membershipEvent.updateMany({ where: { id: eventRowId }, data: { toRole: 'GUEST' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE bate em permission denied (sem exclusão do fato histórico)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.membershipEvent.deleteMany({ where: { id: eventRowId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('MembershipEvent — idempotência lógica e RLS', () => {
  it('2º INSERT com o mesmo (orgId, eventId) é rejeitado pelo UNIQUE (outbox idempotente)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.membershipEvent.create({ data: dadosEvento() as never })).rejects.toThrow(
      /unique|constraint|P2002/i,
    );
  });

  it('outra Org não enxerga o evento (0 linhas)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const achados = await dbA.membershipEvent.findMany({
      where: { membershipId: membId },
      select: { id: true },
    });
    expect(achados).toHaveLength(0);
  });

  it('INSERT com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    await expect(
      dbA.membershipEvent.createMany({
        data: [dadosEvento({ eventId: randomUUID(), correlationId: randomUUID() })] as never,
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});
