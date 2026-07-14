import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e GRANTs da Story 2.8 contra um PostgreSQL REAL, pelo papel de runtime `giraffe_app`. Prova
 * o que só o banco garante:
 *   1. `SubmissaoPublica` é org-scoped (RLS ENABLE+FORCE): outra Org não vê nem insere linha alheia; sem
 *      contexto, nada; o WITH CHECK barra INSERT com `orgId` alheio; sem GRANT de DELETE (preserva LGPD).
 *   2. `PublicFormRoute` é GLOBAL (SEM RLS, por definição — AD-10): a resolução pública acontece ANTES de
 *      qualquer contexto de Organização, então o `findUnique` pelo `publicId` opaco tem de funcionar SEM
 *      contexto e independentemente da Org ativa. Guarda só `orgId`/`formId` (sem PII). Sem GRANT de DELETE
 *      — revogar é `active=false`, não apagar (a rotação preserva a trilha).
 * Escreve na Org C (área de escrita).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

const pipeId = randomUUID();
const phaseId = randomUUID();
const formId = randomUUID();
const formVersionId = randomUUID();
const submissaoId = randomUUID();
const publicId = `rls-${randomUUID()}`;

const snapshotFixo = { formId, fields: [] } as object;

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Fixtures na Org C, pelo migrator (dono do schema): Pipe → Fase → Form → FormVersion → SubmissaoPublica + Rota.
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Público RLS)' } });
  await dbC.phase.create({
    data: { id: phaseId, orgId: ORG_C, pipeId, name: 'Triagem', position: '1' },
  });
  await dbC.form.create({
    data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId, publicEnabled: true },
  });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId: ORG_C,
      formId,
      version: 1,
      snapshot: snapshotFixo,
      revision: 'r1',
    },
  });
  await dbC.submissaoPublica.create({
    data: {
      id: submissaoId,
      orgId: ORG_C,
      formId,
      formVersionId,
      idempotencyKey: 'fixa-rls',
      valores: {},
    },
  });
  // PublicFormRoute é global: NÃO passa por withTenantContext (não tem coluna sob RLS). Cria direto.
  await migrator.publicFormRoute.create({ data: { publicId, orgId: ORG_C, formId } });
});

afterAll(async () => {
  if (migrator) {
    await migrator.publicFormRoute.deleteMany({ where: { publicId } }).catch(() => {});
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia Fase/Form/Version/Submissão
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('RLS de SubmissaoPublica respeita o contexto (isolamento)', () => {
  it('outra Org não vê a submissão; sem contexto não vê; a própria Org vê', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    expect(await dbA.submissaoPublica.findMany({ where: { id: submissaoId } })).toHaveLength(0);
    expect(await prisma.submissaoPublica.findMany({ where: { id: submissaoId } })).toHaveLength(0);
    expect(await dbC.submissaoPublica.findMany({ where: { id: submissaoId } })).toHaveLength(1);
  });

  it('INSERT de submissão com orgId alheio é barrado pelo WITH CHECK (createMany, sem RETURNING)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      dbC.submissaoPublica.createMany({
        data: [{ orgId: ORG_A, formId, formVersionId, idempotencyKey: 'cross', valores: {} }],
      }),
    ).rejects.toThrow();
  });

  it('o runtime não tem GRANT de DELETE em SubmissaoPublica — não se apaga o dado público (LGPD)', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.submissaoPublica.deleteMany({ where: { id: submissaoId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('PublicFormRoute é GLOBAL — resolução pública acontece antes do contexto (SC-282)', () => {
  it('o runtime resolve o publicId SEM contexto de Organização (pré-contexto)', async () => {
    // O resolvedor público roda no client raiz, antes de entrar em withTenantContext. Se a rota estivesse
    // sob RLS, este findUnique voltaria null sem contexto e nenhum link público jamais resolveria.
    const rota = await prisma.publicFormRoute.findUnique({ where: { publicId } });
    expect(rota?.orgId).toBe(ORG_C);
    expect(rota?.formId).toBe(formId);
  });

  it('a rota é visível independentemente da Org ativa (não é filtrada por contexto)', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const rota = await dbA.publicFormRoute.findUnique({ where: { publicId } });
    expect(rota?.orgId).toBe(ORG_C); // sem RLS: mesmo sob contexto da Org A, a rota da Org C resolve
  });

  it('o runtime não tem GRANT de DELETE em PublicFormRoute — revogar é active=false, não apagar', async () => {
    await expect(prisma.publicFormRoute.deleteMany({ where: { publicId } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
