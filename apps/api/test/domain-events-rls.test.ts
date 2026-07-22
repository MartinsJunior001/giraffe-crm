import { randomUUID } from 'node:crypto';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Isolamento e fronteira de privilégio de `DomainEvent` (Story 4.3 — o outbox canônico de Evento) contra um
 * PostgreSQL REAL, pelo papel de runtime `giraffe_app`. Quem nega é o BANCO. Se o Postgres estiver fora, a
 * suíte fica VERMELHA, não pulada — banco indisponível é falha, não ausência de evidência.
 *
 * Prova, além do padrão de RLS já consolidado:
 *   · **Append-only imutável (o ponto da Story):** GRANT SÓ `SELECT`/`INSERT`; `UPDATE` E `DELETE` NEGADOS
 *     (`permission denied`) — "sem alteração/exclusão do evento canônico" é garantido pelo banco, como
 *     MovementEvent/CardHistory/FormVersion.
 *   · **FK COMPOSTA tenant-safe** `(orgId, pipeId) → Pipe(orgId, id)`: um INSERT com `orgId` próprio e
 *     `pipeId` de OUTRA Organização é recusado pelo BANCO (controle positivo e negativo). `pipeId` NULL
 *     (Registro puro) é aceito (MATCH SIMPLE não checa a FK).
 *   · **RLS FORCE + WITH CHECK** e isolamento cross-tenant.
 *
 * **O que estes testes NÃO fazem:** nenhum `it` derruba a policy/constraint. O afrouxamento do `WITH CHECK`
 * e a remoção da FK, com observação da gravação cross-tenant e restauração, foram um **drill MANUAL em banco
 * descartável**, registrado no PR — não versionado aqui (débito L1, como em `automations-rls`).
 *
 * Escrita sempre na **Org C** com Pipe descartável (`randomUUID`) — nunca reusar fixtures de leitura
 * (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let prisma: PrismaClient;
let migrator: PrismaClient;

const pipesCriados: { id: string; orgId: string }[] = [];
const eventosCriados: string[] = [];

/** Uma linha de `DomainEvent` mínima e válida, na Org/Pipe indicados. `resourceId`/`eventId` únicos. */
function linhaEvento(orgId: string, pipeId: string | null) {
  return {
    orgId,
    eventId: randomUUID(),
    eventType: 'CARD_CREATED',
    schemaVersion: 1,
    pipeId,
    resourceType: 'CARD',
    resourceId: randomUUID(),
    actorId: null,
    origin: 'SUBMISSION',
    correlationId: randomUUID(),
    // `payload` omitido: a coluna tem default '{}' no banco. Evita o atrito de tipagem do Json de entrada.
  };
}

async function criarPipe(orgId: string): Promise<string> {
  const db = withTenantContext(prisma, { orgId }, semLog);
  const pipe = await db.pipe.create({
    data: { orgId, name: `pipe-4-3-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  pipesCriados.push({ id: pipe.id, orgId });
  return pipe.id;
}

beforeAll(async () => {
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL ausente: os testes de RLS de DomainEvent exigem um PostgreSQL real.',
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
  // Faxina pelo DONO: o runtime não tem DELETE em `DomainEvent` nem em `Pipe`. Ordem: eventos primeiro — a
  // FK composta é RESTRICT e barraria o Pipe com evento vivo.
  if (migrator) {
    for (const orgId of [ORG_A, ORG_C]) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      if (eventosCriados.length > 0) {
        await db.domainEvent.deleteMany({ where: { id: { in: eventosCriados } } });
      }
    }
    for (const { id, orgId } of pipesCriados) {
      const db = withTenantContext(migrator, { orgId }, semLog);
      await db.pipe.deleteMany({ where: { id } });
    }
  }
  await Promise.all([prisma?.$disconnect(), migrator?.$disconnect()]);
});

describe('papel, RLS e propriedade da tabela DomainEvent', () => {
  it('runtime é giraffe_app, sem BYPASSRLS/SUPERUSER', async () => {
    const papeis = await prisma.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(papeis[0]?.rolname).toBe('giraffe_app');
    expect(papeis[0]?.rolsuper).toBe(false);
    expect(papeis[0]?.rolbypassrls).toBe(false);
  });

  it('DomainEvent tem RLS ENABLE + FORCE e NÃO é do runtime', async () => {
    const t = await prisma.$queryRaw<
      { dono: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
    >`SELECT pg_get_userbyid(relowner) AS dono, relrowsecurity, relforcerowsecurity
        FROM pg_class WHERE relname = 'DomainEvent'`;
    expect(t[0]?.relrowsecurity).toBe(true);
    expect(t[0]?.relforcerowsecurity).toBe(true);
    expect(t[0]?.dono).not.toBe('giraffe_app');
    expect(t[0]?.dono).toBe('giraffe_migrator');
  });

  it('as quatro policies existem, com WITH CHECK no INSERT e no UPDATE', async () => {
    const policies = await prisma.$queryRaw<
      { policyname: string; cmd: string; withcheck: string | null }[]
    >`
      SELECT policyname, cmd, with_check::text AS withcheck
        FROM pg_policies WHERE tablename = 'DomainEvent' ORDER BY policyname`;
    expect(policies.map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    const insert = policies.find((p) => p.cmd === 'INSERT');
    const update = policies.find((p) => p.cmd === 'UPDATE');
    expect(insert?.withcheck).toContain('current_org_id()');
    expect(update?.withcheck).toContain('current_org_id()');
  });
});

describe('GRANT — append-only imutável (a fronteira que prova a Story)', () => {
  it('no nível da TABELA o runtime tem SÓ SELECT/INSERT', async () => {
    const privs = await prisma.$queryRaw<{ privilege_type: string }[]>`
      SELECT privilege_type FROM information_schema.role_table_grants
       WHERE table_name = 'DomainEvent' AND grantee = 'giraffe_app'`;
    expect(privs.map((p) => p.privilege_type).sort()).toEqual(['INSERT', 'SELECT']);
  });

  it('INSERT é permitido — emitir o Evento é uma nova linha', async () => {
    const pipeId = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criado = await db.domainEvent.create({
      data: linhaEvento(ORG_C, pipeId),
      select: { id: true, eventType: true },
    });
    eventosCriados.push(criado.id);
    expect(criado.eventType).toBe('CARD_CREATED');
  });

  it('UPDATE é NEGADO pelo banco — o evento canônico é imutável', async () => {
    const pipeId = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criado = await db.domainEvent.create({
      data: linhaEvento(ORG_C, pipeId),
      select: { id: true },
    });
    eventosCriados.push(criado.id);
    await expect(
      db.domainEvent.updateMany({ where: { id: criado.id }, data: { origin: 'ADULTERADO' } }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('DELETE é NEGADO pelo banco — não há exclusão do evento canônico', async () => {
    const pipeId = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criado = await db.domainEvent.create({
      data: linhaEvento(ORG_C, pipeId),
      select: { id: true },
    });
    eventosCriados.push(criado.id);
    await expect(db.domainEvent.deleteMany({ where: { id: criado.id } })).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('reprocessar o mesmo fato (mesmo eventId) colide no UNIQUE — idempotência pelo banco', async () => {
    const pipeId = await criarPipe(ORG_C);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const linha = linhaEvento(ORG_C, pipeId);
    const a = await db.domainEvent.create({ data: linha, select: { id: true } });
    eventosCriados.push(a.id);
    // Mesmo (orgId, eventId), resourceId diferente: o UNIQUE([orgId, eventId]) barra a 2ª linha lógica.
    await expect(
      db.domainEvent.create({ data: { ...linhaEvento(ORG_C, pipeId), eventId: linha.eventId } }),
    ).rejects.toThrow(/unique|constraint/i);
  });
});

describe('F-A1 — FK composta tenant-safe do pipeId', () => {
  it('aceita pipeId NULL (Registro puro — sem Pipe)', async () => {
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const criado = await db.domainEvent.create({
      data: { ...linhaEvento(ORG_C, null), eventType: 'RECORD_CREATED', resourceType: 'RECORD' },
      select: { id: true, pipeId: true },
    });
    eventosCriados.push(criado.id);
    expect(criado.pipeId).toBeNull();
  });

  it('rejeita o par CROSS-TENANT — `orgId` próprio + `pipeId` de OUTRA Organização', async () => {
    const pipeAlheio = await criarPipe(ORG_A);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(
      db.domainEvent.create({ data: linhaEvento(ORG_C, pipeAlheio), select: { id: true } }),
    ).rejects.toThrow(/foreign key|DomainEvent_orgId_pipeId_fkey/i);
  });

  it('a constraint composta existe e aponta para o PAR (orgId, id) de Pipe', async () => {
    const fk = await prisma.$queryRaw<{ definicao: string }[]>`
      SELECT pg_get_constraintdef(oid) AS definicao
        FROM pg_constraint WHERE conname = 'DomainEvent_orgId_pipeId_fkey'`;
    expect(fk[0]?.definicao).toMatch(/FOREIGN KEY \("orgId", "pipeId"\)/);
    expect(fk[0]?.definicao).toMatch(/REFERENCES "Pipe"\("orgId", id\)/);
    // CASCADE como MovementEvent (evento derivado do Pipe); a tenant-safety vem do PAR no INSERT, não do DELETE.
    expect(fk[0]?.definicao).toMatch(/ON DELETE CASCADE/);
  });
});

describe('isolamento entre Organizações', () => {
  it('cada tenant só enxerga os próprios Eventos', async () => {
    const pipeC = await criarPipe(ORG_C);
    const dbC = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    const daC = await dbC.domainEvent.create({
      data: linhaEvento(ORG_C, pipeC),
      select: { id: true },
    });
    eventosCriados.push(daC.id);

    const dbA = withTenantContext(prisma, { orgId: ORG_A }, semLog);
    expect(await dbA.domainEvent.findMany({ where: { id: daC.id } })).toEqual([]);
    expect(await dbC.domainEvent.findMany({ where: { id: daC.id } })).toHaveLength(1);
  });

  it('INSERT com `orgId` alheio é barrado pelo WITH CHECK — via createMany (sem RETURNING)', async () => {
    const pipeA = await criarPipe(ORG_A);
    const db = withTenantContext(prisma, { orgId: ORG_C }, semLog);
    await expect(db.domainEvent.createMany({ data: [linhaEvento(ORG_A, pipeA)] })).rejects.toThrow(
      /row-level security|violates/i,
    );
  });

  it('sem contexto de Organização, nada é visível (deny-by-default)', async () => {
    const semContexto = await prisma.domainEvent.findMany({ take: 1 });
    expect(semContexto).toEqual([]);
  });
});
