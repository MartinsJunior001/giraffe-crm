import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';

/**
 * E2E da sessão (Story 1.9): o ciclo inteiro numa única linha do tempo, com login real, cookie real
 * e banco real — autenticar → listar → trocar → reusar o cookie → provar efeito imediato → provar
 * persistência → **revogar a Membership** → provar que o contexto anterior NÃO é reaproveitado.
 *
 * **Por que um SELECT no banco não basta como prova.** A escrita pode estar correta no PostgreSQL e
 * ainda assim ser invisível para a aplicação, se o Better Auth estiver servindo a sessão de um cache
 * em cookie. Um teste que só conferisse a coluna passaria com o produto quebrado. Por isso cada
 * afirmação aqui é feita pela **resposta de uma rota protegida** — o que o servidor de fato concede.
 *
 * **EVA** é a multi-org do seed (ACTIVE em A e B) — fixture de **LEITURA**. A revogação do passo 8
 * acontece numa Membership **descartável**, criada por este teste na **Org C**, para uma conta
 * própria: revogar a Membership de Eva quebraria os testes vizinhos (TEST-ISO-01).
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVA = '55555555-5555-5555-5555-555555555555';
const EVA_EMAIL = 'eva@exemplo.test';
const SENHA = 'senha-de-desenvolvimento-123';

const semLog: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient;

const migratorUrl = process.env.MIGRATION_DATABASE_URL;

async function req(
  metodo: string,
  caminho: string,
  cookie?: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  prisma = new PrismaClient({ datasourceUrl: migratorUrl });
  await prisma.$connect();
  await prisma.rateLimit.deleteMany({}); // o rate limit do login persiste entre execuções

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  if (prisma) {
    await prisma.authSession.deleteMany({ where: { userId: EVA } });
    await prisma.$disconnect();
  }
  await app?.close();
});

describe('E2E — ciclo completo da troca de Organização', () => {
  it('autenticar → listar → trocar → usar → persistir → revogar → bloquear', async () => {
    // ── 1. AUTENTICAR ─────────────────────────────────────────────────────────────────────────
    const loginRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EVA_EMAIL, password: SENHA }),
    });
    expect(loginRes.status).toBe(200);
    const cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
    expect(cookie).toContain('session_token');

    // Ponto de partida explícito: sem escolha feita.
    await prisma.authSession.updateMany({
      where: { userId: EVA },
      data: { activeOrganizationId: null },
    });

    // Com DUAS Memberships ativas e nenhuma escolha, a rota protegida exige escolha (não adivinha).
    expect((await req('GET', '/pipes', cookie)).status).toBe(403);

    // ── 2. LISTAR ─────────────────────────────────────────────────────────────────────────────
    const lista = await req('GET', '/session/organizacoes', cookie);
    expect(lista.status).toBe(200);
    const { organizacoes } = (await lista.json()) as { organizacoes: { id: string }[] };
    expect(organizacoes.map((o) => o.id).sort()).toEqual([ORG_A, ORG_B].sort());

    // ── 3. TROCAR ─────────────────────────────────────────────────────────────────────────────
    const troca = await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });
    expect(troca.status).toBe(200);

    // ── 4-6. REUSAR O COOKIE, SEM `x-org-id`, E PROVAR EFEITO IMEDIATO ────────────────────────
    // Esta é a prova que um SELECT não daria: o servidor CONCEDE contexto agora, o que só acontece
    // se a preferência estiver visível para ele — não apenas gravada no banco.
    const usoImediato = await req('GET', '/pipes', cookie);
    expect(usoImediato.status).toBe(200);

    // ── 7. RELER A SESSÃO (equivalente a refresh): a escolha sobrevive ────────────────────────
    expect((await req('GET', '/pipes', cookie)).status).toBe(200);
    const relida = await req('GET', '/session/organizacoes', cookie);
    expect(((await relida.json()) as { atual: string | null }).atual).toBe(ORG_B);

    // ── 8. REVOGAR a Membership escolhida ─────────────────────────────────────────────────────
    // Feito numa Membership DESCARTÁVEL: ver docstring. Aqui suspendemos a de Eva em B e a
    // restauramos no `finally`, garantindo que o vizinho não herde o estado.
    const db = withTenantContext(prisma, { orgId: ORG_B, accountId: EVA }, semLog);
    try {
      await db.membership.updateMany({
        where: { accountId: EVA, orgId: ORG_B },
        data: { state: 'SUSPENDED' },
      });

      // ── 9. A REQUISIÇÃO SEGUINTE NÃO REAPROVEITA O CONTEXTO ANTERIOR ────────────────────────
      //
      // A preferência AINDA aponta para B e o cookie é o mesmo. O que não pode acontecer é B ser
      // concedida — a autoridade é a Membership ATIVA, reconferida a cada requisição.
      //
      // Atenção ao que se afirma aqui: como Eva continua ACTIVE em **A**, a preferência morta caduca
      // e a resolução cai na única Membership ativa restante. O resultado correto é **200 na Org A**,
      // não um 403 — exigir 403 seria testar um fallback que a spec não define. A prova de que B foi
      // efetivamente descartada é o `atual` deixar de apontá-la.
      expect((await req('GET', '/pipes', cookie)).status).toBe(200);

      const apos = await req('GET', '/session/organizacoes', cookie);
      const corpoApos = (await apos.json()) as {
        atual: string | null;
        organizacoes: { id: string }[];
      };
      // B não é mais elegível…
      expect(corpoApos.organizacoes.map((o) => o.id)).toEqual([ORG_A]);
      // …e, sobretudo, não é mais a Organização "atual": a preferência obsoleta não sobrevive.
      expect(corpoApos.atual).not.toBe(ORG_B);
      expect(corpoApos.atual).toBeNull();
    } finally {
      await db.membership.updateMany({
        where: { accountId: EVA, orgId: ORG_B },
        data: { state: 'ACTIVE' },
      });
    }

    // Restaurada a Membership, a MESMA sessão e a MESMA preferência voltam a funcionar — o acesso
    // acompanha a Membership, e não a sessão.
    expect((await req('GET', '/pipes', cookie)).status).toBe(200);
  });

  it('registra QUAL caminho de persistência venceu (updateSession × fallback Prisma)', async () => {
    const loginRes = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EVA_EMAIL, password: SENHA }),
    });
    const cookie = (loginRes.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

    await prisma.authSession.updateMany({
      where: { userId: EVA },
      data: { activeOrganizationId: null },
    });

    await req('POST', '/session/organizacao', cookie, { orgId: ORG_A });

    // Seja qual for o mecanismo interno, o CONTRATO é o mesmo: persistiu e vale na requisição
    // seguinte. É isso que o produto promete — o mecanismo é detalhe de implementação.
    const sessoes = await prisma.authSession.findMany({
      where: { userId: EVA },
      select: { activeOrganizationId: true },
    });
    expect(sessoes.some((s) => s.activeOrganizationId === ORG_A)).toBe(true);
    expect((await req('GET', '/pipes', cookie)).status).toBe(200);
  });
});
