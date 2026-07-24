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
 * Solicitações (Story 5.2) pela porta da frente: HTTP real, banco real. Twin de `tasks-http` SEM eixo
 * temporal. Prova criação/edição/ciclo de vida (resolver/reabrir/arquivar/restaurar)/Responsável (0..1
 * opcional)/vínculo, a autorização por OPERAR o Pipe (Admin/Membro/Viewer/sem-acesso → 404/403), o bloqueio
 * de escrita sob arquivamento e a projeção sem `orgId`.
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
interface SolicitacaoView {
  id: string;
  pipeId: string;
  cardId: string | null;
  title: string;
  responsavelMembershipId: string | null;
  lifecycleState: string;
  archiveState: string;
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

/** Concede um papel de Pipe a Bruno; devolve o grantId. */
async function conceder(pipeId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER'): Promise<string> {
  const res = await req('POST', `/pipes/${pipeId}/grants`, ANA, {
    membershipId: MEMBERSHIP_BRUNO_A,
    role,
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as Ident).id;
}

async function alterarPapel(
  pipeId: string,
  grantId: string,
  role: 'MEMBER' | 'VIEWER',
): Promise<void> {
  expect((await req('PATCH', `/pipes/${pipeId}/grants/${grantId}`, ANA, { role })).status).toBe(
    200,
  );
}

async function tiposHistorico(solicitacaoId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const evs = await db.solicitacaoHistory.findMany({
    where: { solicitacaoId },
    orderBy: { createdAt: 'asc' },
    select: { type: true },
  });
  return evs.map((e) => e.type);
}

/** Story 5.7 — Eventos canônicos (`DomainEvent`, outbox do motor) emitidos para uma Solicitação. */
async function eventosDominio(solicitacaoId: string): Promise<string[]> {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const evs = await db.domainEvent.findMany({
    where: { resourceType: 'REQUEST', resourceId: solicitacaoId },
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
    await db.solicitacao.deleteMany({ where: { pipeId: { in: pipesCriados } } });
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } });
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('Eventos de domínio no outbox (Story 5.7 — same-tx, gatilhos de Automação)', () => {
  it('emite REQUEST_CREATED na abertura e o Evento de cada transição/Responsável', async () => {
    const pipeId = await criarPipe('5.7 eventos req');
    const s = (await (
      await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, { title: 'S' })
    ).json()) as SolicitacaoView;
    expect(await eventosDominio(s.id)).toEqual(['REQUEST_CREATED']);

    expect(
      (
        await req('PUT', `/solicitacoes/${s.id}/responsavel`, ANA, {
          responsavelMembershipId: MEMBERSHIP_BRUNO_A,
        })
      ).status,
    ).toBe(200);
    await req('POST', `/solicitacoes/${s.id}/resolve`, ANA);
    await req('POST', `/solicitacoes/${s.id}/reopen`, ANA);
    await req('POST', `/solicitacoes/${s.id}/archive`, ANA);
    await req('POST', `/solicitacoes/${s.id}/restore`, ANA);

    expect(await eventosDominio(s.id)).toEqual([
      'REQUEST_CREATED',
      'REQUEST_RESPONSIBLE_CHANGED',
      'REQUEST_RESOLVED',
      'REQUEST_REOPENED',
      'REQUEST_ARCHIVED',
      'REQUEST_RESTORED',
    ]);
  });
});

describe('abrir (AC1)', () => {
  it('nasce ABERTA/ATIVA, pertence ao Pipe/Org; sem Responsável (0..1); sem `orgId`; evento CREATED', async () => {
    const pipeId = await criarPipe('5.2 abrir');
    const res = await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, {
      title: 'Preciso de acesso',
    });
    expect(res.status).toBe(201);
    const s = (await res.json()) as SolicitacaoView;
    expect(s.lifecycleState).toBe('ABERTA');
    expect(s.archiveState).toBe('ATIVA');
    expect(s.pipeId).toBe(pipeId);
    expect(s.responsavelMembershipId).toBeNull(); // Responsável opcional (decisão 0..1)
    expect(JSON.stringify(s)).not.toContain(ORG_A);
    expect(await tiposHistorico(s.id)).toEqual(['CREATED']);
  });

  it('abrir COM Responsável ativo funciona; associar a Card do MESMO Pipe funciona; Card de outro Pipe → 400', async () => {
    const { pipeId, cardId } = await pipeComCard('5.2 abrir-card');
    const outro = await pipeComCard('5.2 abrir-card-outro');
    const ok = await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, {
      title: 'S',
      cardId,
      responsavelMembershipId: MEMBERSHIP_BRUNO_A,
    });
    expect(ok.status).toBe(201);
    const s = (await ok.json()) as SolicitacaoView;
    expect(s.cardId).toBe(cardId);
    expect(s.responsavelMembershipId).toBe(MEMBERSHIP_BRUNO_A);

    const ruim = await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, {
      title: 'S',
      cardId: outro.cardId,
    });
    expect(ruim.status).toBe(400);
  });
});

describe('Responsável (AC3 assign)', () => {
  it('atribui Membership ATIVA; conta inexistente rejeitada; remover com null', async () => {
    const pipeId = await criarPipe('5.2 resp');
    const s = (await (
      await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, { title: 'S' })
    ).json()) as SolicitacaoView;

    const ok = await req('PUT', `/solicitacoes/${s.id}/responsavel`, ANA, {
      responsavelMembershipId: MEMBERSHIP_BRUNO_A,
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as SolicitacaoView).responsavelMembershipId).toBe(MEMBERSHIP_BRUNO_A);

    // Membership inexistente → 400 (não aceita referência inválida).
    const ruim = await req('PUT', `/solicitacoes/${s.id}/responsavel`, ANA, {
      responsavelMembershipId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    });
    expect(ruim.status).toBe(400);

    // Remover.
    const rem = await req('PUT', `/solicitacoes/${s.id}/responsavel`, ANA, {
      responsavelMembershipId: null,
    });
    expect(((await rem.json()) as SolicitacaoView).responsavelMembershipId).toBeNull();
    expect(await tiposHistorico(s.id)).toEqual([
      'CREATED',
      'RESPONSAVEL_ASSIGNED',
      'RESPONSAVEL_REMOVED',
    ]);
  });
});

describe('ciclo de vida e arquivamento (AC2)', () => {
  it('resolver/reabrir idempotentes; arquivar bloqueia escrita; restaurar preserva e libera', async () => {
    const pipeId = await criarPipe('5.2 ciclo');
    const s = (await (
      await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, { title: 'S' })
    ).json()) as SolicitacaoView;

    expect((await req('POST', `/solicitacoes/${s.id}/resolve`, ANA)).status).toBe(200);
    expect((await req('POST', `/solicitacoes/${s.id}/resolve`, ANA)).status).toBe(200); // idempotente

    // Arquivar (eixo separado — preserva RESOLVIDA).
    const arq = (await (
      await req('POST', `/solicitacoes/${s.id}/archive`, ANA)
    ).json()) as SolicitacaoView;
    expect(arq.archiveState).toBe('ARQUIVADA');
    expect(arq.lifecycleState).toBe('RESOLVIDA');

    // Sob arquivamento: editar/Responsável/reabrir → 409 SOLICITACAO_ARQUIVADA; leitura preservada.
    expect((await req('PATCH', `/solicitacoes/${s.id}`, ANA, { title: 'novo' })).status).toBe(409);
    expect((await req('POST', `/solicitacoes/${s.id}/reopen`, ANA)).status).toBe(409);
    expect((await req('GET', `/solicitacoes/${s.id}`, ANA)).status).toBe(200);

    // Restaurar preserva o estado operacional (RESOLVIDA), depois libera a escrita.
    const rest = (await (
      await req('POST', `/solicitacoes/${s.id}/restore`, ANA)
    ).json()) as SolicitacaoView;
    expect(rest.archiveState).toBe('ATIVA');
    expect(rest.lifecycleState).toBe('RESOLVIDA');
    expect((await req('POST', `/solicitacoes/${s.id}/reopen`, ANA)).status).toBe(200);
  });
});

describe('autorização: mutar exige OPERAR o Pipe; ler exige acesso (AC4)', () => {
  it('sem acesso → 404; Viewer → 403 ao mutar mas 200 ao ler; Membro do Pipe opera', async () => {
    const pipeId = await criarPipe('5.2 authz');
    const s = (await (
      await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, { title: 'S' })
    ).json()) as SolicitacaoView;

    // Bruno sem papel no Pipe → 404 não-enumerante (criar e ler).
    expect((await req('POST', `/pipes/${pipeId}/solicitacoes`, BRUNO, { title: 'x' })).status).toBe(
      404,
    );
    expect((await req('GET', `/solicitacoes/${s.id}`, BRUNO)).status).toBe(404);

    // Viewer concedido: lê (200) mas não muta (403).
    const grantId = await conceder(pipeId, 'VIEWER');
    expect((await req('GET', `/solicitacoes/${s.id}`, BRUNO)).status).toBe(200);
    expect((await req('POST', `/solicitacoes/${s.id}/resolve`, BRUNO)).status).toBe(403);
    expect((await req('POST', `/pipes/${pipeId}/solicitacoes`, BRUNO, { title: 'x' })).status).toBe(
      403,
    );

    // Elevar Bruno a MEMBER do Pipe → opera.
    await alterarPapel(pipeId, grantId, 'MEMBER');
    expect((await req('POST', `/solicitacoes/${s.id}/resolve`, BRUNO)).status).toBe(200);
  });

  it('cross-tenant: Carla (Org B) não enxerga a Solicitação da Org A → 404', async () => {
    const pipeId = await criarPipe('5.2 cross');
    const s = (await (
      await req('POST', `/pipes/${pipeId}/solicitacoes`, ANA, { title: 'S' })
    ).json()) as SolicitacaoView;
    expect((await req('GET', `/solicitacoes/${s.id}`, CARLA)).status).toBe(404);
    expect((await req('POST', `/solicitacoes/${s.id}/resolve`, CARLA)).status).toBe(404);
  });

  it('solicitacaoId não-UUID → 400', async () => {
    expect((await req('GET', '/solicitacoes/lixo', ANA)).status).toBe(400);
  });
});
