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
 * Trilha de Execuções (Story 4.8) pela porta da frente: HTTP real, `AppModule` de produção, PostgreSQL real.
 * Prova §1445–1448: conjunto mínimo + estados distintos; **sanitização** (asserção NEGATIVA — nada proibido no
 * JSON); **acesso por papel** (Admin da Org / Admin do Pipe / Membro / Membro restrito / Somente-leitura /
 * Convidado / sem-acesso); **404 não-enumerante**; **isolamento cross-tenant** (RLS); **filtros** (período/
 * estado/Evento) fail-closed + paginação por cursor determinístico. Postgres fora ⇒ suíte VERMELHA.
 *
 * Escreve tudo na **Org C** com contas descartáveis (`randomUUID`) — nunca reusa Ana/Bruno/Carla num
 * `membership.create` persistente (TEST-ISO-01). Ana (seed, ADMIN Org A) é usada SÓ como principal cross-tenant.
 */

const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN da Org A (seed) — só para o teste cross-tenant
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;

// Identidades das fixtures.
const pipeId = randomUUID();
const automationId = randomUUID();
const cardR = randomUUID(); // Card que o Membro restrito acessa (Responsável)
const cardX = randomUUID(); // Card que o restrito NÃO acessa
const recordAlheio = randomUUID(); // alvo cross-domínio (não é Card do Pipe)

// Contas por papel.
const contas = {
  adminOrg: randomUUID(),
  adminPipe: randomUUID(),
  membro: randomUUID(),
  restrito: randomUUID(),
  viewer: randomUUID(),
  convidado: randomUUID(),
  semAcesso: randomUUID(),
};
const membershipIds: string[] = [];
const grantIds: string[] = [];
const eventIds: string[] = [];
const execIds: string[] = [];

interface ExecView {
  executionId: string;
  automation: { id: string; name: string | null; versao: number; revision: string };
  evento: {
    eventId: string;
    tipo: string | null;
    origem: string | null;
    recursoPrincipal: { tipo: string; id: string } | null;
  };
  state: string;
  avaliacaoCondicoes: string;
  executionChainId: string | null;
  chainDepth: number;
  lastErrorCode: string | null;
  motivoLegivel: string | null;
}
interface Pagina {
  execucoes: ExecView[];
  proximoCursor: string | null;
}
interface Detalhe extends ExecView {
  acoes: {
    actionIndex: number;
    actionType: string;
    state: string;
    errorCode: string | null;
    motivoLegivel: string | null;
    targetResourceId: string | null;
    referenciaRestrita: boolean;
  }[];
  cadeia: {
    executionChainId: string | null;
    chainDepth: number;
    interrompidaPorLimite: boolean;
    motivoLegivel: string | null;
  };
}

async function req(method: string, path: string, conta?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  return fetch(`${baseUrl}${path}`, { method, headers });
}

const BASE = new Date('2026-07-20T10:00:00.000Z').getTime();

async function criarConta(id: string, role: 'ADMIN' | 'MEMBER' | 'GUEST'): Promise<void> {
  await migrator.account.create({
    data: { id, email: `trilha-4-8-${id}@exemplo.test`, name: `Trilha ${role}` },
  });
  const mId = randomUUID();
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.membership.create({
    data: { id: mId, orgId: ORG_C, accountId: id, role, state: 'ACTIVE' },
  });
  membershipIds.push(mId);
}

async function concederPipe(
  accountId: string,
  role: 'ADMIN' | 'MEMBER' | 'VIEWER',
  restritoAoProprio = false,
): Promise<string> {
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  const membership = await dbC.membership.findFirst({ where: { accountId }, select: { id: true } });
  const gId = randomUUID();
  await dbC.pipeGrant.create({
    data: {
      id: gId,
      orgId: ORG_C,
      pipeId,
      membershipId: membership!.id,
      role,
      state: 'ACTIVE',
      restritoAoProprio,
    },
  });
  grantIds.push(gId);
  return membership!.id;
}

async function criarEvento(resourceId: string, eventType: string, origin: string): Promise<string> {
  const eventId = randomUUID();
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.domainEvent.create({
    data: {
      orgId: ORG_C,
      eventId,
      eventType,
      pipeId,
      resourceType: 'CARD',
      resourceId,
      origin,
      correlationId: randomUUID(),
    },
  });
  eventIds.push(eventId);
  return eventId;
}

async function criarExecucao(opts: {
  eventId: string;
  state: string;
  ordem: number;
  lastErrorCode?: string;
  executionChainId?: string;
  chainDepth?: number;
  initiatorType?: string;
  startedAt?: Date;
  finishedAt?: Date;
}): Promise<string> {
  const id = randomUUID();
  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  // Blindagem contra o DRAIN do motor (org-scoped, não pipe-scoped) de testes concorrentes que escrevem na
  // mesma Org C: um `PENDING` com `nextAttemptAt` no futuro NÃO é reivindicável; um `RUNNING` com
  // `leaseExpiresAt` no futuro idem. Sem isso, um `drenarOrg` concorrente processaria estas linhas e mudaria o
  // estado — a flakiness paralela que o CI serial (`--no-file-parallelism`) evita. Aqui mantemos o teste robusto
  // mesmo em paralelo, sem depender de ordem de execução.
  const futuro = new Date('2999-01-01T00:00:00.000Z');
  await dbC.automationExecution.create({
    data: {
      id,
      orgId: ORG_C,
      eventId: opts.eventId,
      automationId,
      automationVersionId: 1,
      configSnapshotRevision: 'rev-1',
      pipeId,
      state: opts.state as never,
      attempt: 1,
      initiatorType: opts.initiatorType ?? 'HUMANO',
      initiatorAccountId:
        opts.initiatorType === 'HUMANO' || !opts.initiatorType ? contas.membro : null,
      correlationId: randomUUID(),
      executionChainId: opts.executionChainId ?? opts.eventId,
      chainDepth: opts.chainDepth ?? 0,
      createdAt: new Date(BASE + opts.ordem * 1000),
      ...(opts.state === 'PENDING' ? { nextAttemptAt: futuro } : {}),
      ...(opts.state === 'RUNNING' ? { leaseOwner: randomUUID(), leaseExpiresAt: futuro } : {}),
      ...(opts.startedAt ? { startedAt: opts.startedAt } : {}),
      ...(opts.finishedAt ? { finishedAt: opts.finishedAt } : {}),
      ...(opts.lastErrorCode ? { lastErrorCode: opts.lastErrorCode } : {}),
    },
  });
  execIds.push(id);
  return id;
}

// IDs das Execuções em cada estado, para as asserções.
const E: {
  SUCCEEDED: string;
  PENDING: string;
  RUNNING: string;
  PARTIAL: string;
  FAILED: string;
  SKIPPED: string;
  BLOCKED: string;
  HALTED: string;
} = {
  SUCCEEDED: '',
  PENDING: '',
  RUNNING: '',
  PARTIAL: '',
  FAILED: '',
  SKIPPED: '',
  BLOCKED: '',
  HALTED: '',
};

beforeAll(async () => {
  if (!databaseUrl) throw new Error('DATABASE_URL ausente: a Trilha exige PostgreSQL real.');
  if (!migratorUrl)
    throw new Error('MIGRATION_DATABASE_URL ausente: setup/faxina exige o migrator.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
  await dbC.pipe.create({
    data: { id: pipeId, orgId: ORG_C, name: `pipe-trilha-${pipeId.slice(0, 8)}` },
  });
  await dbC.automation.create({
    data: {
      id: automationId,
      orgId: ORG_C,
      pipeId,
      name: 'Automação Trilha',
      quando: { tipo: 'CARD_CREATED' },
      entao: [{ tipo: 'CARD_FINALIZE', parametros: {} }],
    },
  });
  // Cards mínimos (Fase/Form/FormVersion exigidos pelas colunas NOT NULL de Card).
  const phaseId = randomUUID();
  const formId = randomUUID();
  const formVersionId = randomUUID();
  await dbC.phase.create({
    data: { id: phaseId, orgId: ORG_C, pipeId, name: 'A Fazer', position: '1' },
  });
  await dbC.form.create({ data: { id: formId, orgId: ORG_C, context: 'PIPE_INITIAL', pipeId } });
  await dbC.formVersion.create({
    data: {
      id: formVersionId,
      orgId: ORG_C,
      formId,
      version: 1,
      snapshot: { formId, fields: [] },
      revision: 'r1',
    },
  });
  for (const [cid, key] of [
    [cardR, 'card-r'],
    [cardX, 'card-x'],
  ] as const) {
    await dbC.card.create({
      data: {
        id: cid,
        orgId: ORG_C,
        pipeId,
        phaseId,
        formId,
        formVersionId,
        idempotencyKey: key,
        valores: {},
      },
    });
  }

  // Contas + concessões.
  await criarConta(contas.adminOrg, 'ADMIN');
  await criarConta(contas.adminPipe, 'MEMBER');
  await criarConta(contas.membro, 'MEMBER');
  await criarConta(contas.restrito, 'MEMBER');
  await criarConta(contas.viewer, 'MEMBER');
  await criarConta(contas.convidado, 'GUEST');
  await criarConta(contas.semAcesso, 'MEMBER');

  await concederPipe(contas.adminPipe, 'ADMIN');
  await concederPipe(contas.membro, 'MEMBER');
  const membershipRestrito = await concederPipe(contas.restrito, 'MEMBER', true);
  await concederPipe(contas.viewer, 'VIEWER');
  await concederPipe(contas.convidado, 'MEMBER'); // GUEST com grant MEMBER — o teto rebaixa a `ler`

  // O restrito é Responsável ATIVO só de cardR.
  await dbC.cardResponsavel.create({
    data: { id: randomUUID(), orgId: ORG_C, cardId: cardR, membershipId: membershipRestrito },
  });

  // Eventos: 3 sobre cardR (CARD_CREATED), 5 sobre cardX (CARD_MOVED). Um eventId por Execução (dedup lógica).
  const evR = [
    await criarEvento(cardR, 'CARD_CREATED', 'SUBMISSION'),
    await criarEvento(cardR, 'CARD_CREATED', 'SUBMISSION'),
    await criarEvento(cardR, 'CARD_CREATED', 'SUBMISSION'),
  ];
  const evX = [
    await criarEvento(cardX, 'CARD_MOVED', 'MOVE'),
    await criarEvento(cardX, 'CARD_MOVED', 'MOVE'),
    await criarEvento(cardX, 'CARD_MOVED', 'MOVE'),
    await criarEvento(cardX, 'CARD_MOVED', 'MOVE'),
    await criarEvento(cardX, 'CARD_MOVED', 'MOVE'),
  ];

  // Execuções: os 8 estados distintos (UX-DR6). Principal em cardR (visível ao restrito) ou cardX (não).
  E.SUCCEEDED = await criarExecucao({
    eventId: evR[0]!,
    state: 'SUCCEEDED',
    ordem: 0,
    startedAt: new Date(BASE),
    finishedAt: new Date(BASE + 2500),
  });
  E.PENDING = await criarExecucao({
    eventId: evR[1]!,
    state: 'PENDING',
    ordem: 1,
    initiatorType: 'SISTEMA',
  });
  E.RUNNING = await criarExecucao({
    eventId: evR[2]!,
    state: 'RUNNING',
    ordem: 2,
    startedAt: new Date(BASE),
  });
  E.PARTIAL = await criarExecucao({
    eventId: evX[0]!,
    state: 'PARTIAL',
    ordem: 3,
    lastErrorCode: 'EXECUTOR_ERROR',
  });
  E.FAILED = await criarExecucao({
    eventId: evX[1]!,
    state: 'FAILED',
    ordem: 4,
    lastErrorCode: 'EXECUTOR_ERROR',
  });
  E.SKIPPED = await criarExecucao({
    eventId: evX[2]!,
    state: 'SKIPPED_CONDITIONS',
    ordem: 5,
    lastErrorCode: 'CONDITION_NOT_MET',
  });
  E.BLOCKED = await criarExecucao({ eventId: evX[3]!, state: 'BLOCKED_CONFIRMATION', ordem: 6 });
  E.HALTED = await criarExecucao({
    eventId: evX[4]!,
    state: 'HALTED_BY_LIMIT',
    ordem: 7,
    lastErrorCode: 'DEPTH_EXCEEDED',
    executionChainId: randomUUID(),
    chainDepth: 5,
  });

  // Resultados de Ação da Execução SUCCEEDED: alvo acessível (cardR), alvo in-Pipe inacessível ao restrito
  // (cardX) e alvo cross-domínio (recordAlheio — mascarado para todo Membro).
  await dbC.automationActionResult.createMany({
    data: [
      {
        orgId: ORG_C,
        executionId: E.SUCCEEDED,
        actionIndex: 0,
        actionType: 'CARD_FINALIZE',
        state: 'SUCCEEDED',
        targetResourceId: cardR,
      },
      {
        orgId: ORG_C,
        executionId: E.SUCCEEDED,
        actionIndex: 1,
        actionType: 'CARD_MOVE',
        state: 'SUCCEEDED',
        targetResourceId: cardX,
      },
      {
        orgId: ORG_C,
        executionId: E.SUCCEEDED,
        actionIndex: 2,
        actionType: 'RECORD_CREATE_RELATED',
        state: 'SUCCEEDED',
        targetResourceId: recordAlheio,
      },
    ],
  });

  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (migrator) {
    const dbC = withTenantContext(migrator, { orgId: ORG_C }, semLog);
    for (const id of execIds)
      await dbC.automationActionResult.deleteMany({ where: { executionId: id } });
    await dbC.automationExecution.deleteMany({ where: { id: { in: execIds } } });
    await dbC.automation.deleteMany({ where: { id: automationId } });
    for (const id of eventIds) await dbC.domainEvent.deleteMany({ where: { eventId: id } });
    await dbC.cardResponsavel.deleteMany({ where: { cardId: { in: [cardR, cardX] } } });
    for (const id of grantIds) await dbC.pipeGrant.deleteMany({ where: { id } });
    await dbC.card.deleteMany({ where: { id: { in: [cardR, cardX] } } });
    await dbC.formVersion.deleteMany({ where: { form: { pipeId } } });
    await dbC.form.deleteMany({ where: { pipeId } });
    await dbC.phase.deleteMany({ where: { pipeId } });
    for (const id of membershipIds) await dbC.membership.deleteMany({ where: { id } });
    await dbC.pipe.deleteMany({ where: { id: pipeId } });
    await migrator.account.deleteMany({ where: { id: { in: Object.values(contas) } } });
    await migrator.$disconnect();
  }
  await app?.close();
});

describe('AC1 — conjunto mínimo, versão, cadeia e estados distintos', () => {
  it('lista as 8 Execuções para o Admin da Org, cada estado com avaliação de Condições distinta', async () => {
    const res = await req(
      'GET',
      `/pipes/${pipeId}/automation-executions?limite=100`,
      contas.adminOrg,
    );
    expect(res.status).toBe(200);
    const { execucoes } = (await res.json()) as Pagina;
    expect(execucoes).toHaveLength(8);
    const porId = new Map(execucoes.map((e) => [e.executionId, e]));
    expect(porId.get(E.SUCCEEDED)!.avaliacaoCondicoes).toBe('SATISFEITA');
    expect(porId.get(E.SKIPPED)!.avaliacaoCondicoes).toBe('NAO_SATISFEITA');
    expect(porId.get(E.PENDING)!.avaliacaoCondicoes).toBe('PENDENTE');
    expect(porId.get(E.HALTED)!.avaliacaoCondicoes).toBe('NAO_AVALIADA');
    // versão utilizada + motivo legível + estado honesto.
    expect(porId.get(E.SUCCEEDED)!.automation).toMatchObject({
      name: 'Automação Trilha',
      versao: 1,
      revision: 'rev-1',
    });
    expect(porId.get(E.HALTED)!.motivoLegivel).toBe(
      'Limite de profundidade de encadeamento atingido',
    );
    expect(porId.get(E.HALTED)!.chainDepth).toBe(5);
    expect(porId.get(E.FAILED)!.state).toBe('FAILED');
  });

  it('o detalhe traz as Ações na ordem configurada, com estado e motivo legível', async () => {
    const res = await req(
      'GET',
      `/pipes/${pipeId}/automation-executions/${E.SUCCEEDED}`,
      contas.adminOrg,
    );
    expect(res.status).toBe(200);
    const d = (await res.json()) as Detalhe;
    expect(d.acoes.map((a) => a.actionIndex)).toEqual([0, 1, 2]);
    expect(d.acoes[0]).toMatchObject({
      actionType: 'CARD_FINALIZE',
      state: 'SUCCEEDED',
      targetResourceId: cardR,
    });
    expect(d.cadeia.executionChainId).toBeTruthy();
  });

  it('a cadeia interrompida expõe a causa (HALTED_BY_LIMIT + código)', async () => {
    const res = await req(
      'GET',
      `/pipes/${pipeId}/automation-executions/${E.HALTED}`,
      contas.adminOrg,
    );
    const d = (await res.json()) as Detalhe;
    expect(d.cadeia.interrompidaPorLimite).toBe(true);
    expect(d.cadeia.motivoLegivel).toBe('Limite de profundidade de encadeamento atingido');
  });
});

describe('AC2 — sanitização (asserção negativa)', () => {
  it('nenhum campo interno/segredo/payload vaza no JSON (lista e detalhe)', async () => {
    const lista = await (
      await req('GET', `/pipes/${pipeId}/automation-executions?limite=100`, contas.adminOrg)
    ).text();
    const detalhe = await (
      await req('GET', `/pipes/${pipeId}/automation-executions/${E.SUCCEEDED}`, contas.adminOrg)
    ).text();
    for (const proibido of [
      'orgId',
      'leaseOwner',
      'leaseExpiresAt',
      'nextAttemptAt',
      'configSnapshot',
      'snapshot',
      'payload',
      'valores',
      'bucketKey',
      'password',
      'token',
      'secret',
    ]) {
      expect(lista.includes(proibido), `lista não deve conter "${proibido}"`).toBe(false);
      expect(detalhe.includes(proibido), `detalhe não deve conter "${proibido}"`).toBe(false);
    }
  });
});

describe('AC3 — acesso por papel, mascaramento e não-enumeração', () => {
  it('Admin do Pipe vê TODAS (8)', async () => {
    const { execucoes } = (await (
      await req('GET', `/pipes/${pipeId}/automation-executions?limite=100`, contas.adminPipe)
    ).json()) as Pagina;
    expect(execucoes).toHaveLength(8);
  });

  it('Membro NÃO restrito vê TODAS (8)', async () => {
    const { execucoes } = (await (
      await req('GET', `/pipes/${pipeId}/automation-executions?limite=100`, contas.membro)
    ).json()) as Pagina;
    expect(execucoes).toHaveLength(8);
  });

  it('Membro restrito vê SÓ as Execuções dos recursos que acessa (as 3 de cardR)', async () => {
    const res = await req(
      'GET',
      `/pipes/${pipeId}/automation-executions?limite=100`,
      contas.restrito,
    );
    expect(res.status).toBe(200);
    const { execucoes } = (await res.json()) as Pagina;
    const ids = new Set(execucoes.map((e) => e.executionId));
    expect(ids).toEqual(new Set([E.SUCCEEDED, E.PENDING, E.RUNNING]));
    // as de cardX não aparecem
    expect(ids.has(E.FAILED)).toBe(false);
  });

  it('Somente-leitura (Viewer) → 403', async () => {
    expect((await req('GET', `/pipes/${pipeId}/automation-executions`, contas.viewer)).status).toBe(
      403,
    );
  });

  it('Convidado não acessa → 403', async () => {
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions`, contas.convidado)).status,
    ).toBe(403);
  });

  it('Membership sem concessão → 404 não-enumerante', async () => {
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions`, contas.semAcesso)).status,
    ).toBe(404);
  });

  it('cross-tenant: principal de outra Org (Ana/Org A) → 404 (RLS não revela o Pipe)', async () => {
    expect((await req('GET', `/pipes/${pipeId}/automation-executions`, ANA)).status).toBe(404);
  });

  it('restrito no detalhe: Execução de recurso inacessível → 404 não-enumerante', async () => {
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions/${E.FAILED}`, contas.restrito))
        .status,
    ).toBe(404);
  });

  it('mascaramento: no detalhe visível ao restrito, alvos inacessíveis viram referência restrita', async () => {
    const d = (await (
      await req('GET', `/pipes/${pipeId}/automation-executions/${E.SUCCEEDED}`, contas.restrito)
    ).json()) as Detalhe;
    const porIndice = new Map(d.acoes.map((a) => [a.actionIndex, a]));
    expect(porIndice.get(0)).toMatchObject({ targetResourceId: cardR, referenciaRestrita: false }); // acessível
    expect(porIndice.get(1)).toMatchObject({ targetResourceId: null, referenciaRestrita: true }); // cardX in-Pipe, inacessível
    expect(porIndice.get(2)).toMatchObject({ targetResourceId: null, referenciaRestrita: true }); // cross-domínio
  });

  it('mascaramento: Membro não restrito vê alvos in-Pipe crus, mas cross-domínio mascarado', async () => {
    const d = (await (
      await req('GET', `/pipes/${pipeId}/automation-executions/${E.SUCCEEDED}`, contas.membro)
    ).json()) as Detalhe;
    const porIndice = new Map(d.acoes.map((a) => [a.actionIndex, a]));
    expect(porIndice.get(0)!.targetResourceId).toBe(cardR); // in-Pipe acessível
    expect(porIndice.get(1)!.targetResourceId).toBe(cardX); // in-Pipe acessível (não restrito)
    expect(porIndice.get(2)).toMatchObject({ targetResourceId: null, referenciaRestrita: true }); // cross-domínio
  });

  it('gerenciar (Admin da Org) vê todos os alvos crus', async () => {
    const d = (await (
      await req('GET', `/pipes/${pipeId}/automation-executions/${E.SUCCEEDED}`, contas.adminOrg)
    ).json()) as Detalhe;
    expect(d.acoes.every((a) => a.targetResourceId !== null && !a.referenciaRestrita)).toBe(true);
  });
});

describe('AC4 — filtros (fail-closed) e paginação por cursor', () => {
  it('filtro por estado', async () => {
    const { execucoes } = (await (
      await req(
        'GET',
        `/pipes/${pipeId}/automation-executions?estado=FAILED&limite=100`,
        contas.adminOrg,
      )
    ).json()) as Pagina;
    expect(execucoes.map((e) => e.executionId)).toEqual([E.FAILED]);
  });

  it('filtro por Evento (eventType)', async () => {
    const criados = (await (
      await req(
        'GET',
        `/pipes/${pipeId}/automation-executions?eventType=CARD_CREATED&limite=100`,
        contas.adminOrg,
      )
    ).json()) as Pagina;
    expect(new Set(criados.execucoes.map((e) => e.executionId))).toEqual(
      new Set([E.SUCCEEDED, E.PENDING, E.RUNNING]),
    );
    const movidos = (await (
      await req(
        'GET',
        `/pipes/${pipeId}/automation-executions?eventType=CARD_MOVED&limite=100`,
        contas.adminOrg,
      )
    ).json()) as Pagina;
    expect(movidos.execucoes).toHaveLength(5);
  });

  it('filtro por período (createdAt)', async () => {
    const de = new Date(BASE + 3000).toISOString(); // a partir da 4ª Execução
    const { execucoes } = (await (
      await req(
        'GET',
        `/pipes/${pipeId}/automation-executions?de=${encodeURIComponent(de)}&limite=100`,
        contas.adminOrg,
      )
    ).json()) as Pagina;
    expect(execucoes).toHaveLength(5); // ordens 3..7
  });

  it('allowlist fail-closed → 400 (estado/eventType/data inválidos, de>ate)', async () => {
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions?estado=INVENTADO`, contas.adminOrg))
        .status,
    ).toBe(400);
    expect(
      (
        await req(
          'GET',
          `/pipes/${pipeId}/automation-executions?eventType=card_created`,
          contas.adminOrg,
        )
      ).status,
    ).toBe(400);
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions?de=nao-e-data`, contas.adminOrg))
        .status,
    ).toBe(400);
    const de = new Date(BASE + 5000).toISOString();
    const ate = new Date(BASE).toISOString();
    expect(
      (
        await req(
          'GET',
          `/pipes/${pipeId}/automation-executions?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`,
          contas.adminOrg,
        )
      ).status,
    ).toBe(400);
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions?cursor=nao-uuid`, contas.adminOrg))
        .status,
    ).toBe(400);
    expect(
      (await req('GET', `/pipes/${pipeId}/automation-executions?limite=0`, contas.adminOrg)).status,
    ).toBe(400);
  });

  it('paginação por cursor determinístico [createdAt, id] percorre todas sem repetir', async () => {
    const vistos: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i++) {
      const url: string = `/pipes/${pipeId}/automation-executions?limite=3${cursor ? `&cursor=${cursor}` : ''}`;
      const pag = (await (await req('GET', url, contas.adminOrg)).json()) as Pagina;
      vistos.push(...pag.execucoes.map((e) => e.executionId));
      cursor = pag.proximoCursor;
      if (!cursor) break;
    }
    expect(vistos).toHaveLength(8);
    expect(new Set(vistos).size).toBe(8); // sem repetição
    // ordem estável por createdAt: SUCCEEDED (ordem 0) antes de HALTED (ordem 7)
    expect(vistos.indexOf(E.SUCCEEDED)).toBeLessThan(vistos.indexOf(E.HALTED));
  });
});
