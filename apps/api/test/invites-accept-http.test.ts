import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { IncomingMessage } from 'node:http';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import {
  PRINCIPAL_PROVIDER,
  type Principal,
  type PrincipalProvider,
} from '../src/kernel/context/principal.provider';
import {
  INVITE_ACCEPTED_NOTIFICATION_PORT,
  type ConviteAceitoEvento,
  type InviteAcceptedNotificationPort,
} from '../src/organizations/invites/notification.port';
import { emitirToken } from '../src/organizations/invites/invite-token';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Aceite pela porta da frente (Story 8.3): HTTP real, AppModule de produção, banco real, notificação
 * FAKE (inspeção). Prova: aceite válido; 404 uniforme (token inexistente/expirado/cancelado); 403
 * (e-mail não verificado / identidade incompatível); 401 (sem sessão); idempotência (sem 2ª Membership,
 * sem 2ª notificação); reativação de Membership REMOVED; anti-mass-assignment; sem token na resposta.
 *
 * Convites e contas são DESCARTÁVEIS (`randomUUID`) na Org A — nunca se toca uma fixture de leitura.
 */

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

class FakeNotificacao implements InviteAcceptedNotificationPort {
  readonly emitidos: ConviteAceitoEvento[] = [];
  registrarConviteAceito(evento: ConviteAceitoEvento): Promise<void> {
    this.emitidos.push(evento);
    return Promise.resolve();
  }
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let fakeNotif: FakeNotificacao;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

const contasCriadas: string[] = [];
const invitesCriados: string[] = [];
const hashesCriados: string[] = [];

/** Cria uma Account global verificada e descartável; devolve id + e-mail (minúsculo, normalizado). */
async function criarConta(verificado = true): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `aceite-${id.slice(0, 12)}@exemplo.test`;
  await migrator.account.create({
    data: { id, email, name: 'Convidado 8.3', emailVerified: verificado },
  });
  contasCriadas.push(id);
  return { id, email };
}

/** Cria um Invite PENDING na Org A com um token conhecido; o trigger popula a InviteRoute. */
async function criarConvite(
  email: string,
  over: Partial<{ state: string; expiresAt: Date }> = {},
): Promise<{ inviteId: string; token: string }> {
  const token = emitirToken();
  hashesCriados.push(token.hash);
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const inv = await db.invite.create({
    data: {
      orgId: ORG_A,
      normalizedEmail: email,
      email,
      role: 'MEMBER',
      state: (over.state ?? 'PENDING') as 'PENDING',
      tokenHash: token.hash,
      expiresAt: over.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
      lastSentAt: new Date(),
      invitedByAccountId: randomUUID(),
    },
    select: { id: true },
  });
  invitesCriados.push(inv.id);
  return { inviteId: inv.id, token: token.bruto };
}

async function aceitar(token: unknown, conta: string | undefined): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  return fetch(`${baseUrl}/invites/accept`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token }),
  });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  fakeNotif = new FakeNotificacao();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .overrideProvider(INVITE_ACCEPTED_NOTIFICATION_PORT)
    .useValue(fakeNotif)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    if (invitesCriados.length)
      await db.invite.deleteMany({ where: { id: { in: invitesCriados } } });
    if (contasCriadas.length) {
      await db.membership.deleteMany({ where: { accountId: { in: contasCriadas } } });
      await migrator.account.deleteMany({ where: { id: { in: contasCriadas } } });
    }
    if (hashesCriados.length)
      await migrator.inviteRoute.deleteMany({ where: { tokenHash: { in: hashesCriados } } });
    await migrator.$disconnect();
  }
  await app?.close();
});

// Isolamento determinístico: zera o rate-limit de aceite (mesmo IP localhost em todos os casos —
// senão o teto por IP de 20/15min acumularia entre testes e o caso de concorrência veria 429) e a
// inspeção da notificação. Espelha o beforeEach do teste HTTP da 8.2.
beforeEach(async () => {
  await migrator.rateLimit.deleteMany({ where: { key: { startsWith: 'inv:acc:' } } });
  fakeNotif.emitidos.length = 0;
});

describe('aceite válido', () => {
  it('conta verificada com e-mail do Convite → 200, 1 Membership ATIVA, sem token na resposta', async () => {
    const conta = await criarConta();
    const { inviteId, token } = await criarConvite(conta.email);

    const res = await aceitar(token, conta.id);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ orgId: ORG_A, role: 'MEMBER', state: 'ACTIVE' });
    expect(corpo.membershipId).toBeTruthy();
    expect(corpo).not.toHaveProperty('token');
    expect(corpo).not.toHaveProperty('tokenHash');

    // Convite consumido; Membership ativa; evento canônico emitido UMA vez.
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const inv = await db.invite.findFirstOrThrow({
      where: { id: inviteId },
      select: { state: true },
    });
    expect(inv.state).toBe('ACCEPTED');
    const m = await db.membership.findFirstOrThrow({
      where: { accountId: conta.id, orgId: ORG_A },
      select: { state: true, role: true },
    });
    expect(m).toMatchObject({ state: 'ACTIVE', role: 'MEMBER' });
    expect(fakeNotif.emitidos).toHaveLength(1);
    expect(fakeNotif.emitidos[0]).toMatchObject({
      orgId: ORG_A,
      inviteId,
      destinatarioAccountId: conta.id,
    });
  });

  it('idempotência: reaceite com o mesmo token pela mesma conta → 200, sem 2ª Membership nem 2ª notificação', async () => {
    const conta = await criarConta();
    const { token } = await criarConvite(conta.email);

    expect((await aceitar(token, conta.id)).status).toBe(200);
    fakeNotif.emitidos.length = 0;
    const segundo = await aceitar(token, conta.id);
    expect(segundo.status).toBe(200);

    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const ms = await db.membership.findMany({ where: { accountId: conta.id, orgId: ORG_A } });
    expect(ms).toHaveLength(1);
    expect(fakeNotif.emitidos).toHaveLength(0); // só o 1º consumo emite
  });

  it('reativa Membership REMOVED (não cria uma segunda)', async () => {
    const conta = await criarConta();
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const m0 = await db.membership.create({
      data: { accountId: conta.id, orgId: ORG_A, role: 'GUEST', state: 'REMOVED' },
      select: { id: true },
    });
    const { token } = await criarConvite(conta.email);

    const res = await aceitar(token, conta.id);
    expect(res.status).toBe(200);
    const m = await db.membership.findFirstOrThrow({
      where: { id: m0.id },
      select: { state: true, role: true },
    });
    expect(m).toMatchObject({ state: 'ACTIVE', role: 'MEMBER' }); // reativada com o papel do Convite
    expect(await db.membership.count({ where: { accountId: conta.id, orgId: ORG_A } })).toBe(1);
  });
});

describe('token inválido → 404 uniforme (não-enumerante)', () => {
  it('token inexistente → 404', async () => {
    const conta = await criarConta();
    expect((await aceitar(emitirToken().bruto, conta.id)).status).toBe(404);
  });

  it('Convite expirado → 404 e nenhuma Membership', async () => {
    const conta = await criarConta();
    const { token } = await criarConvite(conta.email, { expiresAt: new Date(Date.now() - 1000) });
    expect((await aceitar(token, conta.id)).status).toBe(404);
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    expect(await db.membership.count({ where: { accountId: conta.id, orgId: ORG_A } })).toBe(0);
  });

  it('Convite cancelado → 404', async () => {
    const conta = await criarConta();
    const { token } = await criarConvite(conta.email, { state: 'CANCELLED' });
    expect((await aceitar(token, conta.id)).status).toBe(404);
  });
});

describe('identidade e autenticação', () => {
  it('sem sessão → 401', async () => {
    const conta = await criarConta();
    const { token } = await criarConvite(conta.email);
    expect((await aceitar(token, undefined)).status).toBe(401);
  });

  it('conta com e-mail DIFERENTE do Convite → 403 IDENTIDADE_INCOMPATIVEL (token válido, não enumera)', async () => {
    const dono = await criarConta();
    const outro = await criarConta();
    const { token } = await criarConvite(dono.email);
    const res = await aceitar(token, outro.id);
    expect(res.status).toBe(403);
    expect((await res.json()) as { motivo?: string }).toMatchObject({
      motivo: 'IDENTIDADE_INCOMPATIVEL',
    });
  });

  it('conta com e-mail NÃO verificado → 403 EMAIL_NAO_VERIFICADO', async () => {
    const conta = await criarConta(false);
    const { token } = await criarConvite(conta.email);
    const res = await aceitar(token, conta.id);
    expect(res.status).toBe(403);
    expect((await res.json()) as { motivo?: string }).toMatchObject({
      motivo: 'EMAIL_NAO_VERIFICADO',
    });
  });
});

describe('fronteira de entrada', () => {
  it('campo não permitido no corpo → 400 (anti-mass-assignment)', async () => {
    const conta = await criarConta();
    const { token } = await criarConvite(conta.email);
    const res = await fetch(`${baseUrl}/invites/accept`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [HEADER_CONTA]: conta.id },
      body: JSON.stringify({ token, orgId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('concorrência real — N aceites simultâneos do mesmo Convite (Finding MEDIUM-1)', () => {
  it('N=5 aceites simultâneos → exatamente 1 Membership, 1 consumo, 1 notificação; nenhum 500', async () => {
    // Banco e HTTP REAIS (sem mock sequencial). A guarda otimista `updateMany where state='PENDING'`
    // + o lock de linha do Postgres (READ COMMITTED) fazem exatamente 1 transação consumir; as demais
    // reavaliam o WHERE após o commit do vencedor (state=ACCEPTED, count=0) e caem no caminho
    // idempotente (Membership do vencedor já commitada e visível). O @@unique([accountId,orgId]) é o
    // backstop (P2002 → idempotente). Consumo + criação vivem na MESMA transação (AD-13).
    //
    // N=5 = o teto do rate limit POR TOKEN na janela (`aceitacaoPorConvitePor15min`): mantém a rajada
    // dentro do orçamento (todas atendidas) para isolar a prova de CONCORRÊNCIA do throttling — N>5
    // corretamente devolveria 429 nas excedentes, o que é anti-abuso, não corrida.
    const N = 5;
    const conta = await criarConta();
    const { inviteId, token } = await criarConvite(conta.email);

    const respostas = await Promise.all(Array.from({ length: N }, () => aceitar(token, conta.id)));
    const status = respostas.map((r) => r.status);

    // Contrato: nenhum 500; toda resposta é sucesso idempotente (200) — 1 vencedor + (N-1) idempotentes.
    expect(status).toEqual(new Array(N).fill(200));
    expect(status.some((s) => s >= 500)).toBe(false);

    // Todos que responderam 200 devolvem a MESMA Membership (a do vencedor).
    const corpos = (await Promise.all(respostas.map((r) => r.json()))) as {
      membershipId: string;
      orgId: string;
      state: string;
    }[];
    const membershipIds = new Set(corpos.map((c) => c.membershipId));
    expect(membershipIds.size).toBe(1);
    expect(corpos.every((c) => c.orgId === ORG_A && c.state === 'ACTIVE')).toBe(true);

    // Prova autoritativa no banco: exatamente 1 Membership, Convite consumido 1x, 1 notificação.
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const ms = await db.membership.findMany({
      where: { accountId: conta.id, orgId: ORG_A },
      select: { id: true, state: true },
    });
    expect(ms).toHaveLength(1); // nenhuma duplicação
    expect(ms[0]!.state).toBe('ACTIVE');
    expect([...membershipIds][0]).toBe(ms[0]!.id);

    const inv = await db.invite.findFirstOrThrow({
      where: { id: inviteId },
      select: { state: true },
    });
    expect(inv.state).toBe('ACCEPTED'); // 1 consumo efetivo

    // Efeito irreversível único: a notificação canônica saiu UMA vez (só o 1º consumo emite).
    expect(fakeNotif.emitidos.filter((e) => e.inviteId === inviteId)).toHaveLength(1);
  });
});
