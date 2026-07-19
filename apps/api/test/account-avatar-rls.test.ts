import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e integridade do SLOT de avatar (Story 3.10) contra um PostgreSQL REAL, pelo papel de runtime
 * `giraffe_app` (sem BYPASSRLS, não é dono). É a FASE VERMELHA obrigatória do dono, provada no banco:
 *
 *   (1–3) `Account` continua INTOCADA: o runtime não tem UPDATE nela (email/name → permission denied);
 *   (4)   não existe coluna de avatar em `Account` — o desenho `Account.avatarFileId` foi REJEITADO;
 *   (5)   o usuário não cria associação para OUTRA Account (WITH CHECK do INSERT);
 *   (6)   o usuário não altera a associação de OUTRA Account (USING/WITH CHECK do UPDATE);
 *   (7)   um `FileObject` de OUTRA Organização é invisível sob o contexto — é assim que o serviço barra;
 *   (8)   não pode existir mais de um avatar por (Org, Conta) — UNIQUE, não regra de aplicação;
 *   (9)   duas tentativas CONCORRENTES não deixam dois slots (o banco elege um vencedor);
 *   (10)  `AccountAvatar` **sem** GRANT de DELETE — remover é `state`, não exclusão.
 *
 * O ponto arquitetural que este arquivo protege: o self-only do avatar é do BANCO, não da aplicação. Se
 * alguém amanhã afrouxar as policies para só `orgId = current_org_id()` (o padrão das outras tabelas), os
 * casos (5) e (6) ficam VERMELHOS — que é exatamente a regressão que se quer impedir.
 *
 * Área de escrita = Org C (fixtures descartáveis) com contas DEDICADAS (`randomUUID`). NUNCA reusar
 * Ana/Bruno/Carla/Eva do seed num membership persistente (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

/** Titular do avatar. */
const ALICE = randomUUID();
/** Outra conta da MESMA Organização — o "outro usuário" dos gates 5 e 6. */
const MALLORY = randomUUID();

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient; // runtime (giraffe_app)
let migrator: PrismaClient; // giraffe_migrator (setup/faxina)

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: RLS exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);

  // Contas descartáveis (globais — só o migrator escreve em Account) + Memberships na Org C.
  await migrator.account.createMany({
    data: [
      { id: ALICE, email: `alice-${ALICE}@teste.local`, name: 'Alice Avatar' },
      { id: MALLORY, email: `mallory-${MALLORY}@teste.local`, name: 'Mallory Avatar' },
    ],
  });
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { orgId: ORG_C, accountId: ALICE, role: 'MEMBER', state: 'ACTIVE' },
      { orgId: ORG_C, accountId: MALLORY, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });
});

/**
 * Faxina entre casos: a unicidade é por (Org, Conta), então um slot deixado por um teste faria o próximo
 * colidir no UNIQUE por motivo alheio ao que ele prova. O DELETE roda pelo MIGRATOR (o runtime não tem
 * DELETE — é justamente o que o último bloco prova) e sob contexto, porque a tabela é FORCE RLS: nem o dono
 * escapa das policies.
 */
async function limparSlots(): Promise<void> {
  for (const conta of [ALICE, MALLORY]) {
    const db = withTenantContext(migrator, { orgId: ORG_C, accountId: conta }, semLog);
    await db.accountAvatar.deleteMany({ where: { accountId: conta } }).catch(() => {});
  }
}

beforeEach(async () => {
  await limparSlots();
});

afterAll(async () => {
  if (migrator) {
    await limparSlots();
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    await dbC.fileObject
      .deleteMany({ where: { resourceId: { in: [ALICE, MALLORY] } } })
      .catch(() => {});
    await dbC.membership
      .deleteMany({ where: { accountId: { in: [ALICE, MALLORY] } } })
      .catch(() => {});
    await migrator.account.deleteMany({ where: { id: { in: [ALICE, MALLORY] } } }).catch(() => {});
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

/** Cria um FileObject de avatar (runtime) numa Org, já DISPONIVEL, e devolve o id. */
async function criarArquivoAvatar(orgId: string, accountId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId, accountId }, semLog);
  const f = await db.fileObject.create({
    data: {
      orgId,
      bucketKey: `${orgId}/${randomUUID()}`,
      nomeOriginal: 'avatar.png',
      resourceType: 'ACCOUNT',
      resourceId: accountId,
      state: 'DISPONIVEL',
    },
    select: { id: true },
  });
  return f.id;
}

describe('AD-10: `Account` permanece GLOBAL e SELECT-only para o runtime', () => {
  it('UPDATE de `email` pelo runtime → permission denied', async () => {
    await expect(
      prisma.$executeRaw`UPDATE "Account" SET "email" = 'invadido@teste.local' WHERE "id" = ${ALICE}::uuid`,
    ).rejects.toThrow(/permission denied/i);
  });

  it('UPDATE de `name` pelo runtime → permission denied', async () => {
    await expect(
      prisma.$executeRaw`UPDATE "Account" SET "name" = 'Invadido' WHERE "id" = ${ALICE}::uuid`,
    ).rejects.toThrow(/permission denied/i);
  });

  it('o runtime não tem privilégio de UPDATE algum em `Account`', async () => {
    const linhas = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.table_privileges
      WHERE grantee = 'giraffe_app' AND table_name = 'Account'`;
    const privilegios = linhas.map((l) => l.privilege_type).sort();
    expect(privilegios).toEqual(['SELECT']);
  });

  it('não existe coluna de avatar em `Account` (o desenho `Account.avatarFileId` foi rejeitado)', async () => {
    const linhas = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'Account' AND column_name ILIKE '%avatar%'`;
    expect(linhas).toEqual([]);
  });
});

describe('self-only imposto pelo BANCO (não pela aplicação)', () => {
  it('o titular cria o PRÓPRIO slot; criar para OUTRA Account é negado pelo WITH CHECK', async () => {
    const fileId = await criarArquivoAvatar(ORG_C, ALICE);
    const dbAlice = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);

    // O próprio: aceito.
    await expect(
      dbAlice.accountAvatar.createMany({
        data: [{ orgId: ORG_C, accountId: ALICE, fileId }],
      }),
    ).resolves.toBeTruthy();

    // Para outra conta, no contexto de Alice: negado pela policy — não por checagem de serviço.
    // `createMany` (sem RETURNING) isola o WITH CHECK do INSERT da policy de SELECT.
    await expect(
      dbAlice.accountAvatar.createMany({
        data: [{ orgId: ORG_C, accountId: MALLORY, fileId }],
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it('o slot de OUTRA Account é invisível e não pode ser alterado', async () => {
    const fileMallory = await criarArquivoAvatar(ORG_C, MALLORY);
    const dbMallory = withTenantContext(prisma, { orgId: ORG_C, accountId: MALLORY }, semLog);
    await dbMallory.accountAvatar.createMany({
      data: [{ orgId: ORG_C, accountId: MALLORY, fileId: fileMallory }],
    });

    const dbAlice = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);

    // Invisível: a policy de SELECT é self-only.
    expect(await dbAlice.accountAvatar.findMany({ where: { accountId: MALLORY } })).toEqual([]);

    // E o UPDATE não alcança linha alguma (USING filtra — não lança, FILTRA; por isso conta-se o count).
    const fileAlice = await criarArquivoAvatar(ORG_C, ALICE);
    const r = await dbAlice.accountAvatar.updateMany({
      where: { accountId: MALLORY },
      data: { fileId: fileAlice },
    });
    expect(r.count).toBe(0);

    // O slot de Mallory segue apontando para o arquivo dela.
    const dela = await dbMallory.accountAvatar.findFirst({ where: { accountId: MALLORY } });
    expect(dela?.fileId).toBe(fileMallory);
  });

  it('o slot não pode ser "movido" para outra Conta nem para outra Organização (WITH CHECK do UPDATE)', async () => {
    const fileId = await criarArquivoAvatar(ORG_C, ALICE);
    const dbAlice = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);
    await dbAlice.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: ALICE, fileId }] });

    await expect(
      dbAlice.accountAvatar.updateMany({
        where: { accountId: ALICE },
        data: { accountId: MALLORY },
      }),
    ).rejects.toThrow(/row-level security/i);

    await expect(
      dbAlice.accountAvatar.updateMany({ where: { accountId: ALICE }, data: { orgId: ORG_A } }),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('isolamento por Organização', () => {
  it('um arquivo de OUTRA Organização é invisível sob o contexto — é assim que o serviço barra', async () => {
    const fileNaOrgA = await criarArquivoAvatar(ORG_A, ALICE);
    const dbAliceC = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);
    expect(await dbAliceC.fileObject.findUnique({ where: { id: fileNaOrgA } })).toBeNull();
  });

  it('o slot criado na Org C é invisível na Org A (mesma conta, outra Organização)', async () => {
    const fileId = await criarArquivoAvatar(ORG_C, ALICE);
    const dbC = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);
    await dbC.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: ALICE, fileId }] });

    const dbA = withTenantContext(prisma, { orgId: ORG_A, accountId: ALICE }, semLog);
    expect(await dbA.accountAvatar.findMany({ where: { accountId: ALICE } })).toEqual([]);
  });
});

describe('um só avatar por (Organização, Conta) — imposto pela CHAVE', () => {
  it('um segundo slot para o mesmo par colide no UNIQUE', async () => {
    const f1 = await criarArquivoAvatar(ORG_C, ALICE);
    const f2 = await criarArquivoAvatar(ORG_C, ALICE);
    const db = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);

    await db.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: ALICE, fileId: f1 }] });
    await expect(
      db.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: ALICE, fileId: f2 }] }),
    ).rejects.toThrow(/unique|duplicate/i);
  });

  it('duas criações CONCORRENTES não deixam dois slots — o banco elege um vencedor', async () => {
    const [f1, f2] = await Promise.all([
      criarArquivoAvatar(ORG_C, MALLORY),
      criarArquivoAvatar(ORG_C, MALLORY),
    ]);
    const db = withTenantContext(prisma, { orgId: ORG_C, accountId: MALLORY }, semLog);

    const r = await Promise.allSettled([
      db.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: MALLORY, fileId: f1 }] }),
      db.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: MALLORY, fileId: f2 }] }),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);

    const slots = await db.accountAvatar.findMany({ where: { accountId: MALLORY } });
    expect(slots).toHaveLength(1);
  });
});

describe('sem exclusão: o runtime não tem DELETE em AccountAvatar', () => {
  it('DELETE → permission denied (remover é `state`, não exclusão)', async () => {
    const fileId = await criarArquivoAvatar(ORG_C, ALICE);
    const db = withTenantContext(prisma, { orgId: ORG_C, accountId: ALICE }, semLog);
    await db.accountAvatar.createMany({ data: [{ orgId: ORG_C, accountId: ALICE, fileId }] });

    await expect(db.accountAvatar.deleteMany({ where: { accountId: ALICE } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('o GRANT do runtime é exatamente SELECT/INSERT/UPDATE', async () => {
    const linhas = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.table_privileges
      WHERE grantee = 'giraffe_app' AND table_name = 'AccountAvatar'`;
    expect(linhas.map((l) => l.privilege_type).sort()).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });
});
