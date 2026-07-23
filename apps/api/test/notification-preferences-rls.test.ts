import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `NotificationPreference` (Story 5.4) contra um PostgreSQL REAL, pelo papel de
 * runtime `giraffe_app` (sem BYPASSRLS, não é dono). Prova: (1) isolamento por Org; (2) `WITH CHECK` no INSERT
 * (orgId alheio negado — fase vermelha); (3) UPDATE column-scoped — `enabled` OK; `orgId`/`membershipId`/`type`
 * → permission denied; (4) sem DELETE (mudar preferência é UPDATE/upsert). Escrita = Org C, dados descartáveis.
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

/** Cria uma preferência (runtime) na Org dada e devolve seu id. */
async function criarPreferencia(org: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId: org }, semLog);
  const p = await db.notificationPreference.create({
    data: {
      orgId: org,
      membershipId: randomUUID(),
      type: 'TASK_ASSIGNED',
      enabled: false,
    },
    select: { id: true },
  });
  return p.id;
}

describe('isolamento por Organização', () => {
  it('uma preferência da Org C não é visível pela Org A; INSERT com orgId alheio é negado', async () => {
    const id = await criarPreferencia(ORG_C);
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.notificationPreference.findUnique({ where: { id } })).toBeNull();

    // Inserir com orgId alheio (WITH CHECK, sem RETURNING via createMany) → negado.
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.notificationPreference.createMany({
        data: [{ orgId: ORG_A, membershipId: randomUUID(), type: 'X_TIPO', enabled: true }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('NotificationPreference — GRANT column-scoped (sem DELETE)', () => {
  it('UPDATE de enabled OK; orgId/membershipId/type imutáveis → permission denied; sem DELETE', async () => {
    const id = await criarPreferencia(ORG_C);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Coluna mutável → OK.
    await expect(
      dbC.notificationPreference.updateMany({ where: { id }, data: { enabled: true } }),
    ).resolves.toBeTruthy();

    // Colunas NÃO concedidas → permission denied.
    await expect(
      dbC.notificationPreference.updateMany({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.notificationPreference.updateMany({
        where: { id },
        data: { membershipId: randomUUID() },
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      dbC.notificationPreference.updateMany({ where: { id }, data: { type: 'OUTRO' } }),
    ).rejects.toThrow(/permission denied/i);

    // Sem DELETE (mudar preferência é UPDATE/upsert, nunca remover linha).
    await expect(dbC.notificationPreference.deleteMany({ where: { id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('a unicidade (orgId,membershipId,type) impede 2 preferências do mesmo par pessoa/tipo', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const membershipId = randomUUID();
    await dbC.notificationPreference.create({
      data: { orgId: ORG_C, membershipId, type: 'DUP_TIPO', enabled: true },
    });
    await expect(
      dbC.notificationPreference.createMany({
        data: [{ orgId: ORG_C, membershipId, type: 'DUP_TIPO', enabled: false }],
      }),
    ).rejects.toThrow(/unique|constraint|duplicate/i);
  });
});
