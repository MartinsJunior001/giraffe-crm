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
import { FakeTransactionalEmailAdapter } from '../src/organizations/invites/fake-transactional-email.adapter';
import { TRANSACTIONAL_EMAIL_PORT } from '../src/organizations/invites/transactional-email.port';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * Convite pela porta da frente (Story 8.2): HTTP real, AppModule de produção, banco real (5437),
 * adapter de e-mail FAKE sobrescrito para inspeção. Prova a guarda (Admin), a não-enumeração, o
 * conflito (409), o rate-limit (429 + Retry-After), a rotação de token no reenvio e o cancelamento.
 *
 * Ana = ADMIN na Org A; Bruno = MEMBER na Org A; Carla = ADMIN na Org B (fixtures de LEITURA).
 * Convites são criados na Org A com e-mails descartáveis (`randomUUID`) — nenhuma Membership é tocada.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ANA = '11111111-1111-1111-1111-111111111111';
const BRUNO = '22222222-2222-2222-2222-222222222222';
const CARLA = '33333333-3333-3333-3333-333333333333';
const HEADER_CONTA = 'x-test-account';
const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

class PrincipalDeTeste implements PrincipalProvider {
  resolver(req: IncomingMessage): Promise<Principal | null> {
    const conta = req.headers[HEADER_CONTA];
    if (typeof conta !== 'string' || conta === '') return Promise.resolve(null);
    return Promise.resolve({ accountId: conta });
  }
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let fakeEmail: FakeTransactionalEmailAdapter;
const migratorUrl = process.env.MIGRATION_DATABASE_URL;

function emailNovo(): string {
  return `conv-${randomUUID().slice(0, 12)}@exemplo.test`;
}

async function req(
  metodo: string,
  caminho: string,
  conta: string | undefined,
  orgId: string | undefined,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (conta !== undefined) headers[HEADER_CONTA] = conta;
  if (orgId !== undefined) headers['x-org-id'] = orgId;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function criar(
  email: string,
  role = 'MEMBER',
  conta = ANA,
  orgId = ORG_A,
): Promise<Response> {
  return req('POST', '/organizations/invites', conta, orgId, { email, role });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  migrator = new PrismaClient({ datasourceUrl: migratorUrl });
  await migrator.$connect();

  fakeEmail = new FakeTransactionalEmailAdapter();
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRINCIPAL_PROVIDER)
    .useClass(PrincipalDeTeste)
    .overrideProvider(TRANSACTIONAL_EMAIL_PORT)
    .useValue(fakeEmail)
    .compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    await db.invite.deleteMany({ where: { orgId: ORG_A } });
    await migrator.$disconnect();
  }
  await app?.close();
});

// Limpa os Convites da Org A e o rate-limit entre casos (isolamento determinístico).
beforeEach(async () => {
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  await db.invite.deleteMany({ where: { orgId: ORG_A } });
  await migrator.rateLimit.deleteMany({ where: { key: { startsWith: 'inv:' } } });
  fakeEmail.enviados.length = 0;
});

describe('criação e autorização', () => {
  it('ADMIN cria Convite MEMBER → 201, sem token/hash no corpo, e envia e-mail', async () => {
    const email = emailNovo();
    const res = await criar(email);
    expect(res.status).toBe(201);
    const corpo = (await res.json()) as Record<string, unknown>;
    expect(corpo).toMatchObject({ email, role: 'MEMBER', state: 'PENDING' });
    expect(corpo).not.toHaveProperty('tokenHash');
    expect(corpo).not.toHaveProperty('token');
    expect(corpo).not.toHaveProperty('orgId');
    // Enviou pela porta (fake), com link do e-mail — mas o corpo não expõe o token.
    expect(fakeEmail.enviados).toHaveLength(1);
    expect(fakeEmail.enviados[0]!.para).toBe(email);
  });

  it('MEMBER não cria → 403 (guarda de Admin)', async () => {
    expect((await criar(emailNovo(), 'MEMBER', BRUNO)).status).toBe(403);
  });

  it('sem sessão → 401', async () => {
    // `req` direto (sem o default ANA de `criar`): `undefined` explícito num parâmetro com default
    // ativaria o default em JS — daí chamar `req` para de fato omitir a conta.
    const res = await req('POST', '/organizations/invites', undefined, ORG_A, {
      email: emailNovo(),
      role: 'MEMBER',
    });
    expect(res.status).toBe(401);
  });

  it('convite como ADMIN → 403 STEP_UP_REQUIRED (fail-closed, step-up ausente)', async () => {
    const res = await criar(emailNovo(), 'ADMIN');
    expect(res.status).toBe(403);
    expect((await res.json()) as { motivo?: string }).toMatchObject({ motivo: 'STEP_UP_REQUIRED' });
  });

  it('payload inválido (e-mail malformado) → 400', async () => {
    expect((await criar('nao-e-email')).status).toBe(400);
  });

  it('papel inválido → 400', async () => {
    expect((await criar(emailNovo(), 'SUPERADMIN')).status).toBe(400);
  });

  it('campo não permitido no corpo → 400 (anti-mass-assignment)', async () => {
    const res = await req('POST', '/organizations/invites', ANA, ORG_A, {
      email: emailNovo(),
      role: 'MEMBER',
      state: 'ACCEPTED',
    });
    expect(res.status).toBe(400);
  });

  it('e-mail é normalizado (maiúsculas/espaços) na chave de unicidade', async () => {
    const base = emailNovo();
    expect((await criar(`  ${base.toUpperCase()}  `)).status).toBe(201);
    // Um 2º convite para a forma normalizada equivalente → conflito de pendente.
    const res = await criar(base);
    expect(res.status).toBe(409);
  });
});

describe('conflitos', () => {
  it('convite PENDING duplicado → 409 CONVITE_PENDENTE_EXISTE', async () => {
    const email = emailNovo();
    expect((await criar(email)).status).toBe(201);
    const res = await criar(email);
    expect(res.status).toBe(409);
    expect((await res.json()) as { motivo?: string }).toMatchObject({
      motivo: 'CONVITE_PENDENTE_EXISTE',
    });
  });

  it('e-mail de Membership ATIVA → 409 JA_MEMBRO_ATIVO', async () => {
    // Bruno é MEMBER ativo na Org A. Convidá-lo de novo bloqueia.
    const res = await criar('bruno@exemplo.test');
    expect(res.status).toBe(409);
    expect((await res.json()) as { motivo?: string }).toMatchObject({ motivo: 'JA_MEMBRO_ATIVO' });
  });
});

describe('isolamento cross-tenant e não-enumeração', () => {
  it('Admin de outra Org (Carla@B) não reenvia Convite da Org A → 404', async () => {
    const email = emailNovo();
    const criado = (await (await criar(email)).json()) as { id: string };
    // Carla é ADMIN, mas da Org B; pede no contexto da Org B.
    const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const res = await req('POST', `/organizations/invites/${criado.id}/resend`, CARLA, ORG_B);
    expect(res.status).toBe(404);
  });

  it('reenviar Convite inexistente → 404 (não-enumerante)', async () => {
    const res = await req('POST', `/organizations/invites/${randomUUID()}/resend`, ANA, ORG_A);
    expect(res.status).toBe(404);
  });
});

describe('reenvio — rotação de token e cooldown', () => {
  it('reenvio rotaciona o tokenHash e reinicia a validade', async () => {
    const email = emailNovo();
    const criado = (await (await criar(email)).json()) as { id: string };
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const antes = await db.invite.findFirstOrThrow({
      where: { id: criado.id },
      select: { tokenHash: true, expiresAt: true },
    });

    const res = await req('POST', `/organizations/invites/${criado.id}/resend`, ANA, ORG_A);
    expect(res.status).toBe(200);

    const depois = await db.invite.findFirstOrThrow({
      where: { id: criado.id },
      select: { tokenHash: true, expiresAt: true },
    });
    // Token anterior invalidado: o hash mudou (o lookup pelo hash antigo não acha mais).
    expect(depois.tokenHash).not.toBe(antes.tokenHash);
    expect(depois.expiresAt.getTime()).toBeGreaterThanOrEqual(antes.expiresAt.getTime());
    expect(fakeEmail.enviados).toHaveLength(2); // criação + reenvio
  });
});

describe('cancelamento', () => {
  it('cancelar PENDING → 200 CANCELLED; segundo cancel é idempotente', async () => {
    const email = emailNovo();
    const criado = (await (await criar(email)).json()) as { id: string };

    const c1 = await req('POST', `/organizations/invites/${criado.id}/cancel`, ANA, ORG_A);
    expect(c1.status).toBe(200);
    expect((await c1.json()) as { state: string }).toMatchObject({ state: 'CANCELLED' });

    const c2 = await req('POST', `/organizations/invites/${criado.id}/cancel`, ANA, ORG_A);
    expect(c2.status).toBe(200); // idempotente
  });

  it('cancelado invalida: reenviar depois → 409', async () => {
    const email = emailNovo();
    const criado = (await (await criar(email)).json()) as { id: string };
    await req('POST', `/organizations/invites/${criado.id}/cancel`, ANA, ORG_A);
    const res = await req('POST', `/organizations/invites/${criado.id}/resend`, ANA, ORG_A);
    expect(res.status).toBe(409);
  });
});

describe('rate limit G2 — 429 com Retry-After', () => {
  it('exceder o teto por destinatário (5/dia) → 429 com Retry-After', async () => {
    const email = emailNovo();
    // 1 criação + cancelamentos permitem recriar para o mesmo destinatário, cobrando o limite/dest.
    // Cria/cancela em loop até o 6º disparar 429 (teto 5 por destinatário/Org/dia).
    let ultimo: Response | null = null;
    for (let i = 0; i < 6; i++) {
      const r = await criar(email);
      if (r.status === 201) {
        const { id } = (await r.json()) as { id: string };
        await req('POST', `/organizations/invites/${id}/cancel`, ANA, ORG_A);
      }
      ultimo = r;
    }
    expect(ultimo!.status).toBe(429);
    expect(ultimo!.headers.get('retry-after')).toBeTruthy();
    expect(Number(ultimo!.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});
