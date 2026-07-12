import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withAccountContext, withTenantContext } from '../src/kernel/db/tenant-context';

/**
 * Prova de isolamento multi-tenant contra um PostgreSQL REAL.
 *
 * Estes testes são o coração da Story 1.2. Um mock aqui não provaria nada: quem nega o
 * acesso é o banco, não a aplicação. Se o Postgres estiver fora, a suíte fica VERMELHA —
 * não pulada. Indisponibilidade de banco é falha, não ausência de evidência.
 *
 * O client abaixo conecta como `giraffe_app`: sem BYPASSRLS, sem superuser, não é dono das
 * tabelas. É exatamente o papel do runtime — testar com o dono esconderia o bug.
 */

// Fixture criada por `prisma/seed.sql`.
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANA = '11111111-1111-1111-1111-111111111111'; // só Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // Org A E Org B
const CARLA = '33333333-3333-3333-3333-333333333333'; // só Org B
const MEMBERSHIP_ANA_EM_A = 'a1a1a1a1-0000-0000-0000-000000000001';
const MEMBERSHIP_CARLA_EM_B = 'b1b1b1b1-0000-0000-0000-000000000001';

const databaseUrl = process.env.DATABASE_URL;

let prisma: PrismaClient;

beforeAll(async () => {
  if (!databaseUrl) {
    // Falha honesta: cita o NOME da variável, nunca o valor (a URL carrega senha).
    throw new Error('DATABASE_URL ausente: os testes de RLS exigem um PostgreSQL real.');
  }
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma?.$disconnect();
});

describe('papel de runtime', () => {
  it('não possui BYPASSRLS nem SUPERUSER', async () => {
    // Se este teste falhar, TODOS os outros abaixo viram teatro: um papel com BYPASSRLS
    // atravessa as policies sem erro nenhum, e o isolamento passa a ser ficção.
    const papeis = await prisma.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    expect(papeis).toHaveLength(1);
    expect(papeis[0]?.rolname).toBe('giraffe_app');
    expect(papeis[0]?.rolsuper).toBe(false);
    expect(papeis[0]?.rolbypassrls).toBe(false);
  });

  it('não é dono das tabelas organizacionais, que têm RLS forçada', async () => {
    // `FORCE ROW LEVEL SECURITY` importa: sem ele, o DONO da tabela ignora as policies.
    const rows = await prisma.$queryRaw<
      { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT relname, relrowsecurity, relforcerowsecurity
        FROM pg_class
       WHERE relname IN ('Organization', 'Membership')`;

    expect(rows).toHaveLength(2);
    for (const t of rows) {
      expect(t.relrowsecurity).toBe(true);
      expect(t.relforcerowsecurity).toBe(true);
    }
  });
});

describe('leitura com contexto organizacional', () => {
  it('enxerga a própria Organização e apenas ela', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    const orgs = await db.organization.findMany();

    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.id).toBe(ORG_A);
  });

  it('bloqueia a leitura cruzada de outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    // A Org B EXISTE no banco; para o contexto A ela simplesmente não está lá.
    const orgB = await db.organization.findUnique({ where: { id: ORG_B } });

    expect(orgB).toBeNull();
  });

  it('bloqueia a leitura das Memberships de outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    const memberships = await db.membership.findMany();

    expect(memberships).toHaveLength(2); // Ana e Bruno — nunca Carla.
    expect(memberships.every((m) => m.orgId === ORG_A)).toBe(true);
    expect(memberships.map((m) => m.accountId)).not.toContain(CARLA);
  });
});

describe('escrita com contexto organizacional', () => {
  it('permite inserir na própria Organização', async () => {
    // O caminho POSITIVO. Sem ele, uma policy que negasse tudo passaria nos testes
    // negativos e a aplicação estaria quebrada.
    const db = withTenantContext(prisma, { orgId: ORG_A });

    const criada = await db.membership.create({
      data: { accountId: CARLA, orgId: ORG_A, role: 'GUEST' },
    });

    expect(criada.orgId).toBe(ORG_A);
    expect(criada.state).toBe('ACTIVE');

    await db.membership.delete({ where: { id: criada.id } });
  });

  it('bloqueia inserção com orgId de outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    // É o ataque mais direto: estou em A e escrevo `orgId: B` no corpo.
    await expect(
      db.membership.create({ data: { accountId: ANA, orgId: ORG_B, role: 'ADMIN' } }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia inserção cruzada mesmo sem RETURNING', async () => {
    // Este teste existe porque o anterior, sozinho, PASSA por engano: `create` emite
    // `INSERT ... RETURNING`, e o RETURNING esbarra na policy de SELECT. Ou seja, ele
    // continuaria verde mesmo com um `WITH CHECK (true)` — provado por mutação.
    //
    // `createMany` emite um INSERT puro, sem RETURNING. Aqui só o `WITH CHECK` protege.
    // É esta asserção que sustenta a decisão de separar `USING` de `WITH CHECK`.
    const db = withTenantContext(prisma, { orgId: ORG_A });

    await expect(
      db.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_B, role: 'ADMIN' }] }),
    ).rejects.toThrow(/row-level security/i);

    // E a prova material: nada foi gravado na Org B.
    const dbB = withTenantContext(prisma, { orgId: ORG_B });
    const naOrgB = await dbB.membership.findMany({ where: { accountId: ANA } });
    expect(naOrgB).toEqual([]);
  });

  it('bloqueia a atualização cruzada', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    // `USING` esconde a linha da Org B: para o Prisma, o registro não existe.
    await expect(
      db.membership.update({
        where: { id: MEMBERSHIP_CARLA_EM_B },
        data: { role: 'MEMBER' },
      }),
    ).rejects.toThrow();

    const afetadas = await db.membership.updateMany({
      where: { orgId: ORG_B },
      data: { state: 'REMOVED' },
    });
    expect(afetadas.count).toBe(0);
  });

  it('bloqueia mover uma linha própria para outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    // Sutil e perigoso: a linha é MINHA (passa no `USING`), mas o novo valor pertence a
    // outro tenant. Quem barra é o `WITH CHECK` do UPDATE — daí ele existir separado.
    await expect(
      db.membership.update({
        where: { id: MEMBERSHIP_ANA_EM_A },
        data: { orgId: ORG_B },
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('bloqueia a remoção cruzada e a linha alheia continua intacta', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A });

    const removidas = await db.membership.deleteMany({ where: { id: MEMBERSHIP_CARLA_EM_B } });
    expect(removidas.count).toBe(0);

    // Confirmação pelo lado de B: a linha sobreviveu de fato — não é só o count que mente.
    const dbB = withTenantContext(prisma, { orgId: ORG_B });
    const carla = await dbB.membership.findUnique({ where: { id: MEMBERSHIP_CARLA_EM_B } });
    expect(carla).not.toBeNull();
  });
});

describe('contexto ausente ou inválido falha de forma fechada', () => {
  it('sem contexto, nenhuma linha organizacional é visível', async () => {
    // Client CRU, sem a extensão. `current_setting(..., true)` devolve NULL, nenhuma policy
    // casa, e o banco nega por padrão. Ausência de contexto ⇒ ausência de dados.
    const orgs = await prisma.organization.findMany();
    const memberships = await prisma.membership.findMany();

    expect(orgs).toEqual([]);
    expect(memberships).toEqual([]);
  });

  it('sem contexto, a escrita é rejeitada — inclusive sem RETURNING', async () => {
    await expect(
      prisma.membership.create({ data: { accountId: ANA, orgId: ORG_A, role: 'ADMIN' } }),
    ).rejects.toThrow(/row-level security/i);

    // Sem o RETURNING, quem barra é exclusivamente o `WITH CHECK`. Ver o teste
    // "bloqueia inserção cruzada mesmo sem RETURNING" para o porquê desta duplicação.
    await expect(
      prisma.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_A, role: 'ADMIN' }] }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('com contexto inválido, nega — e não estoura erro de driver', async () => {
    // `'nao-e-um-uuid'::uuid` lançaria 22P02 e viraria um 500. A função `current_org_id()`
    // captura e devolve NULL: lixo no contexto é NEGAÇÃO, não erro interno.
    const db = withTenantContext(prisma, { orgId: 'nao-e-um-uuid' });

    const orgs = await db.organization.findMany();
    expect(orgs).toEqual([]);

    await expect(
      db.membership.create({ data: { accountId: ANA, orgId: ORG_A, role: 'ADMIN' } }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('contexto de conta (login, antes de haver Organização ativa)', () => {
  it('a conta descobre as próprias Memberships nas duas Organizações', async () => {
    // Story 1.4 depende disto: "a quais Orgs pertenço?" é perguntado ANTES de existir
    // `activeOrganizationId`. Bruno está em A e em B.
    const db = withAccountContext(prisma, BRUNO);

    const minhas = await db.membership.findMany();

    expect(minhas).toHaveLength(2);
    expect(minhas.every((m) => m.accountId === BRUNO)).toBe(true);
    expect(minhas.map((m) => m.orgId).sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it('mas não enxerga as Memberships de terceiros', async () => {
    const db = withAccountContext(prisma, BRUNO);

    const memberships = await db.membership.findMany();
    const donos = memberships.map((m) => m.accountId);

    expect(donos).not.toContain(ANA);
    expect(donos).not.toContain(CARLA);
  });

  it('contexto de conta não libera escrita organizacional', async () => {
    const db = withAccountContext(prisma, BRUNO);

    // Ler as próprias Memberships é permitido; CRIAR uma continua exigindo contexto de
    // Organização. Se não fosse assim, qualquer conta se auto-inscreveria em qualquer Org.
    await expect(
      db.membership.create({ data: { accountId: BRUNO, orgId: ORG_A, role: 'ADMIN' } }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('vazamento de contexto pelo pool de conexões', () => {
  it('a conexão devolvida ao pool não carrega o contexto da requisição anterior', async () => {
    // O bug clássico e silencioso: `set_config(..., false)` gruda o contexto na CONEXÃO.
    // Ela volta ao pool e a próxima requisição — de OUTRO tenant — herda o contexto.
    // Usamos `true` (transaction-local); este teste é o que segura essa decisão.
    const db = withTenantContext(prisma, { orgId: ORG_A });
    await db.organization.findMany();

    const linhas = await prisma.$queryRaw<
      { org: string | null }[]
    >`SELECT current_setting('app.current_org_id', true) AS org`;
    const org = linhas[0]?.org;

    expect(org === null || org === undefined || org === '').toBe(true);

    // E a consequência prática: o client cru continua sem enxergar nada.
    expect(await prisma.organization.findMany()).toEqual([]);
  });
});

describe('Account é global e não tem RLS', () => {
  it('a identidade é legível sem contexto organizacional', async () => {
    // AD-10: a conta NÃO pertence a um tenant. Se ela tivesse RLS por Org, o login
    // (que acontece antes de qualquer Org) seria impossível.
    const contas = await prisma.account.findMany();

    expect(contas.length).toBeGreaterThanOrEqual(3);
    expect(contas.map((c) => c.id)).toEqual(expect.arrayContaining([ANA, BRUNO, CARLA]));
  });
});
