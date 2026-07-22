import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Auditoria administrativa (Story 8.8) pela porta da frente: HTTP real, `AppModule` de produção, banco
 * real. Prova o read-side que PROJETA sobre `MembershipEvent` (8.4/8.5/8.6):
 *   (a) isolamento por Org — evento de outra Organização NUNCA aparece (cross-tenant);
 *   (b) autz Admin-only — MEMBER → 403, sem principal → 401;
 *   (c) projeção allowlist — só as chaves contratadas; `orgId`/`payload` internos não vazam;
 *   (e) paginação/ordem/filtros determinísticos.
 * A prova (d) — `AUDIT_LOG_VIEWED` sanitizado sem copiar resultados — é do teste PURO
 * `audit-projection-core.test.ts` (`montarLogAuditoria`), onde o payload do log é assertável sem Pino.
 *
 * Os eventos são SEMEADOS via `migrator` (dono da tabela append-only) — o write-side real (8.4/8.5) exige
 * step-up com sessão better-auth, ausente sob o `PrincipalDeTeste`; semear a linha é o que a
 * `membership-events-rls` já faz. Escreve na Org C (área de escrita) com contas DESCARTÁVEIS (`randomUUID`).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

const adminConta = randomUUID();
const adminMemb = randomUUID();
const memberConta = randomUUID();
const memberMemb = randomUUID();
const alvoConta = randomUUID(); // Account descartável do alvo (FK da Membership-alvo)
const alvoMemb = randomUUID(); // Membership-alvo dos eventos (o recurso auditado) na Org C
const ator2 = randomUUID(); // um segundo ator, para o filtro por ator
// Isolamento: uma Membership + evento DESCARTÁVEIS na Org A (cross-tenant negativo).
const orgAConta = randomUUID();
const orgAMemb = randomUUID();
const orgAEventId = randomUUID();

// Cinco eventos na Org C, com occurredAt crescente (t0 < t1 < t2 < t3 < t4).
const evbase = Date.parse('2026-07-20T10:00:00.000Z');
interface Semente {
  eventId: string;
  type: string;
  actorId: string;
  offsetMin: number;
  payload?: Record<string, unknown>;
}
// Taxonomia REAL do MembershipEvent: ROLE_CHANGED/SUSPENDED/REACTIVATED/REMOVED (sem CREATED). Cinco
// eventos (tipos podem repetir — o que importa é occurredAt/ator para ordem e filtros).
const sementes: Semente[] = [
  { eventId: randomUUID(), type: 'ROLE_CHANGED', actorId: adminConta, offsetMin: 0 },
  {
    eventId: randomUUID(),
    type: 'ROLE_CHANGED',
    actorId: adminConta,
    offsetMin: 1,
    payload: { fromState: 'ACTIVE', toState: 'ACTIVE', segredoQualquer: 'NAO_DEVE_VAZAR' },
  },
  { eventId: randomUUID(), type: 'SUSPENDED', actorId: ator2, offsetMin: 2 },
  { eventId: randomUUID(), type: 'REACTIVATED', actorId: ator2, offsetMin: 3 },
  { eventId: randomUUID(), type: 'REMOVED', actorId: adminConta, offsetMin: 4 },
];

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface EventoVisao {
  auditEventId: string;
  schemaVersion: number;
  categoria: string;
  operacao: string;
  resultado: string;
  ocorridoEm: string;
  correlationId: string;
  ator: { accountId: string | null };
  recurso: { tipo: string; id: string };
  alteracao: Record<string, unknown>;
}
interface Pagina {
  eventos: EventoVisao[];
  proximoCursor: string | null;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(method: string, path: string, conta?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  return fetch(`${baseUrl}${path}`, { method, headers });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  await migrator.account.createMany({
    data: [
      { id: adminConta, email: `au-admin-${adminConta}@x.test`, name: 'Admin' },
      { id: memberConta, email: `au-member-${memberConta}@x.test`, name: 'Member' },
      { id: alvoConta, email: `au-alvo-${alvoConta}@x.test`, name: 'Alvo' },
      { id: orgAConta, email: `au-orga-${orgAConta}@x.test`, name: 'Org A' },
    ],
  });

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.createMany({
    data: [
      { id: adminMemb, accountId: adminConta, orgId: ORG_C, role: 'ADMIN', state: 'ACTIVE' },
      { id: memberMemb, accountId: memberConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
      // Membership-alvo (o recurso dos eventos), com Account descartável própria (FK).
      { id: alvoMemb, accountId: alvoConta, orgId: ORG_C, role: 'MEMBER', state: 'ACTIVE' },
    ],
  });

  // Eventos da Org C.
  await dbC.membershipEvent.createMany({
    data: sementes.map((s) => ({
      orgId: ORG_C,
      eventId: s.eventId,
      membershipId: alvoMemb,
      type: s.type,
      fromRole: 'MEMBER',
      toRole: 'MEMBER',
      actorId: s.actorId,
      occurredAt: new Date(evbase + s.offsetMin * 60_000),
      correlationId: randomUUID(),
      version: 1,
      payload: s.payload ?? {},
    })) as never,
  });

  // Isolamento: uma Membership + evento na Org A (cross-tenant negativo).
  const dbA = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await dbA.membership.create({
    data: { id: orgAMemb, accountId: orgAConta, orgId: ORG_A, role: 'MEMBER', state: 'ACTIVE' },
  });
  await dbA.membershipEvent.create({
    data: {
      orgId: ORG_A,
      eventId: orgAEventId,
      membershipId: orgAMemb,
      type: 'ROLE_CHANGED',
      fromRole: 'MEMBER',
      toRole: 'MEMBER',
      actorId: orgAConta,
      correlationId: randomUUID(),
      version: 1,
      payload: {},
    } as never,
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
}, 40000);

afterAll(async () => {
  if (migrator) {
    // MembershipEvent é append-only (nem o migrator apaga? o migrator É dono → pode). Faxina disposável.
    await migrator.membershipEvent
      .deleteMany({ where: { membershipId: { in: [alvoMemb, orgAMemb] } } })
      .catch(() => {});
    await migrator.membership
      .deleteMany({ where: { id: { in: [adminMemb, memberMemb, alvoMemb, orgAMemb] } } })
      .catch(() => {});
    await migrator.account
      .deleteMany({ where: { id: { in: [adminConta, memberConta, alvoConta, orgAConta] } } })
      .catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

const rota = '/organizations/audit';

describe('(b) autz Admin-only', () => {
  it('MEMBER → 403; sem principal → 401; Admin → 200', async () => {
    expect((await req('GET', rota, memberConta)).status).toBe(403);
    expect((await req('GET', rota, undefined)).status).toBe(401);
    expect((await req('GET', rota, adminConta)).status).toBe(200);
  });
});

describe('(e) ordem cronológica determinística e (c) projeção allowlist', () => {
  it('devolve os 5 eventos da Org C em occurredAt DESC; chaves exatamente as contratadas', async () => {
    // Escopado ao alvo para não depender do volume de eventos de testes vizinhos na Org C.
    const res = await req('GET', `${rota}?alvo=${alvoMemb}&limite=100`, adminConta);
    expect(res.status).toBe(200);
    const texto = await res.text();
    const pg = JSON.parse(texto) as Pagina;

    const meus = pg.eventos.filter((e) => e.recurso.id === alvoMemb);
    expect(meus).toHaveLength(5);
    // DESC por occurredAt (mais recente primeiro): REMOVED, REACTIVATED, SUSPENDED, ROLE_CHANGED, ROLE_CHANGED.
    expect(meus.map((e) => e.operacao)).toEqual([
      'REMOVED',
      'REACTIVATED',
      'SUSPENDED',
      'ROLE_CHANGED',
      'ROLE_CHANGED',
    ]);
    const tempos = meus.map((e) => new Date(e.ocorridoEm).getTime());
    expect([...tempos].sort((a, b) => b - a)).toEqual(tempos);

    // Projeção allowlist: chaves exatas por evento.
    expect(Object.keys(meus[0]!).sort()).toEqual([
      'alteracao',
      'ator',
      'auditEventId',
      'categoria',
      'correlationId',
      'ocorridoEm',
      'operacao',
      'recurso',
      'resultado',
      'schemaVersion',
    ]);
    // Nada interno/sensível vaza no corpo inteiro.
    for (const proibido of ['orgId', 'payload', 'segredoQualquer', 'NAO_DEVE_VAZAR', ORG_C]) {
      expect(texto).not.toContain(proibido);
    }
  });
});

describe('(a) isolamento por Org (cross-tenant)', () => {
  it('o evento da Org A NUNCA aparece para o Admin da Org C', async () => {
    const pg = (await (await req('GET', `${rota}?limite=100`, adminConta)).json()) as Pagina;
    expect(pg.eventos.some((e) => e.auditEventId === orgAEventId)).toBe(false);
    expect(pg.eventos.some((e) => e.recurso.id === orgAMemb)).toBe(false);
  });
});

describe('(e) filtros determinísticos', () => {
  it('filtra por operacao', async () => {
    const pg = (await (
      await req('GET', `${rota}?operacao=SUSPENDED&limite=100`, adminConta)
    ).json()) as Pagina;
    const meus = pg.eventos.filter((e) => e.recurso.id === alvoMemb);
    expect(meus).toHaveLength(1);
    expect(meus[0]!.operacao).toBe('SUSPENDED');
  });

  it('filtra por ator', async () => {
    const pg = (await (
      await req('GET', `${rota}?ator=${ator2}&limite=100`, adminConta)
    ).json()) as Pagina;
    const meus = pg.eventos.filter((e) => e.recurso.id === alvoMemb);
    expect(meus.map((e) => e.operacao).sort()).toEqual(['REACTIVATED', 'SUSPENDED']);
    expect(meus.every((e) => e.ator.accountId === ator2)).toBe(true);
  });

  it('filtra por alvo (membershipId)', async () => {
    const pg = (await (
      await req('GET', `${rota}?alvo=${alvoMemb}&limite=100`, adminConta)
    ).json()) as Pagina;
    expect(pg.eventos.every((e) => e.recurso.id === alvoMemb)).toBe(true);
    expect(pg.eventos).toHaveLength(5);
  });

  it('filtra por intervalo de/ate (occurredAt)', async () => {
    const de = new Date(evbase + 1 * 60_000).toISOString();
    const ate = new Date(evbase + 3 * 60_000).toISOString();
    const pg = (await (
      await req('GET', `${rota}?alvo=${alvoMemb}&de=${de}&ate=${ate}`, adminConta)
    ).json()) as Pagina;
    // t1, t2, t3 → ROLE_CHANGED, SUSPENDED, REACTIVATED.
    expect(pg.eventos.map((e) => e.operacao).sort()).toEqual([
      'REACTIVATED',
      'ROLE_CHANGED',
      'SUSPENDED',
    ]);
  });

  it('resultado que exclui SUCESSO → vazio (BLOQUEADA/FALHA são write-side futuro)', async () => {
    const pg = (await (
      await req('GET', `${rota}?alvo=${alvoMemb}&resultado=FALHA`, adminConta)
    ).json()) as Pagina;
    expect(pg.eventos).toHaveLength(0);
  });

  it('filtro/paginação inválidos → 400', async () => {
    expect((await req('GET', `${rota}?operacao=NAO_EXISTE`, adminConta)).status).toBe(400);
    expect((await req('GET', `${rota}?categoria=OUTRA`, adminConta)).status).toBe(400);
    expect((await req('GET', `${rota}?ator=nao-uuid`, adminConta)).status).toBe(400);
    expect((await req('GET', `${rota}?limite=0`, adminConta)).status).toBe(400);
    expect((await req('GET', `${rota}?cursor=nao-uuid`, adminConta)).status).toBe(400);
    const de = new Date(evbase + 3 * 60_000).toISOString();
    const ate = new Date(evbase + 1 * 60_000).toISOString();
    expect((await req('GET', `${rota}?de=${de}&ate=${ate}`, adminConta)).status).toBe(400);
  });
});

describe('(e) paginação por cursor determinística', () => {
  it('limite=2 sobre o alvo pagina sem sobreposição e cobre os 5 em ordem DESC', async () => {
    const p1 = (await (
      await req('GET', `${rota}?alvo=${alvoMemb}&limite=2`, adminConta)
    ).json()) as Pagina;
    expect(p1.eventos).toHaveLength(2);
    expect(p1.proximoCursor).not.toBeNull();

    const p2 = (await (
      await req('GET', `${rota}?alvo=${alvoMemb}&limite=2&cursor=${p1.proximoCursor}`, adminConta)
    ).json()) as Pagina;
    expect(p2.eventos).toHaveLength(2);

    const p3 = (await (
      await req('GET', `${rota}?alvo=${alvoMemb}&limite=2&cursor=${p2.proximoCursor}`, adminConta)
    ).json()) as Pagina;
    expect(p3.eventos).toHaveLength(1);
    expect(p3.proximoCursor).toBeNull();

    const ids = [...p1.eventos, ...p2.eventos, ...p3.eventos].map((e) => e.auditEventId);
    expect(new Set(ids).size).toBe(5); // sem sobreposição
    const tempos = [...p1.eventos, ...p2.eventos, ...p3.eventos].map((e) =>
      new Date(e.ocorridoEm).getTime(),
    );
    expect([...tempos].sort((a, b) => b - a)).toEqual(tempos); // DESC contínuo entre páginas
  });
});
