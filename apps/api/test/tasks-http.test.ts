import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
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
 * Tarefas (Story 5.1) pela porta da frente: HTTP real, banco real. Prova criação/edição/ciclo de vida/
 * Responsável/vínculo, o estado `atrasada` DERIVADO, a autorização por OPERAR o Pipe (Admin/Membro/Viewer/
 * sem-acesso → 404/403), o bloqueio de escrita sob arquivamento e a projeção sem `orgId`.
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A (única Org ativa)
const CARLA = '33333333-3333-3333-3333-333333333333'; // ADMIN na Org B (cross-tenant)
const MEMBERSHIP_BRUNO_A = 'a1a1a1a1-0000-0000-0000-000000000002';
const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

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
interface TarefaView {
  id: string;
  pipeId: string;
  cardId: string | null;
  title: string;
  dueVersion: number;
  responsavelMembershipId: string | null;
  lifecycleState: string;
  archiveState: string;
  atrasada?: boolean;
  responsavelValido?: boolean;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

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

async function criarPipe(nome: string): Promise<string> {
  const res = await req('POST', '/pipes', ANA, { name: nome });
  expect(res.status).toBe(201);
  const pipe = (await res.json()) as Ident;
  pipesCriados.push(pipe.id);
  return pipe.id;
}

/** Pipe com Fase + Campo publicado + um Card (para os testes de vínculo). */
async function pipeComCard(nome: string): Promise<{ pipeId: string; cardId: string }> {
  const pipeId = await criarPipe(nome);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' })).status).toBe(201);
  const campoRes = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  const campo = (await campoRes.json()) as Ident;
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);
  const sub = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: `${nome}-card`,
    valores: { [campo.id]: 'x' },
  });
  return { pipeId, cardId: ((await sub.json()) as Ident).id };
}

/** Concede um papel de Pipe a Bruno; devolve o grantId (para alterar depois). */
async function conceder(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

/** Altera o papel de uma concessão existente (a 2ª concessão ativa colidiria — índice parcial). */
async function alterarPapel(
  pipeId: string,
  grantId: string,
  role: 'MEMBER' | 'VIEWER',
): Promise<void> {
  expect((await req('PATCH', `/pipes/${pipeId}/grants/${grantId}`, ANA, { role })).status).toBe(
    200,
  );
}

async function tiposHistorico(taskId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const evs = await db.taskHistory.findMany({
    where: { taskId },
    orderBy: { createdAt: 'asc' },
    select: { type: true },
  });
  return evs.map((e) => e.type);
}

/** Story 5.7 — Eventos canônicos (`DomainEvent`, outbox do motor de Automação) emitidos para uma Tarefa. */
async function eventosDominio(taskId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const evs = await db.domainEvent.findMany({
    where: { resourceType: 'TASK', resourceId: taskId },
    // Desempate por `createdAt, id`: duas mutações HTTP rápidas podem empatar no ms de `occurredAt`.
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    select: { eventType: true },
  });
  return evs.map((e) => e.eventType);
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente: a faxina exige o migrator.');
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();
}, 30000);

afterAll(async () => {
  if (migrator && pipesCriados.length > 0) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.task.deleteMany({ where: { pipeId: { in: pipesCriados } } });
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('criar (AC1)', () => {
  it('nasce ABERTA/ATIVA, pertence ao Pipe/Org; sem `orgId` na resposta; evento CREATED', async () => {
    const pipeId = await criarPipe('5.1 criar');
    const res = await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'Ligar para o cliente' });
    expect(res.status).toBe(201);
    const t = (await res.json()) as TarefaView;
    expect(t.lifecycleState).toBe('ABERTA');
    expect(t.archiveState).toBe('ATIVA');
    expect(t.pipeId).toBe(pipeId);
    expect(t.dueVersion).toBe(0);
    expect(JSON.stringify(t)).not.toContain(ORG_A);
    expect(await tiposHistorico(t.id)).toEqual(['CREATED']);
  });

  it('associar a Card do MESMO Pipe funciona; Card de outro Pipe → 400', async () => {
    const { pipeId, cardId } = await pipeComCard('5.1 criar-card');
    const outro = await pipeComCard('5.1 criar-card-outro');
    const ok = await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T', cardId });
    expect(ok.status).toBe(201);
    expect(((await ok.json()) as TarefaView).cardId).toBe(cardId);
    const ruim = await req('POST', `/pipes/${pipeId}/tasks`, ANA, {
      title: 'T',
      cardId: outro.cardId,
    });
    expect(ruim.status).toBe(400);
  });
});

describe('Eventos de domínio no outbox (Story 5.7 — same-tx, gatilhos de Automação)', () => {
  it('emite TASK_CREATED na criação e o Evento de cada transição de estado/Responsável', async () => {
    const pipeId = await criarPipe('5.7 eventos');
    const t = (await (
      await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T' })
    ).json()) as TarefaView;
    expect(await eventosDominio(t.id)).toEqual(['TASK_CREATED']);

    const resp = await req('PUT', `/tasks/${t.id}/responsavel`, ANA, {
      responsavelMembershipId: MEMBERSHIP_BRUNO_A,
    });
    expect(resp.status).toBe(200);
    await req('POST', `/tasks/${t.id}/complete`, ANA);
    await req('POST', `/tasks/${t.id}/reopen`, ANA);
    await req('POST', `/tasks/${t.id}/archive`, ANA);
    await req('POST', `/tasks/${t.id}/restore`, ANA);

    expect(await eventosDominio(t.id)).toEqual([
      'TASK_CREATED',
      'TASK_RESPONSIBLE_CHANGED',
      'TASK_COMPLETED',
      'TASK_REOPENED',
      'TASK_ARCHIVED',
      'TASK_RESTORED',
    ]);
  });
});

describe('atrasada DERIVADA (AC2)', () => {
  it('prazo no passado → atrasada; concluir remove; alterar prazo p/ futuro recalcula', async () => {
    const pipeId = await criarPipe('5.1 atrasada');
    const passado = new Date(Date.now() - 3600_000).toISOString();
    const t = (await (
      await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'Vencida', dueAt: passado })
    ).json()) as TarefaView;

    const det = (await (await req('GET', `/tasks/${t.id}`, ANA)).json()) as TarefaView;
    expect(det.atrasada).toBe(true);

    // Concluir → não atrasada.
    expect((await req('POST', `/tasks/${t.id}/complete`, ANA)).status).toBe(200);
    const det2 = (await (await req('GET', `/tasks/${t.id}`, ANA)).json()) as TarefaView;
    expect(det2.atrasada).toBe(false);

    // Reabrir e mover o prazo para o futuro → recalcula (não atrasada) e BUMPA dueVersion.
    expect((await req('POST', `/tasks/${t.id}/reopen`, ANA)).status).toBe(200);
    const futuro = new Date(Date.now() + 3600_000).toISOString();
    const ed = (await (
      await req('PATCH', `/tasks/${t.id}`, ANA, { dueAt: futuro })
    ).json()) as TarefaView;
    expect(ed.dueVersion).toBe(1);
    const det3 = (await (await req('GET', `/tasks/${t.id}`, ANA)).json()) as TarefaView;
    expect(det3.atrasada).toBe(false);
  });
});

describe('Responsável (AC4)', () => {
  it('atribui Membership ATIVA; conta inexistente rejeitada; remover com null', async () => {
    const pipeId = await criarPipe('5.1 resp');
    const t = (await (
      await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T' })
    ).json()) as TarefaView;

    const ok = await req('PUT', `/tasks/${t.id}/responsavel`, ANA, {
      responsavelMembershipId: MEMBERSHIP_BRUNO_A,
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as TarefaView).responsavelMembershipId).toBe(MEMBERSHIP_BRUNO_A);

    // Membership inexistente → 400 (não aceita referência inválida).
    const ruim = await req('PUT', `/tasks/${t.id}/responsavel`, ANA, {
      responsavelMembershipId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    });
    expect(ruim.status).toBe(400);

    // Remover.
    const rem = await req('PUT', `/tasks/${t.id}/responsavel`, ANA, {
      responsavelMembershipId: null,
    });
    expect(((await rem.json()) as TarefaView).responsavelMembershipId).toBeNull();
    expect(await tiposHistorico(t.id)).toEqual([
      'CREATED',
      'RESPONSAVEL_ASSIGNED',
      'RESPONSAVEL_REMOVED',
    ]);
  });
});

describe('ciclo de vida e arquivamento (AC5)', () => {
  it('concluir/reabrir idempotentes; arquivar bloqueia escrita; restaurar libera', async () => {
    const pipeId = await criarPipe('5.1 ciclo');
    const t = (await (
      await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T' })
    ).json()) as TarefaView;

    expect((await req('POST', `/tasks/${t.id}/complete`, ANA)).status).toBe(200);
    expect((await req('POST', `/tasks/${t.id}/complete`, ANA)).status).toBe(200); // idempotente

    // Arquivar (eixo separado — preserva CONCLUIDA).
    const arq = (await (await req('POST', `/tasks/${t.id}/archive`, ANA)).json()) as TarefaView;
    expect(arq.archiveState).toBe('ARQUIVADA');
    expect(arq.lifecycleState).toBe('CONCLUIDA');

    // Sob arquivamento: editar/Responsável/reabrir → 409 TAREFA_ARQUIVADA; leitura preservada.
    expect((await req('PATCH', `/tasks/${t.id}`, ANA, { title: 'novo' })).status).toBe(409);
    expect((await req('POST', `/tasks/${t.id}/reopen`, ANA)).status).toBe(409);
    expect((await req('GET', `/tasks/${t.id}`, ANA)).status).toBe(200);

    // Restaurar preserva o estado operacional (CONCLUIDA), depois libera a escrita.
    const rest = (await (await req('POST', `/tasks/${t.id}/restore`, ANA)).json()) as TarefaView;
    expect(rest.archiveState).toBe('ATIVA');
    expect(rest.lifecycleState).toBe('CONCLUIDA');
    expect((await req('POST', `/tasks/${t.id}/reopen`, ANA)).status).toBe(200);
  });
});

describe('autorização: mutar exige OPERAR o Pipe; ler exige acesso (AC6)', () => {
  it('sem acesso → 404; Viewer → 403 ao mutar mas 200 ao ler; Membro do Pipe opera', async () => {
    const pipeId = await criarPipe('5.1 authz');
    const t = (await (
      await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T' })
    ).json()) as TarefaView;

    // Bruno sem papel no Pipe → 404 não-enumerante (criar e ler).
    expect((await req('POST', `/pipes/${pipeId}/tasks`, BRUNO, { title: 'x' })).status).toBe(404);
    expect((await req('GET', `/tasks/${t.id}`, BRUNO)).status).toBe(404);

    // Viewer concedido: lê (200) mas não muta (403).
    const grantId = await conceder(pipeId, 'VIEWER');
    expect((await req('GET', `/tasks/${t.id}`, BRUNO)).status).toBe(200);
    expect((await req('POST', `/tasks/${t.id}/complete`, BRUNO)).status).toBe(403);
    expect((await req('POST', `/pipes/${pipeId}/tasks`, BRUNO, { title: 'x' })).status).toBe(403);

    // Elevar Bruno a MEMBER do Pipe → opera.
    await alterarPapel(pipeId, grantId, 'MEMBER');
    expect((await req('POST', `/tasks/${t.id}/complete`, BRUNO)).status).toBe(200);
  });

  it('cross-tenant: Carla (Org B) não enxerga a Tarefa da Org A → 404', async () => {
    const pipeId = await criarPipe('5.1 cross');
    const t = (await (
      await req('POST', `/pipes/${pipeId}/tasks`, ANA, { title: 'T' })
    ).json()) as TarefaView;
    expect((await req('GET', `/tasks/${t.id}`, CARLA)).status).toBe(404);
    expect((await req('POST', `/tasks/${t.id}/complete`, CARLA)).status).toBe(404);
  });

  it('taskId não-UUID → 400', async () => {
    expect((await req('GET', '/tasks/lixo', ANA)).status).toBe(400);
  });
});
