import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  withAccountContext,
  withTenantContext,
  type TenantLogger,
} from '../src/kernel/db/tenant-context';

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
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc'; // vazia: área de escrita dos testes
const ANA = '11111111-1111-1111-1111-111111111111'; // só Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // Org A E Org B
const CARLA = '33333333-3333-3333-3333-333333333333'; // só Org B
const MEMBERSHIP_ANA_EM_A = 'a1a1a1a1-0000-0000-0000-000000000001';
const MEMBERSHIP_CARLA_EM_B = 'b1b1b1b1-0000-0000-0000-000000000001';
/** Conta de ESCRITA deste arquivo. Ver o cabeçalho do seed: cada arquivo paralelo tem a sua. */
const FABIO = '66666666-6666-6666-6666-666666666666';

/** O log é observado em `rls-observability.test.ts`; aqui só interessa o comportamento. */
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // giraffe_app (runtime)
// giraffe_migrator (dono das tabelas) — usado SÓ para faxina. Desde a Story 8.6 o runtime não tem mais
// DELETE em "Membership" (REVOKE — DEB-MEMBERSHIP-EVENT-CASCADE), então a limpeza da linha descartável
// criada nos testes positivos passa a ser feita pelo dono (imune ao GRANT do runtime), sob contexto.
let migrator: PrismaClient;

beforeAll(async () => {
  if (!databaseUrl) {
    // Falha honesta: cita o NOME da variável, nunca o valor (a URL carrega senha).
    throw new Error('DATABASE_URL ausente: os testes de RLS exigem um PostgreSQL real.');
  }
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
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

  it('NÃO é dono das tabelas organizacionais, e elas têm RLS forçada', async () => {
    // As duas metades importam, e só uma delas estava sendo testada.
    //
    // O DONO de uma tabela ignora as policies por padrão. `FORCE ROW LEVEL SECURITY` tira
    // esse privilégio — mas depender só do FORCE é depender de uma única barreira. A
    // segunda é o `giraffe_app` não ser dono de nada. Antes, este teste só conferia
    // `relrowsecurity`/`relforcerowsecurity`: se alguém apontasse o runtime para o papel
    // `giraffe_migrator` (dono do schema), ele continuaria VERDE. Passava pelo motivo errado.
    const tabelas = await prisma.$queryRaw<
      { relname: string; dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT relname,
             pg_get_userbyid(relowner) AS dono,
             relrowsecurity,
             relforcerowsecurity
        FROM pg_class
       WHERE relname IN ('Organization', 'Membership')
         AND relkind = 'r'
         AND relnamespace = 'public'::regnamespace`;

    expect(tabelas).toHaveLength(2);
    for (const t of tabelas) {
      expect(t.relrowsecurity).toBe(true);
      expect(t.relforcerowsecurity).toBe(true);
      expect(t.dono).not.toBe('giraffe_app');
      expect(t.dono).toBe('giraffe_migrator');
    }
  });
});

describe('leitura com contexto organizacional', () => {
  it('enxerga a própria Organização e apenas ela', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    const orgs = await db.organization.findMany();

    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.id).toBe(ORG_A);
  });

  it('bloqueia a leitura cruzada de outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    // A Org B EXISTE no banco; para o contexto A ela simplesmente não está lá.
    const orgB = await db.organization.findUnique({ where: { id: ORG_B } });

    expect(orgB).toBeNull();
  });

  it('bloqueia a leitura das Memberships de outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    const memberships = await db.membership.findMany();

    expect(memberships.every((m) => m.orgId === ORG_A)).toBe(true);
    expect(memberships.map((m) => m.accountId)).not.toContain(CARLA);
  });

  it('REGRESSÃO: com Org ativa, a conta NÃO arrasta os vínculos dela em outras Organizações', async () => {
    // O vazamento que a suíte anterior não via, porque nunca combinava os dois contextos.
    //
    // `withTenantContext` define orgId E accountId na mesma transação — é o caminho de
    // produção. Com a policy antiga (`orgId = current_org_id() OR accountId =
    // current_account_id()`), o ramo da conta casava com a Membership de Bruno na Org B, e
    // ela aparecia dentro de uma consulta escopada na Org A. Violação direta do AC1,
    // reproduzida em psql antes desta correção.
    //
    // Bruno é o caso crítico justamente por pertencer às DUAS Organizações.
    const db = withTenantContext(prisma, { orgId: ORG_A, accountId: BRUNO }, semLog);

    const memberships = await db.membership.findMany();

    expect(memberships.every((m) => m.orgId === ORG_A)).toBe(true);
    expect(memberships.map((m) => m.orgId)).not.toContain(ORG_B);

    // E o alvo específico: o vínculo de Bruno na Org B não pode estar aqui.
    const vinculoBrunoEmB = await db.membership.findUnique({
      where: { accountId_orgId: { accountId: BRUNO, orgId: ORG_B } },
    });
    expect(vinculoBrunoEmB).toBeNull();
  });
});

describe('escrita com contexto organizacional', () => {
  it('permite inserir na própria Organização', async () => {
    // O caminho POSITIVO. Sem ele, uma policy que negasse tudo passaria nos testes
    // negativos e a aplicação estaria quebrada.
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    const criada = await db.membership.create({
      data: { accountId: FABIO, orgId: ORG_C, role: 'GUEST' },
    });

    expect(criada.orgId).toBe(ORG_C);
    expect(criada.state).toBe('ACTIVE');

    // Faxina pelo DONO (o runtime não tem mais DELETE em Membership — Story 8.6), sob contexto de ORG_C.
    await withTenantContext(migrator, { orgId: ORG_C }, semLog).membership.delete({
      where: { id: criada.id },
    });
  });

  it('permite ATUALIZAR e fazer a REMOÇÃO LÓGICA dentro da própria Organização (AC2)', async () => {
    // O outro lado do AC2, que só era exercitado no sentido negativo: todo teste de
    // `update`/`state: REMOVED` mirava outra Organização e esperava falha. Uma policy que
    // negasse TODA escrita passaria em todos eles — e o AC2 seria dado como cumprido com a
    // aplicação incapaz de atualizar o que quer que fosse.
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    const criada = await db.membership.create({
      data: { accountId: FABIO, orgId: ORG_C, role: 'GUEST' },
    });

    const promovida = await db.membership.update({
      where: { id: criada.id },
      data: { role: 'MEMBER' },
    });
    expect(promovida.role).toBe('MEMBER');

    // Remoção LÓGICA: `state`, não `deletedAt` paralelo. A linha permanece; o vínculo, não.
    const removida = await db.membership.update({
      where: { id: criada.id },
      data: { state: 'REMOVED' },
    });
    expect(removida.state).toBe('REMOVED');

    // A linha continua existindo — é isso que distingue remoção lógica de DELETE.
    const aindaLa = await db.membership.findUnique({ where: { id: criada.id } });
    expect(aindaLa?.state).toBe('REMOVED');

    // Faxina pelo DONO (o runtime não tem mais DELETE em Membership — Story 8.6), sob contexto de ORG_C.
    await withTenantContext(migrator, { orgId: ORG_C }, semLog).membership.delete({
      where: { id: criada.id },
    });
  });

  it('bloqueia inserção com orgId de outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

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
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    await expect(
      db.membership.createMany({ data: [{ accountId: ANA, orgId: ORG_B, role: 'ADMIN' }] }),
    ).rejects.toThrow(/row-level security/i);

    // E a prova material: nada foi gravado na Org B.
    const dbB = withTenantContext(prisma, { orgId: ORG_B }, semLog);
    const naOrgB = await dbB.membership.findMany({ where: { accountId: ANA } });
    expect(naOrgB).toEqual([]);
  });

  it('bloqueia a atualização cruzada', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    // `USING` esconde a linha da Org B: para o Prisma, o registro não existe — P2025.
    // A asserção é sobre P2025 EXPLICITAMENTE. Um `toThrow()` pelado passaria com um erro
    // de conexão, um typo no nome do campo ou um timeout — verde pelo motivo errado.
    await expect(
      db.membership.update({
        where: { id: MEMBERSHIP_CARLA_EM_B },
        data: { role: 'MEMBER' },
      }),
    ).rejects.toMatchObject({ code: 'P2025' });

    const afetadas = await db.membership.updateMany({
      where: { orgId: ORG_B },
      data: { state: 'REMOVED' },
    });
    expect(afetadas.count).toBe(0);
  });

  it('bloqueia mover uma linha própria para outra Organização', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    // Sutil e perigoso: a linha é MINHA (passa no `USING`), mas o novo valor pertence a
    // outro tenant. Quem barra é o `WITH CHECK` do UPDATE — daí ele existir separado.
    await expect(
      db.membership.update({
        where: { id: MEMBERSHIP_ANA_EM_A },
        data: { orgId: ORG_B },
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('o runtime NÃO tem DELETE em Membership (Story 8.6) — nem cruzado, nem próprio', async () => {
    // Até a Story 8.6, isto era um teste de POLICY: um `deleteMany` cruzado voltava `{ count: 0 }`
    // (o `USING` de `membership_delete` FILTRA, não lança). A 8.6 fechou o DEB-MEMBERSHIP-EVENT-CASCADE
    // com `REVOKE DELETE ON "Membership" FROM giraffe_app` — porque a cascata da FK
    // `MembershipEvent_membershipId_fkey ON DELETE CASCADE` roda com bypass de row security E como dono,
    // e apagaria os eventos append-only daquela Org. Agora a defesa é o GRANT, não a policy: o DELETE
    // pelo runtime bate em `permission denied` ANTES de a policy sequer avaliar (cruzado ou não). A
    // remoção passou a ser 100% lógica (`state = REMOVED`, Story 8.6).
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    await expect(
      db.membership.deleteMany({ where: { id: MEMBERSHIP_CARLA_EM_B } }),
    ).rejects.toThrow(/permission denied/i);

    // A linha alheia sobrevive — o DELETE nunca chega a rodar.
    const dbB = withTenantContext(prisma, { orgId: ORG_B }, semLog);
    const carla = await dbB.membership.findUnique({ where: { id: MEMBERSHIP_CARLA_EM_B } });
    expect(carla).not.toBeNull();
  });
});

describe('privilégio mínimo — o que a RLS não alcança, o GRANT nega', () => {
  it('o runtime NÃO pode apagar uma Account (a cascata da FK atravessaria o RLS)', async () => {
    // O buraco mais grave encontrado na revisão, e ele não era de policy: era de GRANT.
    //
    // `Account` é global e SEM RLS (AD-10) — nenhuma policy a protege. Com `DELETE`, o papel
    // de runtime apagava uma conta SEM contexto organizacional nenhum, e a cascata de
    // `Membership_accountId_fkey` destruía os vínculos dessa conta em TODAS as Organizações.
    // Ações referenciais rodam com bypass de row security: é comportamento documentado do
    // PostgreSQL. Provado em psql: um único DELETE removia 1 Membership da Org A e 1 da Org B.
    await expect(prisma.account.delete({ where: { id: CARLA } })).rejects.toThrow(
      /permission denied/i,
    );

    // E a prova material: a conta continua lá.
    const carla = await prisma.account.findUnique({ where: { id: CARLA } });
    expect(carla).not.toBeNull();
  });

  it('o runtime NÃO pode criar nem alterar uma Account', async () => {
    // Esta Story não escreve em `Account` em lugar nenhum. Privilégio que não tem uso
    // concreto não é concedido "por precaução" — quem precisar, concede com o teste junto.
    await expect(
      prisma.account.create({ data: { email: 'intruso@exemplo.test', name: 'Intruso' } }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      prisma.account.update({ where: { id: ANA }, data: { name: 'Renomeada' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o runtime NÃO pode criar uma Organização, nem com o contexto "certo"', async () => {
    // A fronteira que a Story documenta ("o papel de runtime não cria Organização") existia
    // só no texto. A policy não bastava: `org_insert` é `WITH CHECK (id = current_org_id())`,
    // que é AUTO-SATISFAZÍVEL — basta definir o contexto com o UUID que a linha nova vai
    // receber. Provado em psql: `INSERT 0 1`. Quem impede é o GRANT.
    const novaOrg = '0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f';
    const db = withTenantContext(prisma, { orgId: novaOrg }, semLog);

    await expect(
      db.organization.create({ data: { id: novaOrg, name: 'Org Intrusa', slug: 'org-intrusa' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('o runtime NÃO pode apagar uma Organização', async () => {
    // `Organization_orgId_fkey` também cascateia: apagar a Org levaria junto todas as
    // Memberships dela. É DDL de dados disfarçada de DML, e não tem consumidor nesta Story.
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    await expect(db.organization.delete({ where: { id: ORG_A } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('o runtime NÃO pode apagar uma AuthCredential (nem uma AuthSession por DELETE nesta Story… mas essa é 1.5)', async () => {
    // `AuthCredential` guarda o hash de senha. Ela NÃO tem RLS (é global, como `Account`), então
    // quem nega o `DELETE` é só o GRANT — e a migration deliberadamente não o concede. Um `DELETE`
    // aqui apagaria a credencial de uma conta sem contexto organizacional nenhum, deixando a pessoa
    // sem como logar. O `summary.md` afirmava isto "verificado em psql"; aqui vira teste versionado,
    // para que um `GRANT DELETE` acidental numa migration futura fique VERMELHO.
    //
    // `deleteMany` com filtro que não casa nada: o Postgres checa o privilégio ANTES de olhar as
    // linhas, então falha com "permission denied" sem tocar em dado real.
    const inexistente = '0e0e0e0e-0e0e-0e0e-0e0e-0e0e0e0e0e0e';
    await expect(
      prisma.authCredential.deleteMany({ where: { userId: inexistente } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('mas PODE atualizar a própria Organização (o caminho positivo continua de pé)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    const antes = await db.organization.findUniqueOrThrow({ where: { id: ORG_C } });
    const renomeada = await db.organization.update({
      where: { id: ORG_C },
      data: { name: 'Organização C (renomeada)' },
    });
    expect(renomeada.name).toBe('Organização C (renomeada)');

    await db.organization.update({ where: { id: ORG_C }, data: { name: antes.name } });
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

  it('SQL cru sem contexto também não enxerga nada', async () => {
    // A extensão só intercepta operações de MODELO (`$allModels`). `$queryRaw` passa direto,
    // sem contexto — e é um caminho que qualquer Story futura pode alcançar, já que o
    // `PrismaService` é injetável em todo lugar. Aqui se prova que ele falha FECHADO: quem
    // esquecer o contexto não vaza dados, colhe zero linhas. É a rede embaixo do descuido.
    const orgs = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Organization"`;
    const memberships = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM "Membership"`;

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
    // captura `invalid_text_representation` e devolve NULL: lixo no contexto é NEGAÇÃO,
    // não erro interno.
    const db = withTenantContext(prisma, { orgId: 'nao-e-um-uuid' }, semLog);

    const orgs = await db.organization.findMany();
    expect(orgs).toEqual([]);

    await expect(
      db.membership.create({ data: { accountId: ANA, orgId: ORG_A, role: 'ADMIN' } }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('transação: caminho fechado em vez de contexto corrompido', () => {
  it('$transaction no client com contexto é RECUSADA, alto e claro', () => {
    // O gancho `$allOperations` fecha sobre o client RAIZ, não sobre o client da transação
    // corrente. Numa `$transaction` interativa, cada `tx.model.op()` abriria uma SEGUNDA
    // transação, em outra conexão do pool: a escrita commitaria FORA da transação externa
    // (atomicidade perdida) e poderia travar contra os locks que ela já segura.
    //
    // Nada disso apareceria como erro — daí o caminho ser fechado, e não remendado. Falhar
    // alto é honesto; transação com contexto organizacional é escopo da Story 1.3, onde há
    // consumidor real para desenhá-la.
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);

    // O cast é o ponto do teste, não um contorno: o tipo de `$transaction` no client
    // estendido não aceita argumento nenhum, então `db.$transaction(fn)` NÃO COMPILA — a
    // primeira barreira é o typecheck, e ela pega o erro antes de existir um teste. Aqui
    // furamos o tipo de propósito, para provar que a segunda barreira (runtime) também está
    // de pé para quem chegar por JavaScript ou por um `any`.
    const semTipo = db as unknown as { $transaction: (fn: unknown) => unknown };

    expect(() => semTipo.$transaction(async () => 1)).toThrow(/não suportam \$transaction/i);
  });
});

describe('contexto de conta (login, antes de haver Organização ativa)', () => {
  it('a conta descobre as próprias Memberships nas duas Organizações', async () => {
    // Story 1.4 depende disto: "a quais Orgs pertenço?" é perguntado ANTES de existir
    // `activeOrganizationId`. Bruno está em A e em B.
    //
    // Isto continua valendo depois do endurecimento da policy porque o ramo da conta só vale
    // quando NÃO há Organização no contexto — que é exatamente o caso do login.
    const db = withAccountContext(prisma, BRUNO, semLog);

    const minhas = await db.membership.findMany();

    expect(minhas).toHaveLength(2);
    expect(minhas.every((m) => m.accountId === BRUNO)).toBe(true);
    expect(minhas.map((m) => m.orgId).sort()).toEqual([ORG_A, ORG_B].sort());
  });

  it('mas não enxerga as Memberships de terceiros', async () => {
    const db = withAccountContext(prisma, BRUNO, semLog);

    const memberships = await db.membership.findMany();
    const donos = memberships.map((m) => m.accountId);

    expect(donos).not.toContain(ANA);
    expect(donos).not.toContain(CARLA);
  });

  it('contexto de conta não libera escrita organizacional', async () => {
    const db = withAccountContext(prisma, BRUNO, semLog);

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
    const db = withTenantContext(prisma, { orgId: ORG_A }, semLog);
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
    //
    // A leitura é global POR DESENHO — e é justamente por isso que a escrita não é: ver
    // "privilégio mínimo", acima. `Account.email` é PII, e o alcance dessa leitura está
    // registrado como risco no lgpd-check da Story.
    const contas = await prisma.account.findMany();

    expect(contas.length).toBeGreaterThanOrEqual(3);
    expect(contas.map((c) => c.id)).toEqual(expect.arrayContaining([ANA, BRUNO, CARLA]));
  });
});
