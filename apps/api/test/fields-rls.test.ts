import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import { lerOpcoes, serializarOpcoes, adicionarOpcao } from '../src/pipes/forms/option-config';

/**
 * Isolamento da EVOLUÇÃO de Campos (Story 2.5) contra um PostgreSQL REAL, pelo papel de runtime `giraffe_app`.
 * A 2.4 (`forms-rls.test.ts`) já provou RLS ENABLE+FORCE, insert/move cross-org e a AUSÊNCIA de DELETE em
 * `Field`. Aqui provamos o que a 2.5 acrescenta: as ESCRITAS de evolução — UPDATE de `state` (arquivar) e de
 * `typeConfig` (ciclo de opções) — respeitam o contexto: da própria Org funcionam; de outra Org ou SEM
 * contexto atingem **0 linhas** (a policy torna a linha invisível). Escreve na Org C (área de escrita).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

const pipeId = randomUUID();
const formId = randomUUID();
const campoTexto = randomUUID();
const campoSelecao = randomUUID();

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({ data: { id: pipeId, orgId: ORG_C, name: 'Pipe alvo (Fields RLS)' } });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId } });
  await dbC.field.create({
    data: { id: campoTexto, orgId: ORG_C, formId, label: 'Texto', type: 'TEXT_SHORT', position: 1 },
  });
  await dbC.field.create({
    data: {
      id: campoSelecao,
      orgId: ORG_C,
      formId,
      label: 'Seleção',
      type: 'SELECT_SINGLE',
      position: 2,
      typeConfig: serializarOpcoes(adicionarOpcao([], 'Inicial')) as object,
    },
  });
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.pipe.deleteMany({ where: { id: pipeId } }).catch(() => {}); // cascateia Form e Field
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('arquivar Campo (UPDATE de state) respeita o contexto (SC-259)', () => {
  it('a própria Org arquiva; outra Org e SEM contexto atingem 0 linhas', async () => {
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    // Org A não enxerga o Campo da Org C → arquivar de fora não atinge linha nenhuma.
    const alheia = await dbA.field.updateMany({
      where: { id: campoTexto },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    expect(alheia.count).toBe(0);

    // Sem contexto: nada visível → 0 linhas.
    const semCtx = await prisma.field.updateMany({
      where: { id: campoTexto },
      data: { state: 'ARCHIVED' },
    });
    expect(semCtx.count).toBe(0);

    // A própria Org arquiva de fato.
    const propria = await dbC.field.updateMany({
      where: { id: campoTexto },
      data: { state: 'ARCHIVED', archivedAt: new Date() },
    });
    expect(propria.count).toBe(1);
    expect((await dbC.field.findUnique({ where: { id: campoTexto } }))?.state).toBe('ARCHIVED');
  });
});

describe('ciclo de opções (UPDATE de typeConfig) respeita o contexto (SC-259)', () => {
  it('a própria Org regrava o typeConfig; outra Org atinge 0 linhas', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    const atual = await dbC.field.findUnique({
      where: { id: campoSelecao },
      select: { typeConfig: true },
    });
    const novo = serializarOpcoes(adicionarOpcao(lerOpcoes(atual!.typeConfig), 'Nova')) as object;

    const alheia = await dbA.field.updateMany({
      where: { id: campoSelecao },
      data: { typeConfig: novo },
    });
    expect(alheia.count).toBe(0); // Org A não vê o Campo da Org C

    const propria = await dbC.field.updateMany({
      where: { id: campoSelecao },
      data: { typeConfig: novo },
    });
    expect(propria.count).toBe(1);
    const depois = await dbC.field.findUnique({
      where: { id: campoSelecao },
      select: { typeConfig: true },
    });
    expect(lerOpcoes(depois!.typeConfig).map((o) => o.label)).toEqual(['Inicial', 'Nova']);
  });
});

describe('guarda otimista de concorrência no typeConfig (H1 — invariante 12)', () => {
  it('UPDATE guardado por typeConfig=equals(token obsoleto) atinge 0 linhas quando o valor já mudou', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    // Campo dedicado (isolado das mutações dos outros testes deste arquivo).
    const fieldId = randomUUID();
    await dbC.field.create({
      data: {
        id: fieldId,
        orgId: ORG_C,
        formId,
        label: 'Concorrência',
        type: 'SELECT_SINGLE',
        position: 3,
        typeConfig: serializarOpcoes(adicionarOpcao([], 'Base')) as object,
      },
    });

    // Token de versão V0 = o `typeConfig` lido agora (o que a leitura de um administrador teria em mãos).
    const v0 = (await dbC.field.findUnique({
      where: { id: fieldId },
      select: { typeConfig: true },
    }))!.typeConfig;

    // "Admin 1" comita V1 partindo de V0 → token fresco, aplica (1 linha). É esta a guarda de `FieldsService`.
    const v1 = serializarOpcoes(adicionarOpcao(lerOpcoes(v0), 'Admin1')) as object;
    const a1 = await dbC.field.updateMany({
      where: { id: fieldId, typeConfig: { equals: v0 as Prisma.InputJsonValue } },
      data: { typeConfig: v1 },
    });
    expect(a1.count).toBe(1);

    // "Admin 2" tenta comitar V2 partindo do MESMO V0 (leitura já obsoleta) → 0 linhas: o `equals` não casa
    // mais (o valor corrente é V1). SEM esta guarda, este UPDATE atingiria 1 linha e apagaria a alteração de
    // Admin 1 — o lost update silencioso que o serviço traduz em 409.
    const v2 = serializarOpcoes(adicionarOpcao(lerOpcoes(v0), 'Admin2')) as object;
    const a2 = await dbC.field.updateMany({
      where: { id: fieldId, typeConfig: { equals: v0 as Prisma.InputJsonValue } },
      data: { typeConfig: v2 },
    });
    expect(a2.count).toBe(0);

    // A alteração de Admin 1 sobreviveu; a de Admin 2 (baseada em leitura velha) NÃO foi aplicada.
    const final = lerOpcoes(
      (await dbC.field.findUnique({
        where: { id: fieldId },
        select: { typeConfig: true },
      }))!.typeConfig,
    );
    expect(final.map((o) => o.label)).toContain('Admin1');
    expect(final.map((o) => o.label)).not.toContain('Admin2');
  });
});

describe('remover opção NUNCA é DELETE de linha (SC-256/SC-259)', () => {
  it('o runtime não tem GRANT DELETE em Field — remover opção só pode ser UPDATE', async () => {
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(dbC.field.deleteMany({ where: { id: campoSelecao } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});
