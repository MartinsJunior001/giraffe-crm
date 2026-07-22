import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Fronteira de banco da Story 8.6 contra um PostgreSQL REAL, pelo papel de runtime `giraffe_app`. Prova
 * o que só o banco garante, e que a 8.6 acrescenta:
 *
 *   1. **DEB-MEMBERSHIP-EVENT-CASCADE fechado:** o runtime NÃO tem mais DELETE em `Membership` —
 *      `DELETE`/`deleteMany` batem em `permission denied`, na própria Org inclusive. "Remoção é `state`,
 *      nunca DELETE físico" é do GRANT (a migration `REVOKE DELETE`), não da ausência de rota. Isso
 *      elimina a cascata que apagaria os `MembershipEvent` append-only daquela Org (ações referenciais
 *      rodam com bypass de row security + como dono). O runtime SEGUE podendo INSERT/UPDATE (remoção
 *      lógica via `state = REMOVED`).
 *   2. **evento `REMOVED` é append-only/imutável:** um `MembershipEvent` do tipo novo tem UPDATE/DELETE
 *      negados (herda o GRANT SELECT+INSERT da 8.4 — a 8.6 só ACRESCENTA o tipo).
 *
 * Escreve na Org C (área de escrita), com conta/Membership DESCARTÁVEIS (`randomUUID`). Setup/faxina pelo
 * MIGRATOR (dono das tabelas, imune ao GRANT do runtime); as PROVAS de negação rodam pelo runtime.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

const conta = randomUUID();
const membId = randomUUID();
const eventRowId = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  await migrator.account.create({
    data: { id: conta, email: `me86-rls-${conta}@exemplo.test`, name: 'Membro 8.6 RLS' },
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: { id: membId, accountId: conta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
  });
  // Evento do tipo NOVO (`REMOVED`), inserido pelo migrator para a prova de imutabilidade.
  await dbC.membershipEvent.create({
    data: {
      id: eventRowId,
      orgId: ORG_C,
      eventId: randomUUID(),
      membershipId: membId,
      type: 'REMOVED',
      fromRole: 'MEMBER',
      toRole: 'MEMBER',
      actorId: conta,
      correlationId: randomUUID(),
      version: 1,
      payload: { fromState: 'ACTIVE', toState: 'REMOVED', saidaVoluntaria: false },
    } as never,
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    // A faxina usa o MIGRATOR (dono), que segue com DELETE — o REVOKE é só do runtime.
    await dbC.membership.deleteMany({ where: { id: membId } }).catch(() => {});
    await migrator.account.deleteMany({ where: { id: conta } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('DEB-MEMBERSHIP-EVENT-CASCADE fechado: runtime sem DELETE em Membership', () => {
  it('runtime AINDA faz a REMOÇÃO LÓGICA via UPDATE de state (o encerramento da 8.6 não usa DELETE)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // Encerrar é `state = REMOVED` — UPDATE, sob o GRANT preservado. Depois restauramos para não
    // interferir nas provas de DELETE abaixo (que precisam da linha existente).
    const removida = await dbC.membership.update({
      where: { id: membId },
      data: { state: 'REMOVED' },
    });
    expect(removida.state).toBe('REMOVED');
    await dbC.membership.update({ where: { id: membId }, data: { state: 'ACTIVE' } });
  });

  it('DELETE de um registro pelo runtime bate em permission denied (fase vermelha em red-phase.md)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.membership.delete({ where: { id: membId } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('deleteMany pelo runtime (própria Org) bate em permission denied — não filtra para count 0', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.membership.deleteMany({ where: { id: membId } })).rejects.toThrow(
      /permission denied/i,
    );
    // A linha continua existindo — o DELETE nunca chega a rodar.
    const aindaLa = await dbC.membership.findUnique({
      where: { id: membId },
      select: { id: true },
    });
    expect(aindaLa?.id).toBe(membId);
  });
});

describe('MembershipEvent tipo REMOVED é append-only/imutável (herda o GRANT da 8.4)', () => {
  it('runtime LÊ o evento REMOVED da própria Org', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const achado = await dbC.membershipEvent.findUnique({
      where: { id: eventRowId },
      select: { type: true },
    });
    expect(achado?.type).toBe('REMOVED');
  });

  it('UPDATE do evento REMOVED bate em permission denied (o fato não é reescrito)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.membershipEvent.updateMany({ where: { id: eventRowId }, data: { toRole: 'GUEST' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE do evento REMOVED bate em permission denied (sem exclusão do fato histórico)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.membershipEvent.deleteMany({ where: { id: eventRowId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
