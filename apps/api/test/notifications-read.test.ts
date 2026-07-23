import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../generated/prisma';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { ContextoOrganizacional, RequestContext } from '../src/kernel/context/request-context';
import { NotificationsService } from '../src/notifications/notifications.service';

/**
 * Superfícies, leitura, revalidação de acesso e preferências (Story 5.4) pela porta da frente: HTTP real, banco
 * real. Prova: AC1 (badge/popover/página coerentes; contagem NO SERVIDOR; zero legítimo; cursor); AC2 (marcar
 * lida idempotente + 404 alheio; marcar todas via HTTP); AC3 (revalidação por `resourceType`:
 * CARD/TASK/SOLICITACAO/RECORD — sem acesso ⇒ oculta + fora da contagem; conceder ⇒ visível; revogar ⇒ oculta;
 * tipo desconhecido ⇒ oculta; recurso nulo ⇒ visível); AC4 (preferência silencia um tipo nas superfícies+contagem).
 *
 * Notificações são semeadas pela fonte única (5.3) para a Membership de BRUNO na Org A; a leitura roda como
 * BRUNO. Setup de recursos (Pipe/Card/Database/Record) via HTTP como ANA. Limpeza prévia via migrator (owner).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };
const svcLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
} as unknown as PinoLogger;

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

interface Ident {
  id: string;
}
interface NotificacaoVisao {
  id: string;
  type: string;
  resourceType: string;
  resourceId: string | null;
  lida: boolean;
}

let app: INestApplication;
let baseUrl: string;
let appPrisma: PrismaClient; // giraffe_app — seed de notificações + inserts sob contexto
let migrator: PrismaClient; // owner — limpeza prévia
let seedSvc: NotificationsService;

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

// ids dos recursos e notificações semeados
let cardId: string;
let taskId: string;
let solicitacaoId: string;
let recordId: string;
let databaseId: string;
let nCard: string;
let nTask: string;
let nSolic: string;
let nRecord: string;
let nUnknown: string;
let nNull: string;

async function req(
  method: string,
  path: string,
  conta?: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function contextoOrgA(): RequestContext {
  const contexto: ContextoOrganizacional = { orgId: ORG_A, accountId: ANA, papel: 'ADMIN' };
  return { obter: () => contexto } as unknown as RequestContext;
}

/** Semeia uma Notificação para BRUNO e devolve o notificationId. */
async function semear(
  type: string,
  resourceType: string,
  resourceId: string | null,
): Promise<string> {
  const { notificacao } = await seedSvc.registrarNotificacao({
    type,
    sourceEventId: randomUUID(),
    resourceType,
    resourceId,
    recipients: [{ membershipId: MEMBERSHIP_BRUNO_A, userId: BRUNO }],
  });
  return notificacao.id;
}

async function pipeComCard(): Promise<{ pipeId: string; cardId: string }> {
  const pipeRes = await req('POST', '/pipes', ANA, { name: `notif-${randomUUID()}` });
  const pipeId = ((await pipeRes.json()) as Ident).id;
  await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' });
  const campo = (await (
    await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
      label: 'Nome',
      type: 'TEXT_SHORT',
    })
  ).json()) as Ident;
  await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA);
  const sub = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: randomUUID(),
    valores: { [campo.id]: 'x' },
  });
  return { pipeId, cardId: ((await sub.json()) as Ident).id };
}

async function databaseComRecord(): Promise<{ databaseId: string; recordId: string }> {
  const dbId = (
    (await (
      await req('POST', '/databases', ANA, { name: `notif-db-${randomUUID()}` })
    ).json()) as Ident
  ).id;
  const campo = (await (
    await req('POST', `/databases/${dbId}/form/fields`, ANA, { label: 'Nome', type: 'TEXT_SHORT' })
  ).json()) as Ident;
  await req('POST', `/databases/${dbId}/form/publish`, ANA);
  const rec = await req('POST', `/databases/${dbId}/records`, ANA, {
    idempotencyKey: randomUUID(),
    valores: { [campo.id]: 'x' },
  });
  return { databaseId: dbId, recordId: ((await rec.json()) as Ident).id };
}

let pipeId: string;

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!databaseUrl || !migratorUrl)
    throw new Error('DATABASE_URL/MIGRATION_DATABASE_URL ausentes.');

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();

  appPrisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([appPrisma.$connect(), migrator.$connect()]);
  seedSvc = new NotificationsService(
    contextoOrgA(),
    appPrisma as unknown as PrismaService,
    svcLogger,
  );

  // Limpeza prévia (owner + contexto): remove notificações/preferências de BRUNO na Org A de execuções passadas.
  const dbMig = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await dbMig.notificationRecipient.deleteMany({
    where: { recipientMembershipId: MEMBERSHIP_BRUNO_A },
  });
  await dbMig.notificationPreference.deleteMany({ where: { membershipId: MEMBERSHIP_BRUNO_A } });

  // Recursos reais (ANA).
  const pc = await pipeComCard();
  pipeId = pc.pipeId;
  cardId = pc.cardId;
  const dr = await databaseComRecord();
  databaseId = dr.databaseId;
  recordId = dr.recordId;

  // Task e Solicitação (insert direto sob contexto — só pipeId+title obrigatórios).
  const dbApp = withTenantContext(appPrisma, { orgId: ORG_A }, semLog);
  taskId = (
    await dbApp.task.create({ data: { orgId: ORG_A, pipeId, title: 'T' }, select: { id: true } })
  ).id;
  solicitacaoId = (
    await dbApp.solicitacao.create({
      data: { orgId: ORG_A, pipeId, title: 'S' },
      select: { id: true },
    })
  ).id;

  // Notificações para BRUNO (uma por resourceType + tipo desconhecido + recurso nulo).
  nCard = await semear('RESP_ASSIGNED', 'CARD', cardId);
  nTask = await semear('TASK_ASSIGNED', 'TASK', taskId);
  nSolic = await semear('SOLIC_UPDATED', 'SOLICITACAO', solicitacaoId);
  nRecord = await semear('RECORD_UPDATED', 'RECORD', recordId);
  nUnknown = await semear('X_TYPE', 'WIDGET', randomUUID());
  nNull = await semear('SYSTEM_NOTICE', 'SYSTEM', null);
});

afterAll(async () => {
  await app?.close();
  await appPrisma?.$disconnect();
  await migrator?.$disconnect();
});

async function idsVisiveis(): Promise<Set<string>> {
  const res = await req('GET', '/notifications?limite=100', BRUNO);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { notificacoes: NotificacaoVisao[] };
  return new Set(body.notificacoes.map((n) => n.id));
}

async function contar(): Promise<{ naoLidas: number; mais: boolean }> {
  const res = await req('GET', '/notifications/contagem', BRUNO);
  expect(res.status).toBe(200);
  return (await res.json()) as { naoLidas: number; mais: boolean };
}

describe('AC3 — revalidação de acesso por resourceType (sem acesso ⇒ oculta + fora da contagem)', () => {
  it('sem grants: só o recurso-nulo é visível; inacessíveis e tipo desconhecido são ocultos', async () => {
    const vis = await idsVisiveis();
    expect(vis.has(nNull)).toBe(true); // recurso nulo → sempre visível
    expect(vis.has(nCard)).toBe(false);
    expect(vis.has(nTask)).toBe(false);
    expect(vis.has(nSolic)).toBe(false);
    expect(vis.has(nRecord)).toBe(false);
    expect(vis.has(nUnknown)).toBe(false); // resourceType desconhecido → deny-by-default
    expect((await contar()).naoLidas).toBe(1); // só o nNull
  });

  it('conceder VIEWER no Pipe torna Card/Tarefa/Solicitação visíveis (fase vermelha →)', async () => {
    const g = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'VIEWER',
    });
    expect(g.status).toBe(201);
    const grantId = ((await g.json()) as Ident).id;

    const vis = await idsVisiveis();
    expect(vis.has(nCard)).toBe(true);
    expect(vis.has(nTask)).toBe(true);
    expect(vis.has(nSolic)).toBe(true);
    expect(vis.has(nRecord)).toBe(false); // ainda sem acesso ao Database
    expect((await contar()).naoLidas).toBe(4); // nNull + card/task/solic

    // Revogar oculta de novo (fase vermelha ←).
    expect((await req('DELETE', `/pipes/${pipeId}/grants/${grantId}`, ANA)).status).toBe(200);
    const vis2 = await idsVisiveis();
    expect(vis2.has(nCard)).toBe(false);
    expect(vis2.has(nTask)).toBe(false);
    expect(vis2.has(nSolic)).toBe(false);
    expect((await contar()).naoLidas).toBe(1);
  });

  it('conceder VIEWER no Database torna o Registro visível', async () => {
    const g = await req('POST', `/databases/${databaseId}/grants`, ANA, {
      membershipId: MEMBERSHIP_BRUNO_A,
      role: 'VIEWER',
    });
    expect(g.status).toBe(201);
    const vis = await idsVisiveis();
    expect(vis.has(nRecord)).toBe(true);
    expect((await contar()).naoLidas).toBe(2); // nNull + nRecord (pipe revogado no teste anterior)
  });
});

describe('AC1/AC2 — superfícies coerentes, contagem no servidor, marcar lida', () => {
  it('popover ⊆ página; ambos da mesma fonte', async () => {
    const pop = (await (
      await req('GET', '/notifications/recentes', BRUNO)
    ).json()) as NotificacaoVisao[];
    const vis = await idsVisiveis();
    for (const n of pop) expect(vis.has(n.id)).toBe(true);
  });

  it('marcar como lida é idempotente e reduz a contagem; marcar alheio → 404', async () => {
    const antes = (await contar()).naoLidas;
    const r1 = await req('POST', `/notifications/${nRecord}/read`, BRUNO);
    expect(r1.status).toBe(200);
    const b1 = (await r1.json()) as { recipient: { lida: boolean }; naoLidas: number };
    expect(b1.recipient.lida).toBe(true);
    expect(b1.naoLidas).toBe(antes - 1);

    // Idempotente.
    const r2 = await req('POST', `/notifications/${nRecord}/read`, BRUNO);
    expect(r2.status).toBe(200);
    expect(((await r2.json()) as { naoLidas: number }).naoLidas).toBe(antes - 1);

    // Notificação sem recipient de BRUNO → 404 não-enumerante.
    const alheio = await req('POST', `/notifications/${randomUUID()}/read`, BRUNO);
    expect(alheio.status).toBe(404);
  });

  it('marcar todas como lidas zera a contagem (idempotente)', async () => {
    const r = await req('POST', '/notifications/read-all', BRUNO);
    expect(r.status).toBe(200);
    expect((await contar()).naoLidas).toBe(0); // vazio útil, não falha
    const r2 = await req('POST', '/notifications/read-all', BRUNO);
    expect(((await r2.json()) as { marcadas: number }).marcadas).toBe(0);
  });
});

describe('AC4 — preferência por tipo silencia nas superfícies e na contagem', () => {
  it('silenciar um tipo o remove de página/contagem; reabilitar o traz de volta', async () => {
    // nNull (tipo SYSTEM_NOTICE) está lido agora; use-o via reabilitação: primeiro re-conte com um novo item.
    const nNovo = await semear('AVISO_X', 'SYSTEM', null); // acessível (recurso nulo), não-lido
    expect((await idsVisiveis()).has(nNovo)).toBe(true);
    expect((await contar()).naoLidas).toBeGreaterThanOrEqual(1);

    // Silenciar AVISO_X.
    const set = await req('PUT', '/notifications/preferences/AVISO_X', BRUNO, { enabled: false });
    expect(set.status).toBe(200);
    expect((await idsVisiveis()).has(nNovo)).toBe(false); // sumiu da página
    const contagemSilenciada = (await contar()).naoLidas;

    // Reabilitar.
    expect(
      (await req('PUT', '/notifications/preferences/AVISO_X', BRUNO, { enabled: true })).status,
    ).toBe(200);
    expect((await idsVisiveis()).has(nNovo)).toBe(true); // voltou (histórico não foi apagado)
    expect((await contar()).naoLidas).toBe(contagemSilenciada + 1);
  });

  it('ler preferências devolve o override do usuário', async () => {
    await req('PUT', '/notifications/preferences/PREF_Y', BRUNO, { enabled: false });
    const res = await req('GET', '/notifications/preferences', BRUNO);
    expect(res.status).toBe(200);
    const prefs = (await res.json()) as { type: string; enabled: boolean }[];
    const y = prefs.find((p) => p.type === 'PREF_Y');
    expect(y?.enabled).toBe(false);
  });
});
