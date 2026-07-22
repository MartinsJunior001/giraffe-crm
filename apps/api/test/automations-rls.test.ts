import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e fronteira de privilégio de `Automation` (Story 4.1) contra um PostgreSQL REAL, pelo papel
 * de runtime `giraffe_app`. Quem nega é o BANCO. Se o Postgres estiver fora, a suíte fica VERMELHA, não
 * pulada — banco indisponível é falha, não ausência de evidência.
 *
 * Prova, além do padrão de RLS já consolidado:
 *
 *   · **F-A1 — a FK COMPOSTA tenant-safe.** Este é o teste central da Story: um INSERT com `orgId`
 *     próprio e `pipeId` de OUTRA Organização é recusado pelo BANCO, não pelo serviço. A cobertura aqui
 *     é por **controle positivo e negativo** — o par coerente é aceito, o par cruzado é rejeitado —, o
 *     que prova que o que barrou foi o par cruzado e não um erro incidental.
 *   · **GRANT como fronteira de escopo.** A 4.1 CRIA e LÊ: `SELECT`/`INSERT` concedidos, `UPDATE` e
 *     `DELETE` NEGADOS (`permission denied`). É isso que torna a Story segura antes do motor — o
 *     runtime não consegue levar uma Automação a `ACTIVE`.
 *
 * **O que estes testes NÃO fazem — e a distinção importa.** Nenhum `it` aqui derruba a constraint ou
 * afrouxa a policy: eles exercitam a proteção **presente**. A remoção da `Automation_orgId_pipeId_fkey`
 * e o afrouxamento do `WITH CHECK`, com observação da gravação cross-tenant, limpeza dos invasores,
 * restauração e reconfirmação, foram um **drill MANUAL em banco descartável**, registrado na mensagem do
 * commit e no PR — **não** estão versionados aqui, e portanto **não são reproduzíveis** por `pnpm test`.
 * Automatizar esse drill é débito próprio (L1). Rotular estes testes de "fase vermelha" induziria a crer
 * que a derrubada acontece dentro deles, que é exatamente o erro que a prática existe para evitar.
 *
 * Escrita sempre na **Org C** com Pipe descartável (`randomUUID`) — nunca reusar as fixtures de leitura
 * (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;

/** Pipes descartáveis criados pelo teste, por Org — removidos pelo dono no final. */
const pipesCriados: { id: string; orgId: string }[] = [];
const automacoesCriadas: string[] = [];

const CONFIG = {
  quando: { tipo: 'CARD_CREATED', refs: [] },
  condicoes: [],
  entao: [{ tipo: 'MOVER_CARD', parametros: {}, refs: [] }],
};

/** Cria um Pipe descartável na Org indicada, pelo runtime sob contexto. */
async function criarPipe(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-4-1-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipesCriados.push({ id: pipe.id, orgId });
  return pipe.id;
}

beforeAll(async () => {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL ausente: os testes de RLS de Automation exigem um PostgreSQL real.',
    );
  }
  if (!migratorUrl) {
    throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  }
  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
});

afterAll(async () => {
  // Faxina pelo DONO: o runtime não tem DELETE em `Automation` nem em `Pipe` (é o que a Story exige).
  // Ordem: Automação primeiro — a FK composta é RESTRICT e barraria o Pipe com Automação viva.
  if (migrator) {
    if (automacoesCriadas.length > 0) {
      for (const orgId of [ORG_A, ORG_C]) {
        const db = withTenantContext(migrator, { orgId }, semLog);
        await db.automation.deleteMany({ where: { id: { in: automacoesCriadas } } });
      }
    }
    for (const { id, orgId } of pipesCriados) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.pipe.deleteMany({ where: { id } });
    }
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel, RLS e propriedade da tabela Automation', () => {
  it('runtime é giraffe_app, sem BYPASSRLS/SUPERUSER', async () => {
    const papeis = await prisma.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(papeis[0]?.rolname).toBe('giraffe_app');
    expect(papeis[0]?.rolsuper).toBe(false);
    expect(papeis[0]?.rolbypassrls).toBe(false);
  });

  it('Automation tem RLS ENABLE + FORCE e NÃO é do runtime', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE relname = 'Automation'`;
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    // Sem esta asserção o teste "não é dono" passaria pelo motivo errado — lição já registrada na base.
    expect(t[0]?.dono).not.toBe('giraffe_app');
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });

  it('as quatro policies existem, com WITH CHECK no INSERT e no UPDATE', async () => {
    const policies = await prisma.$queryRaw<
      { policyname: string; cmd: string; withcheck: string | null }[]
    >`
      SELECT policyname, cmd, with_check::text AS withcheck
        FROM pg_policies WHERE tablename = 'Automation' ORDER BY policyname`;
    expect(policies.map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);

    const insert = policies.find((p) => p.cmd === 'INSERT');
    const update = policies.find((p) => p.cmd === 'UPDATE');
    // Sem WITH CHECK no INSERT, linha com `orgId` alheio entraria e ficaria invisível; sem ele no
    // UPDATE, uma linha poderia ser MOVIDA para outra Organização.
    expect(insert?.withcheck).toContain('current_org_id()');
    expect(update?.withcheck).toContain('current_org_id()');
  });
});

describe('GRANT — a fronteira que prova o escopo da 4.1', () => {
  it('no nível da TABELA o runtime tem só SELECT/INSERT (UPDATE é column-scoped na 4.2; DELETE nunca)', async () => {
    // `role_table_grants` mostra privilégios de TABELA. A 4.2 concede `UPDATE (colunas)` — privilégio de
    // COLUNA, que NÃO aparece aqui: no nível-tabela o runtime segue com SELECT/INSERT. O escopo do UPDATE
    // column-scoped da 4.2 é provado em `automation-lifecycle-rls`. DELETE nunca (abaixo).
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'Automation' AND grantee = 'giraffe_app'`;
    const concedidos = privs.map((p) => p.privilege_type).sort();
    expect(concedidos).toEqual(['INSERT', 'SELECT']);
  });

  it('nasce INACTIVE (D4.3) — o default seguro; transicionar é a 4.2 (via UPDATE column-scoped)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criada = await db.automation.create({
      data: { orgId: ORG_C, pipeId, name: 'nasce-inativa', ...CONFIG },
      select: { id: true, state: true },
    });
    automacoesCriadas.push(criada.id);
    // "Só a ativa dispara" (D4.3): nada criado por INSERT pode disparar. A ativação é a 4.2, com sua
    // guarda de autorização; o escopo do GRANT que ela abre é provado em `automation-lifecycle-rls`.
    expect(criada.state).toBe('INACTIVE');
  });

  it('DELETE é NEGADO pelo banco — não há exclusão definitiva (D4.3)', async () => {
    const pipeId = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criada = await db.automation.create({
      data: { orgId: ORG_C, pipeId, name: 'sem-delete', ...CONFIG },
      select: { id: true },
    });
    automacoesCriadas.push(criada.id);

    await expect(db.automation.deleteMany({ where: { id: criada.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe('F-A1 — FK composta tenant-safe (o vínculo é garantido pelo BANCO)', () => {
  it('aceita o par COERENTE — Automação e Pipe na mesma Organização', async () => {
    const pipeC = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    const criada = await db.automation.create({
      data: { orgId: ORG_C, pipeId: pipeC, name: 'par-coerente', ...CONFIG },
      select: { id: true, pipeId: true },
    });
    automacoesCriadas.push(criada.id);

    expect(criada.pipeId).toBe(pipeC);
  });

  it('rejeita o par CROSS-TENANT — `orgId` próprio + `pipeId` de OUTRA Organização', async () => {
    // Pipe real, existente, porém da Org A.
    const pipeAlheio = await criarPipe(ORG_A);

    // Contexto da Org C: a policy de INSERT vê `orgId = 'C' = current_org_id()` e APROVA. Com FK simples
    // em `pipeId`, a verificação referencial — que roda com bypass de row security — encontraria o Pipe
    // da Org A e ACEITARIA a linha. É exatamente esse vazamento que o par fecha.
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    await expect(
      db.automation.create({
        data: { orgId: ORG_C, pipeId: pipeAlheio, name: 'cross-tenant', ...CONFIG },
        select: { id: true },
      }),
    ).rejects.toThrow(/foreign key|Automation_orgId_pipeId_fkey/i);
  });

  it('a constraint composta existe e aponta para o PAR (orgId, id) de Pipe', async () => {
    const fk = await prisma.$queryRaw<{ definicao: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definicao
        FROM pg_constraint WHERE conname = 'Automation_orgId_pipeId_fkey'`;
    expect(fk[0]?.definicao).toMatch(/FOREIGN KEY \("orgId", "pipeId"\)/);
    // O PostgreSQL só aspa identificadores que precisam: "orgId" (camelCase) sai citado, `id` não.
    expect(fk[0]?.definicao).toMatch(/REFERENCES "Pipe"\("orgId", id\)/);
    // RESTRICT: apagar um Pipe com Automação é erro explícito, nunca cascata silenciosa.
    expect(fk[0]?.definicao).toMatch(/ON DELETE RESTRICT/);
  });

  it('RESTRICT protege de fato: apagar um Pipe com Automação viva é recusado', async () => {
    const pipeId = await criarPipe(ORG_C);
    const runtime = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criada = await runtime.automation.create({
      data: { orgId: ORG_C, pipeId, name: 'restrict', ...CONFIG },
      select: { id: true },
    });
    automacoesCriadas.push(criada.id);

    // Pelo DONO (o runtime nem tem DELETE em Pipe) — é o RESTRICT que barra, não o privilégio.
    const dono = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    // O Prisma embrulha o erro do Postgres na sua própria mensagem, mas nomeia a constraint — e é a
    // identidade dela que importa: quem barrou foi a FK COMPOSTA, não um privilégio ou outro vínculo.
    await expect(dono.pipe.deleteMany({ where: { id: pipeId } })).rejects.toThrow(
      /Foreign key constraint violated.*Automation_orgId_pipeId_fkey/is,
    );
  });
});

describe('isolamento entre Organizações', () => {
  it('cada tenant só enxerga as próprias Automações', async () => {
    const pipeC = await criarPipe(ORG_C);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const daOrgC = await dbC.automation.create({
      data: { orgId: ORG_C, pipeId: pipeC, name: 'so-da-C', ...CONFIG },
      select: { id: true },
    });
    automacoesCriadas.push(daOrgC.id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.automation.findMany({ where: { id: daOrgC.id } })).toEqual([]);
    expect(await dbC.automation.findMany({ where: { id: daOrgC.id } })).toHaveLength(1);
  });

  it('INSERT com `orgId` alheio é barrado pelo WITH CHECK — via createMany (sem RETURNING)', async () => {
    // `create` emite INSERT ... RETURNING, e o RETURNING esbarra na policy de SELECT: o teste ficaria
    // verde mesmo com o WITH CHECK desligado. `createMany` não tem RETURNING — lição já paga nesta base.
    const pipeA = await criarPipe(ORG_A);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);

    await expect(
      db.automation.createMany({
        data: [{ orgId: ORG_A, pipeId: pipeA, name: 'forjada', ...CONFIG }],
      }),
    ).rejects.toThrow(/row-level security|violates/i);
  });

  it('sem contexto de Organização, nada é visível (deny-by-default)', async () => {
    // `current_org_id()` devolve NULL, e comparação com NULL nunca é TRUE.
    const semContexto = await prisma.automation.findMany({ take: 1 });
    expect(semContexto).toEqual([]);
  });
});
