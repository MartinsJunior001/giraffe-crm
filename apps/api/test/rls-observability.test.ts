import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Observabilidade do isolamento (FR-213).
 *
 * Uma negação de RLS é um evento de segurança: alguém tentou alcançar dados de outra
 * Organização. Se isso vira um 500 anônimo, ninguém investiga. Estes testes garantem que a
 * negação aparece no log — e que o log NÃO carrega o que não pode carregar.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // Org vazia: área de escrita dos testes
const ANA = '11111111-1111-1111-1111-111111111111';
const MEMBERSHIP_CARLA_EM_B = 'b1b1b1b1-0000-0000-0000-000000000001';

type Nivel = 'debug' | 'info' | 'warn';
type Entrada = { nivel: Nivel; obj: Record<string, unknown>; msg: string };

function loggerEspiao(): { logger: TenantLogger; entradas: Entrada[] } {
  const entradas: Entrada[] = [];
  const registra =
    (nivel: Nivel) =>
    (obj: object, msg: string): void => {
      entradas.push({ nivel, obj: obj as Record<string, unknown>, msg });
    };
  return {
    entradas,
    logger: { debug: registra('debug'), info: registra('info'), warn: registra('warn') },
  };
}

let prisma: PrismaClient;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: este teste exige PostgreSQL real.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('log estruturado do contexto organizacional', () => {
  it('inclui a Organização do contexto na operação bem-sucedida', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A }, logger);

    await db.organization.findMany();

    const consulta = entradas.find((e) => e.obj.event === 'db.query');
    expect(consulta).toBeDefined();
    expect(consulta!.obj.orgId).toBe(ORG_A);
    expect(consulta!.obj.model).toBe('Organization');
    expect(consulta!.obj.operation).toBe('findMany');
  });

  it('registra a negação como WARN, com a Organização do contexto', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A }, logger);

    await expect(
      db.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_B, role: 'ADMIN' }] }),
    ).rejects.toThrow();

    const negacao = entradas.find((e) => e.obj.event === 'rls.denied');
    expect(negacao).toBeDefined();
    expect(negacao!.nivel).toBe('warn');
    expect(negacao!.obj.orgId).toBe(ORG_A);
    expect(negacao!.obj.model).toBe('Membership');
  });

  it('a negação relança o erro — registrar não é engolir', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A }, logger);

    // Se o catch apenas logasse, a operação "falharia com sucesso" e a camada de cima
    // seguiria em frente acreditando que a escrita aconteceu.
    await expect(
      db.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_B, role: 'ADMIN' }] }),
    ).rejects.toThrow(/row-level security/i);

    expect(entradas.some((e) => e.obj.event === 'rls.denied')).toBe(true);
  });

  it('contexto inválido também produz negação visível, não falha silenciosa', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: 'nao-e-um-uuid' }, logger);

    await expect(
      db.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_A, role: 'ADMIN' }] }),
    ).rejects.toThrow();

    expect(entradas.some((e) => e.obj.event === 'rls.denied')).toBe(true);
  });

  it('o log não carrega PII, argumentos da query nem a string de conexão', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A }, logger);

    // `Account.email` é a primeira PII do projeto (LGPD). Registrar `args` de uma query
    // arrastaria o e-mail para o log — por isso `args` NUNCA entra no objeto logado.
    await expect(
      db.account.findUnique({ where: { email: 'ana@exemplo.test' } }),
    ).resolves.toBeDefined();

    const serializado = JSON.stringify(entradas);
    expect(serializado).not.toContain('ana@exemplo.test');
    expect(serializado).not.toMatch(/postgresql:\/\/|password|giraffe_app_pw/i);
    expect(entradas.every((e) => !('args' in e.obj))).toBe(true);
  });
});

describe('auditoria mínima de Organization e Membership (FR-214)', () => {
  // Dani não tem Membership no seed, e a Org C nasce vazia. Os arquivos de teste rodam em
  // PARALELO: escrever na Org A colidiria com o arquivo que afirma quantos vínculos ela tem.
  // Conta de ESCRITA deste arquivo. Ver o cabeçalho do seed: cada arquivo paralelo tem a sua —
  // e Dani NÃO serve, porque é a fixture de "conta sem Membership nenhuma" da Story 1.3.
  const GIL = '77777777-7777-7777-7777-777777777777';

  it('registra os seis campos exigidos numa mutação permitida', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_C, accountId: ANA }, logger);

    const criada = await db.membership.create({
      data: { accountId: GIL, orgId: ORG_C, role: 'GUEST' },
    });

    const trilha = entradas.find((e) => e.obj.event === 'audit');
    expect(trilha).toBeDefined();
    expect(trilha!.obj).toMatchObject({
      actor: ANA, // ator
      orgId: ORG_C, // Organização
      action: 'create', // ação
      resource: 'Membership', // recurso
      result: 'allowed', // resultado
    });
    expect(typeof trilha!.obj.at).toBe('string'); // timestamp
    expect(new Date(trilha!.obj.at as string).toString()).not.toBe('Invalid Date');

    await db.membership.delete({ where: { id: criada.id } });
  });

  it('audita também a tentativa NEGADA', async () => {
    // Auditar só o sucesso deixaria de fora justamente o acesso cruzado que se quer detectar.
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    await expect(
      db.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_B, role: 'ADMIN' }] }),
    ).rejects.toThrow();

    const trilha = entradas.find((e) => e.obj.event === 'audit');
    expect(trilha).toBeDefined();
    expect(trilha!.obj).toMatchObject({
      actor: ANA,
      orgId: ORG_A,
      action: 'createMany',
      resource: 'Membership',
      result: 'denied',
    });
  });

  it('REGRESSÃO: mutação em lote FILTRADA pelo USING é auditada como negada, não permitida', async () => {
    // O ponto cego da auditoria. O `USING` de uma policy não LANÇA — ele FILTRA. Um
    // `updateMany` mirando outra Organização voltava com `{ count: 0 }` e sucesso, e a
    // trilha registrava `result: 'allowed'` para a tentativa mais óbvia de vandalismo
    // cross-tenant. Só o `WITH CHECK` (INSERT) levantava exceção — a minoria dos caminhos.
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    const afetadas = await db.membership.updateMany({
      where: { orgId: ORG_B },
      data: { state: 'REMOVED' },
    });
    expect(afetadas.count).toBe(0); // a operação "deu certo" — e é esse o problema

    const filtrada = entradas.find((e) => e.obj.event === 'rls.filtered');
    expect(filtrada).toBeDefined();
    expect(filtrada!.nivel).toBe('warn');

    const trilha = entradas.find((e) => e.obj.event === 'audit');
    expect(trilha!.obj).toMatchObject({
      orgId: ORG_A,
      action: 'updateMany',
      resource: 'Membership',
      result: 'denied',
    });
    expect(entradas.some((e) => e.obj.result === 'allowed')).toBe(false);
  });

  it('REGRESSÃO: deleteMany cruzado também é auditado como negado', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    const removidas = await db.membership.deleteMany({ where: { orgId: ORG_B } });
    expect(removidas.count).toBe(0);

    const trilha = entradas.find((e) => e.obj.event === 'audit');
    expect(trilha!.obj).toMatchObject({ action: 'deleteMany', result: 'denied' });
  });

  it('REGRESSÃO: update de um registro invisível (P2025) não some da trilha', async () => {
    // A terceira forma de negação. `update` de uma linha que o `USING` escondeu lança
    // P2025 — que não é `42501` nem casa com /row-level security/. Antes, este caminho não
    // era `allowed` (lançou) nem `denied` (não reconhecido): simplesmente não gerava evento.
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    await expect(
      db.membership.update({ where: { id: MEMBERSHIP_CARLA_EM_B }, data: { role: 'MEMBER' } }),
    ).rejects.toMatchObject({ code: 'P2025' });

    expect(entradas.some((e) => e.obj.event === 'rls.denied')).toBe(true);

    const trilha = entradas.find((e) => e.obj.event === 'audit');
    expect(trilha!.obj).toMatchObject({ action: 'update', result: 'denied' });
  });

  it('não audita leitura — a trilha não pode afogar em ruído', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    await db.membership.findMany();

    expect(entradas.some((e) => e.obj.event === 'audit')).toBe(false);
  });
});
