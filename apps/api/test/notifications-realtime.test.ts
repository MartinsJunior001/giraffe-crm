import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { Test } from '@nestjs/testing';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
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
import { NotificationsGateway } from '../src/notifications/realtime/notifications.gateway';
import {
  construirSinal,
  EVENTO_INVALIDACAO,
  type SinalInvalidacao,
} from '../src/notifications/realtime/realtime-signal.core';

/**
 * Tempo real como INVALIDAÇÃO (Story 5.5) — Socket.IO real, banco real, `socket.io-client` real. Prova:
 * AC1 (sinal ao canal `(userId,orgId)` + payload sanitizado sem conteúdo); isolamento (socket de A não
 * recebe o sinal de B; sem sessão → recusado); AC2 (revogação do canal desconecta o socket); AC3 (o
 * tempo real NÃO marca lido; a fonte é o banco); AC4 (backpressure: rajada coalesce; degradação: a
 * Notificação persiste sem socket).
 *
 * O `PRINCIPAL_PROVIDER` é sobreposto por um provider de teste (header `x-test-account`) — o MESMO port
 * que o gateway usa no handshake, então o socket autentica pelo header (em produção, pelo cookie
 * better-auth). A emissão end-to-end usa uma instância de `NotificationsService` com RequestContext
 * FAKE + o gateway REAL do app (com o servidor Socket.IO já inicializado).
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

let app: INestApplication;
let wsUrl: string;
let appPrisma: PrismaClient;
let migrator: PrismaClient;
let seedSvc: NotificationsService;
let gateway: NotificationsGateway;

const databaseUrl = process.env.DATABASE_URL;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

function contextoOrgA(): RequestContext {
  const contexto: ContextoOrganizacional = { orgId: ORG_A, accountId: ANA, papel: 'ADMIN' };
  return { obter: () => contexto } as unknown as RequestContext;
}

/** Semeia uma Notificação para BRUNO pela fonte única ligada ao gateway REAL (emite o sinal). */
async function semear(type: string, params?: unknown): Promise<string> {
  const { notificacao } = await seedSvc.registrarNotificacao({
    type,
    sourceEventId: randomUUID(),
    resourceType: 'SYSTEM',
    resourceId: null, // recurso nulo → sempre acessível na 5.4 (foco aqui é o canal)
    params,
    recipients: [{ membershipId: MEMBERSHIP_BRUNO_A, userId: BRUNO }],
  });
  return notificacao.id;
}

/** Abre um socket cliente (handshake por header `x-test-account` + `auth.orgId`). */
function novoSocket(conta?: string, orgId?: string): ClientSocket {
  const extraHeaders: Record<string, string> = {};
  if (conta !== undefined) extraHeaders[HEADER_CONTA] = conta;
  // Transportes DEFAULT (polling → upgrade): o handshake de polling entrega `extraHeaders` de forma
  // determinística no Node (o `socket.request` do servidor os enxerga). `auth` vai em qualquer transporte.
  return ioClient(wsUrl, {
    extraHeaders,
    auth: orgId !== undefined ? { orgId } : {},
    reconnection: false,
    forceNew: true,
  });
}

/** Resolve quando conecta; rejeita no `connect_error` (handshake recusado). */
function aoConectar(sock: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    sock.once('connect', () => resolve());
    sock.once('connect_error', (err) => reject(err));
  });
}

/** Coleta os sinais recebidos por `ms`; devolve todos os payloads capturados. */
function coletarSinais(sock: ClientSocket, ms: number): Promise<SinalInvalidacao[]> {
  return new Promise((resolve) => {
    const recebidos: SinalInvalidacao[] = [];
    const handler = (s: SinalInvalidacao): void => {
      recebidos.push(s);
    };
    sock.on(EVENTO_INVALIDACAO, handler);
    setTimeout(() => {
      sock.off(EVENTO_INVALIDACAO, handler);
      resolve(recebidos);
    }, ms);
  });
}

function fecha(...socks: ClientSocket[]): void {
  for (const s of socks) {
    if (s.connected) s.disconnect();
    s.close();
  }
}

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
  const httpUrl = await app.getUrl();
  // Normaliza IPv6/localhost para 127.0.0.1 (o cliente ws conecta de forma determinística).
  wsUrl = httpUrl.replace('[::1]', '127.0.0.1').replace('localhost', '127.0.0.1');

  gateway = app.get(NotificationsGateway);

  appPrisma = new PrismaClient({ datasourceUrl: databaseUrl });
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await Promise.all([appPrisma.$connect(), migrator.$connect()]);

  // Fonte única com RequestContext FAKE + o gateway REAL (emite o sinal end-to-end).
  seedSvc = new NotificationsService(
    contextoOrgA(),
    appPrisma as unknown as PrismaService,
    svcLogger,
    gateway,
  );

  // Limpeza prévia (owner + contexto): remove notificações de BRUNO na Org A de execuções passadas.
  const dbMig = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await dbMig.notificationRecipient.deleteMany({
    where: { recipientMembershipId: MEMBERSHIP_BRUNO_A },
  });
});

afterAll(async () => {
  await app?.close();
  await appPrisma?.$disconnect();
  await migrator?.$disconnect();
});

describe('AC1 — sinal ao canal autorizado (userId, orgId) + payload sanitizado', () => {
  it('BRUNO conectado recebe o sinal; o payload traz só id+at (sem conteúdo/PII)', async () => {
    const sock = novoSocket(BRUNO, ORG_A);
    await aoConectar(sock);

    const coleta = coletarSinais(sock, 1500);
    const notifId = await semear('X_SECRETO', { segredo: 'nao-vaza', pii: 'cpf' });
    const sinais = await coleta;

    expect(sinais.length).toBeGreaterThanOrEqual(1);
    const sinal = sinais.find((s) => s.id === notifId);
    expect(sinal).toBeDefined();
    // Sanitização: SÓ id + at. Nada de type/params/segredo/PII no canal.
    expect(Object.keys(sinal!).sort()).toEqual(['at', 'id']);
    expect(JSON.stringify(sinal)).not.toContain('nao-vaza');
    expect(JSON.stringify(sinal)).not.toContain('X_SECRETO');
    fecha(sock);
  });
});

describe('isolamento — nada de outro usuário/Org é transmitido', () => {
  it('o socket de ANA NÃO recebe o sinal destinado a BRUNO', async () => {
    const sBruno = novoSocket(BRUNO, ORG_A);
    const sAna = novoSocket(ANA, ORG_A);
    await Promise.all([aoConectar(sBruno), aoConectar(sAna)]);

    const coletaAna = coletarSinais(sAna, 1200);
    const coletaBruno = coletarSinais(sBruno, 1200);
    await semear('SO_PARA_BRUNO');
    const [sinaisAna, sinaisBruno] = await Promise.all([coletaAna, coletaBruno]);

    expect(sinaisBruno.length).toBeGreaterThanOrEqual(1); // BRUNO recebe
    expect(sinaisAna).toHaveLength(0); // ANA (mesma Org, outro usuário) NÃO recebe
    fecha(sBruno, sAna);
  });

  it('handshake sem sessão é RECUSADO (deny-by-default)', async () => {
    const sock = novoSocket(undefined, ORG_A); // sem x-test-account
    await expect(aoConectar(sock)).rejects.toBeTruthy(); // connect_error
    expect(sock.connected).toBe(false);
    fecha(sock);
  });
});

describe('AC2 — revogação encerra as inscrições (desconecta o socket)', () => {
  it('revogarCanal(orgA, BRUNO) desconecta o socket de BRUNO', async () => {
    const sock = novoSocket(BRUNO, ORG_A);
    await aoConectar(sock);
    expect(sock.connected).toBe(true);

    const desconectou = new Promise<void>((resolve) => sock.once('disconnect', () => resolve()));
    // É exatamente o que 8.5/8.6 (suspensão/remoção) e 1.9 (troca de Org) chamam.
    gateway.revogarCanal(ORG_A, BRUNO);
    await desconectou;
    expect(sock.connected).toBe(false);
    fecha(sock);
  });
});

describe('AC3 — tempo real NÃO é fonte de verdade', () => {
  it('receber o sinal NÃO marca a Notificação como lida (a fonte é o banco)', async () => {
    const sock = novoSocket(BRUNO, ORG_A);
    await aoConectar(sock);
    const coleta = coletarSinais(sock, 1500);
    const notifId = await semear('NAO_MARCA_LIDO');
    await coleta;

    // O estado de leitura vive no banco (5.3/5.4); o socket não o toca.
    const dbApp = withTenantContext(appPrisma, { orgId: ORG_A }, semLog);
    const rec = await dbApp.notificationRecipient.findFirst({
      where: { notificationId: notifId, recipientMembershipId: MEMBERSHIP_BRUNO_A },
      select: { readAt: true },
    });
    expect(rec?.readAt).toBeNull(); // continua NÃO-lida
    fecha(sock);
  });
});

describe('AC4 — backpressure e degradação', () => {
  it('uma rajada síncrona de N sinais ao mesmo canal coalesce (contém a tempestade)', async () => {
    const sock = novoSocket(BRUNO, ORG_A);
    await aoConectar(sock);
    const coleta = coletarSinais(sock, 1200);
    // 6 sinais "ao mesmo tempo" para o mesmo canal (userId,orgId). A emissão é o que 5.3 dispara após
    // cada Notificação; aqui exercita-se o coalescing por sala (janela de 250ms) do gateway — a rajada
    // colapsa em bem menos que 6 sinais, sem depender da concorrência de transações do banco.
    for (let i = 0; i < 6; i++) {
      gateway.notificarDestinatarios(ORG_A, [BRUNO], construirSinal(randomUUID(), new Date()));
    }
    const sinais = await coleta;
    expect(sinais.length).toBeGreaterThanOrEqual(1);
    expect(sinais.length).toBeLessThan(6); // tempestade contida (backpressure)
    fecha(sock);
  });

  it('degradação — sem socket conectado, a Notificação é persistida (a app funciona sem tempo real)', async () => {
    const notifId = await semear('SEM_SOCKET'); // ninguém conectado como BRUNO agora
    const dbApp = withTenantContext(appPrisma, { orgId: ORG_A }, semLog);
    const rec = await dbApp.notificationRecipient.findFirst({
      where: { notificationId: notifId, recipientMembershipId: MEMBERSHIP_BRUNO_A },
      select: { id: true },
    });
    expect(rec).not.toBeNull(); // a fonte canônica não depende do canal
  });
});
