import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade de `EmailMessage` (Story 6.1) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` (sem BYPASSRLS, não é dono). Prova: (1) isolamento por Org (cross-tenant invisível);
 * (2) `WITH CHECK` no INSERT — `orgId` alheio negado (via `createMany`, sem RETURNING — fase vermelha
 * conhecida da base); (3) mover a linha de Org é IMPOSSÍVEL pelo runtime — provado pela fronteira do
 * **GRANT** (`orgId` sem UPDATE → permission denied); o `WITH CHECK` da policy de UPDATE existe como
 * defesa em profundidade, mas NÃO é alcançável por teste de runtime (o GRANT barra antes) — lacuna
 * documentada, não claim (review 6.1 — Sec-M2); (4) GRANT: **sem DELETE** e UPDATE
 * **column-scoped** — `orgId`/`createdByMembershipId` → `permission denied`; (5) FK COMPOSTA tenant-safe —
 * `cardId` de OUTRA Org viola a FK (nunca associação silenciosa cross-tenant).
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

const membershipC = randomUUID(); // referência-por-id (sem FK a Membership) — basta um uuid
const emailsCriados: string[] = [];
// Card descartável na Org A (alvo da prova de FK composta cross-tenant).
let cardA = '';
const recursosA = { pipe: '', phase: '', form: '', fv: '' };

function dbRuntime(orgId: string) {
  return withTenantContext(prisma, { orgId }, semLog);
}

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: setup exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Card mínimo na Org A (Pipe→Phase→Form→FormVersion→Card), pelo migrator.
  const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const pipe = await dbA.pipe.create({
    data: { orgId: ORG_A, name: `p-${randomUUID().slice(0, 8)}` },
  });
  recursosA.pipe = pipe.id;
  const phase = await dbA.phase.create({
    data: { orgId: ORG_A, pipeId: pipe.id, name: 'F', position: 1000, state: 'ACTIVE' },
  });
  recursosA.phase = phase.id;
  const form = await dbA.form.create({
    data: { orgId: ORG_A, context: 'PIPE_INITIAL', pipeId: pipe.id, publishedVersion: 1 },
  });
  recursosA.form = form.id;
  const fv = await dbA.formVersion.create({
    data: { orgId: ORG_A, formId: form.id, version: 1, snapshot: { fields: [] }, revision: 'r1' },
  });
  recursosA.fv = fv.id;
  const card = await dbA.card.create({
    data: {
      orgId: ORG_A,
      pipeId: pipe.id,
      phaseId: phase.id,
      formId: form.id,
      formVersionId: fv.id,
      idempotencyKey: randomUUID(),
    },
  });
  cardA = card.id;
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.emailMessage.deleteMany({ where: { id: { in: emailsCriados } } }).catch(() => {});
    const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await dbA.card.deleteMany({ where: { id: cardA } }).catch(() => {});
    await dbA.pipe.deleteMany({ where: { id: recursosA.pipe } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

async function criarEmailC(): Promise<string> {
  const criado = await dbRuntime(ORG_C).emailMessage.create({
    data: {
      orgId: ORG_C,
      recipients: ['a@exemplo.com'],
      subject: 's',
      body: 'b',
      createdByMembershipId: membershipC,
    },
    select: { id: true },
  });
  emailsCriados.push(criado.id);
  return criado.id;
}

describe('isolamento por Organização (RLS FORCE)', () => {
  it('e-mail da Org C é invisível sob o contexto da Org A', async () => {
    const id = await criarEmailC();
    expect(await dbRuntime(ORG_A).emailMessage.findUnique({ where: { id } })).toBeNull();
    expect(await dbRuntime(ORG_C).emailMessage.findUnique({ where: { id } })).not.toBeNull();
  });

  it('WITH CHECK no INSERT: criar com orgId ALHEIO sob contexto C é negado (createMany, sem RETURNING)', async () => {
    await expect(
      dbRuntime(ORG_C).emailMessage.createMany({
        data: [
          {
            id: randomUUID(),
            orgId: ORG_A, // alheio ao contexto → policy nega
            recipients: [],
            subject: 's',
            body: 'b',
            createdByMembershipId: membershipC,
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it('mover a linha de Org é negado pelo GRANT (orgId sem UPDATE — permission denied)', async () => {
    const id = await criarEmailC();
    // `orgId` nem tem GRANT de UPDATE — a tentativa bate na fronteira do banco (permission denied).
    await expect(
      dbRuntime(ORG_C).emailMessage.update({ where: { id }, data: { orgId: ORG_A } }),
    ).rejects.toThrow();
  });
});

describe('GRANT como fronteira', () => {
  it('runtime NÃO tem DELETE em EmailMessage (permission denied)', async () => {
    const id = await criarEmailC();
    await expect(dbRuntime(ORG_C).emailMessage.delete({ where: { id } })).rejects.toThrow();
    // A linha segue lá (descartar seria `state`, nunca DELETE).
    expect(await dbRuntime(ORG_C).emailMessage.findUnique({ where: { id } })).not.toBeNull();
  });

  it('UPDATE é column-scoped: autoria (`createdByMembershipId`) é imutável pelo runtime', async () => {
    const id = await criarEmailC();
    await expect(
      dbRuntime(ORG_C).emailMessage.update({
        where: { id },
        data: { createdByMembershipId: randomUUID() },
      }),
    ).rejects.toThrow();
    // Colunas mutáveis seguem funcionando (prova o escopo, não só a negação).
    await dbRuntime(ORG_C).emailMessage.update({ where: { id }, data: { subject: 'ok' } });
  });
});

describe('FK composta tenant-safe (D-61.5)', () => {
  it('associar `cardId` de OUTRA Org viola a FK — nunca associação cross-tenant silenciosa', async () => {
    await expect(
      dbRuntime(ORG_C).emailMessage.create({
        data: {
          orgId: ORG_C,
          cardId: cardA, // Card da Org A: o par (ORG_C, cardA) não existe em Card(orgId,id)
          recipients: [],
          subject: 's',
          body: 'b',
          createdByMembershipId: membershipC,
        },
      }),
    ).rejects.toThrow();
  });
});
