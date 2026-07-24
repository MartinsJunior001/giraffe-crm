import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `EmailTemplate`/`EmailTemplateVersion` (Story 6.2) contra um PostgreSQL
 * REAL, pelo papel de runtime. Prova: (1) isolamento por Org; (2) WITH CHECK no INSERT (createMany, sem
 * RETURNING); (3) **`EmailTemplateVersion` é IMUTÁVEL pelo banco** — UPDATE e DELETE → permission denied
 * (é o que garante o AC-2: enviados/Execuções nunca mudam); (4) `EmailTemplate` sem DELETE + UPDATE
 * column-scoped (autoria/orgId imutáveis; colunas mutáveis provadas positivamente); (5) FK composta
 * tenant-safe rejeita `templateId` alheio; (6) numeração UNIQUE colide (P2002).
 *
 * Área de escrita = Org C, recursos descartáveis (TEST-ISO-01); faxina escopada aos ids criados.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)
let migrator: PrismaClient; // dono (giraffe_migrator)

const membershipC = randomUUID();
const templatesCriados: string[] = [];
let templateA = ''; // Template descartável na Org A (prova da FK composta cross-tenant)

function dbRuntime(orgId: string) {
  return withTenantContext(prisma, { orgId }, semLog);
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
  const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const t = await dbA.emailTemplate.create({
    data: {
      orgId: ORG_A,
      name: `t-${randomUUID().slice(0, 8)}`,
      createdByMembershipId: randomUUID(),
    },
    select: { id: true },
  });
  templateA = t.id;
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.emailTemplateVersion
      .deleteMany({ where: { templateId: { in: templatesCriados } } })
      .catch(() => {});
    await dbC.emailTemplate.deleteMany({ where: { id: { in: templatesCriados } } }).catch(() => {});
    const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await dbA.emailTemplate.deleteMany({ where: { id: templateA } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

async function criarTemplateC(): Promise<string> {
  const t = await dbRuntime(ORG_C).emailTemplate.create({
    data: { orgId: ORG_C, name: 'RLS C', activeVersion: 1, createdByMembershipId: membershipC },
    select: { id: true },
  });
  templatesCriados.push(t.id);
  await dbRuntime(ORG_C).emailTemplateVersion.create({
    data: {
      orgId: ORG_C,
      templateId: t.id,
      version: 1,
      subject: 's',
      body: 'b',
      authorMembershipId: membershipC,
    },
  });
  return t.id;
}

describe('isolamento por Organização (RLS FORCE)', () => {
  it('Template da Org C é invisível sob a Org A', async () => {
    const id = await criarTemplateC();
    expect(await dbRuntime(ORG_A).emailTemplate.findUnique({ where: { id } })).toBeNull();
    expect(await dbRuntime(ORG_C).emailTemplate.findUnique({ where: { id } })).not.toBeNull();
  });

  it('WITH CHECK no INSERT: orgId alheio negado (createMany, sem RETURNING)', async () => {
    await expect(
      dbRuntime(ORG_C).emailTemplate.createMany({
        data: [
          {
            id: randomUUID(),
            orgId: ORG_A,
            name: 'x',
            createdByMembershipId: membershipC,
          },
        ],
      }),
    ).rejects.toThrow();
  });
});

describe('imutabilidade da versão (AC-2 — fronteira do banco)', () => {
  it('UPDATE e DELETE em EmailTemplateVersion → permission denied', async () => {
    const id = await criarTemplateC();
    const v = await dbRuntime(ORG_C).emailTemplateVersion.findFirst({
      where: { templateId: id },
      select: { id: true },
    });
    await expect(
      dbRuntime(ORG_C).emailTemplateVersion.update({
        where: { id: v!.id },
        data: { subject: 'hack' },
      }),
    ).rejects.toThrow();
    await expect(
      dbRuntime(ORG_C).emailTemplateVersion.delete({ where: { id: v!.id } }),
    ).rejects.toThrow();
    // A versão segue intacta.
    const depois = await dbRuntime(ORG_C).emailTemplateVersion.findUnique({
      where: { id: v!.id },
    });
    expect(depois?.subject).toBe('s');
  });

  it('numeração UNIQUE: 2ª versão com o MESMO número colide (P2002)', async () => {
    const id = await criarTemplateC();
    await expect(
      dbRuntime(ORG_C).emailTemplateVersion.create({
        data: {
          orgId: ORG_C,
          templateId: id,
          version: 1, // já existe
          subject: 'x',
          body: 'y',
          authorMembershipId: membershipC,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('GRANT como fronteira (EmailTemplate)', () => {
  it('sem DELETE; autoria e orgId sem UPDATE (permission denied); colunas mutáveis funcionam', async () => {
    const id = await criarTemplateC();
    await expect(dbRuntime(ORG_C).emailTemplate.delete({ where: { id } })).rejects.toThrow();
    await expect(
      dbRuntime(ORG_C).emailTemplate.update({
        where: { id },
        data: { createdByMembershipId: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      dbRuntime(ORG_C).emailTemplate.update({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow();
    await dbRuntime(ORG_C).emailTemplate.update({ where: { id }, data: { name: 'ok' } });
  });
});

describe('FK composta tenant-safe (D-62.5)', () => {
  it('versão apontando templateId de OUTRA Org viola a FK', async () => {
    await expect(
      dbRuntime(ORG_C).emailTemplateVersion.create({
        data: {
          orgId: ORG_C,
          templateId: templateA, // par (ORG_C, templateA) não existe
          version: 1,
          subject: 's',
          body: 'b',
          authorMembershipId: membershipC,
        },
      }),
    ).rejects.toThrow();
  });
});
