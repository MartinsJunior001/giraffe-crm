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
const ANA = '11111111-1111-1111-1111-111111111111';

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
  // Dani não tem Membership no seed. Os arquivos de teste rodam em PARALELO: usar a mesma
  // conta que `rls.test.ts` usa para criar vínculos colidiria na constraint `(accountId,
  // orgId)` — um erro que nada tem a ver com RLS e que mascararia o que se quer provar.
  const DANI = '44444444-4444-4444-4444-444444444444';

  it('registra os seis campos exigidos numa mutação permitida', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    const criada = await db.membership.create({
      data: { accountId: DANI, orgId: ORG_A, role: 'GUEST' },
    });

    const trilha = entradas.find((e) => e.obj.event === 'audit');
    expect(trilha).toBeDefined();
    expect(trilha!.obj).toMatchObject({
      actor: ANA, // ator
      orgId: ORG_A, // Organização
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

  it('não audita leitura — a trilha não pode afogar em ruído', async () => {
    const { logger, entradas } = loggerEspiao();
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: ANA }, logger);

    await db.membership.findMany();

    expect(entradas.some((e) => e.obj.event === 'audit')).toBe(false);
  });
});
