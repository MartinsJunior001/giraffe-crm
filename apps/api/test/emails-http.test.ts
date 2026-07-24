import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
 * Composer de e-mail (Story 6.1) pela porta da frente: HTTP real, banco real. Prova o modelo canônico
 * (0..1 Card da mesma Org; associação sem transferência de acesso), a validação server-side de
 * destinatários/conteúdo, a imutabilidade pós-SUBMITTED, o descarte idempotente e as capacidades
 * deny-by-default (GUEST 403 sem Card; leitura = autor ou Admin; 404 não-enumerante).
 */

const ANA = '11111111-1111-1111-1111-111111111111'; // ADMIN na Org A
const BRUNO = '22222222-2222-2222-2222-222222222222'; // MEMBER na Org A
const CARLA = '33333333-3333-3333-3333-333333333333'; // ADMIN na Org B (cross-tenant)
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
interface EmailView {
  id: string;
  cardId: string | null;
  state: string;
  recipients: string[];
  subject: string;
  body: string;
  submittedAt: string | null;
}

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
const pipesCriados: string[] = [];
const emailsCriados: string[] = [];
// Convidada descartável (GUEST ACTIVE na Org A) — conta DEDICADA (`randomUUID`), nunca as fixtures de
// leitura (TEST-ISO-01). Justificativa de escrever na Org A (review 6.1 — QA-F4): o fluxo HTTP completo
// (Pipe→Fase→Form→Card via API) exige um ADMIN autenticável, e o único disponível é ANA (Org A) — o MESMO
// padrão já usado por `tasks-http`/`solicitacoes-http`. A regra de ouro proíbe reusar contas de SEED em
// `membership.create`; esta Membership é de conta descartável e a faxina é escopada aos ids criados.
const GUEST_CONTA = randomUUID();
let guestMembershipId = '';
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

/** Pipe com Fase + Campo publicado + um Card (para os testes de associação). */
async function pipeComCard(nome: string): Promise<{ pipeId: string; cardId: string }> {
  const res = await req('POST', '/pipes', ANA, { name: nome });
  expect(res.status).toBe(201);
  const pipeId = ((await res.json()) as Ident).id;
  pipesCriados.push(pipeId);
  expect((await req('POST', `/pipes/${pipeId}/phases`, ANA, { name: 'A Fazer' })).status).toBe(201);
  const campoRes = await req('POST', `/pipes/${pipeId}/forms/initial/fields`, ANA, {
    label: 'Nome',
    type: 'TEXT_SHORT',
  });
  expect(campoRes.status).toBe(201);
  const campo = (await campoRes.json()) as Ident;
  expect((await req('POST', `/pipes/${pipeId}/forms/initial/publish`, ANA)).status).toBe(201);
  const sub = await req('POST', `/pipes/${pipeId}/forms/initial/submit`, ANA, {
    idempotencyKey: `${nome}-card`,
    valores: { [campo.id]: 'x' },
  });
  return { pipeId, cardId: ((await sub.json()) as Ident).id };
}

async function criarEmail(conta: string, body: unknown, esperado = 201): Promise<EmailView> {
  const res = await req('POST', '/emails', conta, body);
  expect(res.status).toBe(esperado);
  const email = (await res.json()) as EmailView;
  if (esperado === 201) emailsCriados.push(email.id);
  return email;
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
  // Convidada descartável na Org A (única Org ativa dela → contexto resolve sem x-org-id).
  await migrator.account.create({
    data: { id: GUEST_CONTA, email: `guest-${GUEST_CONTA}@teste.local`, name: 'Guest 6.1' },
  });
  const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
  const m = await db.membership.create({
    data: { accountId: GUEST_CONTA, orgId: ORG_A, role: 'GUEST', state: 'ACTIVE' },
    select: { id: true },
  });
  guestMembershipId = m.id;
}, 30000);

afterAll(async () => {
  if (migrator) {
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    // Faxina ESCOPADA aos recursos deste arquivo (TEST-ISO-01).
    await db.emailMessage.deleteMany({ where: { id: { in: emailsCriados } } }).catch(() => {});
    await db.card.deleteMany({ where: { pipeId: { in: pipesCriados } } }).catch(() => {});
    await db.pipe.deleteMany({ where: { id: { in: pipesCriados } } }).catch(() => {});
    if (guestMembershipId) {
      await db.membership.deleteMany({ where: { id: guestMembershipId } }).catch(() => {});
    }
    await migrator.account.deleteMany({ where: { id: GUEST_CONTA } }).catch(() => {});
  }
  await app?.close();
  await migrator?.$disconnect();
});

describe('AC1 — modelo canônico e associação a Card', () => {
  it('cria e-mail da Org (201) sem Card; resposta sem `orgId`; estado DRAFT', async () => {
    const email = await criarEmail(ANA, { subject: 'Oi', body: 'corpo', recipients: [] });
    expect(email.state).toBe('DRAFT');
    expect(email.cardId).toBeNull();
    expect('orgId' in (email as unknown as Record<string, unknown>)).toBe(false);
  });

  it('associa a um Card da MESMA Org; cardId de outra Org/inexistente → 404 (não-enumerante)', async () => {
    const { cardId } = await pipeComCard('e61-assoc');
    const email = await criarEmail(ANA, { cardId, subject: 's', body: 'b' });
    expect(email.cardId).toBe(cardId);
    // Vários e-mails podem apontar o MESMO Card.
    await criarEmail(ANA, { cardId, subject: 's2', body: 'b2' });
    // Card inexistente (equivale a cross-tenant sob RLS) → 404, sem confirmar existência.
    const res = await req('POST', '/emails', ANA, {
      cardId: randomUUID(),
      subject: 's',
      body: 'b',
    });
    expect(res.status).toBe(404);
  });

  it('acesso ao Card NÃO concede acesso ao e-mail: Bruno (opera o Pipe? não) e Carla (outra Org) não leem', async () => {
    const email = await criarEmail(ANA, { subject: 'privado', body: 'b' });
    expect((await req('GET', `/emails/${email.id}`, BRUNO)).status).toBe(404); // não-autor, não-Admin
    expect((await req('GET', `/emails/${email.id}`, CARLA)).status).toBe(404); // cross-tenant (RLS)
  });
});

describe('AC2 — destinatários validados no servidor', () => {
  it('normaliza/deduplica; sintaxe inválida → 400; acima do limite → 400', async () => {
    const email = await criarEmail(ANA, {
      subject: 's',
      body: 'b',
      recipients: ['  X@EXEMPLO.COM ', 'x@exemplo.com', 'y@dominio.com.br'],
    });
    expect(email.recipients).toEqual(['x@exemplo.com', 'y@dominio.com.br']);
    expect(
      (await req('POST', '/emails', ANA, { subject: 's', body: 'b', recipients: ['lixo'] })).status,
    ).toBe(400);
    const demais = Array.from({ length: 21 }, (_, i) => `u${i}@exemplo.com`);
    expect(
      (await req('POST', '/emails', ANA, { subject: 's', body: 'b', recipients: demais })).status,
    ).toBe(400);
  });

  it('submit exige ≥1 destinatário (400 com lista vazia)', async () => {
    const email = await criarEmail(ANA, { subject: 's', body: 'b', recipients: [] });
    expect((await req('POST', `/emails/${email.id}/submit`, ANA)).status).toBe(400);
  });
});

describe('AC3/RF-2 — edição do rascunho (PATCH)', () => {
  it('edita DRAFT (200): merge parcial revalida, normaliza e deduplica no servidor', async () => {
    const email = await criarEmail(ANA, {
      subject: 'original',
      body: 'corpo',
      recipients: ['a@exemplo.com'],
    });
    const res = await req('PATCH', `/emails/${email.id}`, ANA, {
      recipients: ['  B@Exemplo.com ', 'b@exemplo.com', 'a@exemplo.com'],
      subject: 'editado',
    });
    expect(res.status).toBe(200);
    const editado = (await res.json()) as EmailView;
    expect(editado.subject).toBe('editado');
    expect(editado.body).toBe('corpo'); // campo não enviado é preservado
    expect(editado.recipients).toEqual(['b@exemplo.com', 'a@exemplo.com']);
    // Conteúdo inválido no PATCH → 400 (validação server-side também na edição).
    expect((await req('PATCH', `/emails/${email.id}`, ANA, { recipients: ['lixo'] })).status).toBe(
      400,
    );
  });

  it('trocar a associação exige operar o Card de ORIGEM e o de DESTINO', async () => {
    const { cardId } = await pipeComCard('e61-patch-vinculo');
    const email = await criarEmail(ANA, { cardId, subject: 's', body: 'b' });
    // Bruno não opera o Card de origem: nem desassociar nem trocar (404 não-enumerante).
    expect((await req('PATCH', `/emails/${email.id}`, BRUNO, { cardId: null })).status).toBe(404);
    // Ana (opera origem; destino inexistente/cross-tenant) → 404 no destino.
    expect((await req('PATCH', `/emails/${email.id}`, ANA, { cardId: randomUUID() })).status).toBe(
      404,
    );
    // Ana desassocia (opera a origem; sem Card → capacidade de papel) → 200.
    const res = await req('PATCH', `/emails/${email.id}`, ANA, { cardId: null });
    expect(res.status).toBe(200);
    expect(((await res.json()) as EmailView).cardId).toBeNull();
  });
});

describe('AC3 — sanitização e imutabilidade pós-envio', () => {
  it('conteúdo com caractere de controle → 400; submit congela; edição pós-SUBMITTED → 409', async () => {
    expect(
      (
        await req('POST', '/emails', ANA, {
          subject: 'a' + String.fromCharCode(0) + 'b',
          body: 'x',
        })
      ).status,
    ).toBe(400);

    const email = await criarEmail(ANA, {
      subject: 's',
      body: 'b',
      recipients: ['dest@exemplo.com'],
    });
    const sub = await req('POST', `/emails/${email.id}/submit`, ANA);
    expect(sub.status).toBe(200);
    const submetido = (await sub.json()) as EmailView;
    expect(submetido.state).toBe('SUBMITTED');
    expect(submetido.submittedAt).not.toBeNull();
    // Imutável: editar → 409; re-submit → 200 idempotente; descartar um SUBMITTED → 409.
    expect((await req('PATCH', `/emails/${email.id}`, ANA, { subject: 'novo' })).status).toBe(409);
    expect((await req('POST', `/emails/${email.id}/submit`, ANA)).status).toBe(200);
    expect((await req('POST', `/emails/${email.id}/discard`, ANA)).status).toBe(409);
    // AC-5/D-61.6: submeter NÃO emite Evento de domínio (o outbox nasce só com o envio real, 6.4).
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const eventos = await db.domainEvent.findMany({ where: { resourceId: email.id } });
    expect(eventos).toHaveLength(0);
  });

  it('descartar é idempotente e preserva a linha (sem DELETE)', async () => {
    const email = await criarEmail(ANA, { subject: 's', body: 'b' });
    expect((await req('POST', `/emails/${email.id}/discard`, ANA)).status).toBe(200);
    expect((await req('POST', `/emails/${email.id}/discard`, ANA)).status).toBe(200); // no-op
    const db = withTenantContext(migrator, { orgId: ORG_A }, semLog);
    const linha = await db.emailMessage.findUnique({ where: { id: email.id } });
    expect(linha?.state).toBe('DISCARDED');
  });
});

describe('AC4 — capacidades deny-by-default', () => {
  it('GUEST não compõe e-mail sem Card (403); MEMBER compõe', async () => {
    expect((await req('POST', '/emails', GUEST_CONTA, { subject: 's', body: 'b' })).status).toBe(
      403,
    );
    await criarEmail(BRUNO, { subject: 's', body: 'b' });
  });

  it('compor COM Card exige operar o Card: Bruno sem poder no Pipe → 404 (não-enumerante)', async () => {
    const { cardId } = await pipeComCard('e61-authz');
    const res = await req('POST', '/emails', BRUNO, { cardId, subject: 's', body: 'b' });
    expect(res.status).toBe(404); // Bruno não tem acesso ao Card → não-enumerante
  });

  it('leitura: autor lê; Admin da Org lê; outro membro → 404', async () => {
    const email = await criarEmail(BRUNO, { subject: 'do bruno', body: 'b' });
    expect((await req('GET', `/emails/${email.id}`, BRUNO)).status).toBe(200);
    expect((await req('GET', `/emails/${email.id}`, ANA)).status).toBe(200); // Admin da Org
    expect((await req('GET', `/emails/${email.id}`, GUEST_CONTA)).status).toBe(404);
  });

  it('sem sessão → 401/403 (deny-by-default do guard)', async () => {
    const res = await req('GET', `/emails/${randomUUID()}`);
    expect([401, 403]).toContain(res.status);
  });
});
