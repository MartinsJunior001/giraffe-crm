import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../generated/prisma';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * Troca explícita de Organização (Story 1.9) pela porta da frente: HTTP real, `AppModule` de
 * produção, login real, banco real. Sem costura de identidade — o que se prova aqui é justamente a
 * cadeia sessão → preferência → contexto, e substituí-la por um provider de teste provaria nada.
 *
 * **BRUNO é o sujeito porque ele pertence às DUAS Organizações do seed** (A e B) — o próprio seed o
 * documenta como "o caso que prova". É fixture de **LEITURA**: nenhuma Membership dele é criada,
 * alterada ou removida aqui (TEST-ISO-01). O que este arquivo escreve são **sessões**, que ele
 * mesmo cria pelo login e limpa no final.
 */

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const EVA = '55555555-5555-5555-5555-555555555555'; // ACTIVE em A e B — a multi-org do seed
const EVA_EMAIL = 'eva@exemplo.test';
// Bruno (ACTIVE em A, SUSPENDED em B) é o contraexemplo do seed: ele NÃO é multi-org ativo, e foi
// justamente essa leitura apressada do comentário do seed que o teste corrigiu. Quem é multi-org é Eva.
const BRUNO = '22222222-2222-2222-2222-222222222222';
const CARLA_EMAIL = 'carla@exemplo.test'; // ACTIVE só em B — caso de Organização única
const SENHA = 'senha-de-desenvolvimento-123';

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient;

const migratorUrl = process.env.MIGRATION_DATABASE_URL;

/**
 * Sessões reais, criadas UMA vez por conta e reaproveitadas.
 *
 * Um login por caso de teste estoura o rate limit do login (G2) e a suíte inteira vira 429 — falha
 * do teste, não do produto. O que cada caso precisa isolar é a PREFERÊNCIA da sessão, não a sessão:
 * daí `preferir()`, que a normaliza antes de cada cenário.
 */
const sessoes = new Map<string, string>();

/**
 * IDs das sessões que ESTA suíte criou — as únicas que ela pode apagar.
 *
 * Apagar por `userId` seria destrutivo demais: a mesma conta pode ter sessões criadas por outra
 * suíte rodando antes (ou, num futuro paralelo, ao lado), e o teardown de um teste não pode
 * derrubar a sessão de ninguém mais. É o mesmo princípio de escopo que a própria Story impõe ao
 * produto — só se altera a sessão que se resolveu, nunca "todas as da conta".
 */
const sessoesCriadas: string[] = [];

async function sessaoDe(email: string): Promise<string> {
  const cache = sessoes.get(email);
  if (cache) return cache;
  const cookie = await login(email);
  sessoes.set(email, cookie);
  await registrarSessao(cookie);
  return cookie;
}

/** Resolve o ID da sessão recém-criada a partir do token do cookie, e o guarda para o teardown. */
async function registrarSessao(cookie: string): Promise<void> {
  const bruto = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1] ?? '';
  const token = decodeURIComponent(bruto);
  const candidatas = await prisma.authSession.findMany({ select: { id: true, token: true } });
  // O cookie carrega `<token>.<assinatura>`; a coluna guarda só o token — daí o `startsWith`.
  const minha = candidatas.find((s) => token.startsWith(s.token));
  if (minha) sessoesCriadas.push(minha.id);
}

/**
 * Estado inicial explícito da preferência (null = "ainda não escolheu"), aplicado SÓ às sessões
 * desta suíte — pelo mesmo motivo do teardown: não se mexe na sessão de quem não é seu.
 */
async function preferir(_userId: string, orgId: string | null): Promise<void> {
  await prisma.authSession.updateMany({
    where: { id: { in: sessoesCriadas } },
    data: { activeOrganizationId: orgId },
  });
}

/** Faz login real e devolve o cookie de sessão. */
async function login(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: SENHA }),
  });
  expect(res.status).toBe(200);
  const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  expect(cookie.length).toBeGreaterThan(10);
  return cookie;
}

async function req(
  metodo: string,
  caminho: string,
  cookie?: string,
  body?: unknown,
  extra: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...extra };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Lê a preferência gravada na sessão — a evidência de que a troca PERSISTIU. */
async function preferenciaDaSessao(cookie: string): Promise<string | null> {
  const token = /better-auth\.session_token=([^;]+)/.exec(cookie)?.[1] ?? '';
  const sessoes = await prisma.authSession.findMany({
    where: { userId: EVA },
    select: { token: true, activeOrganizationId: true },
    orderBy: { createdAt: 'desc' },
  });
  const alvo = sessoes.find((s) => decodeURIComponent(token).startsWith(s.token));
  return alvo?.activeOrganizationId ?? sessoes[0]?.activeOrganizationId ?? null;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  if (!migratorUrl) throw new Error('MIGRATION_DATABASE_URL ausente.');
  prisma = new PrismaClient({ datasourceUrl: migratorUrl });
  await prisma.$connect();

  // O rate limit do login é PERSISTIDO (tabela `RateLimit`) e sobrevive entre execuções: sem esta
  // limpeza, a segunda rodada da suíte começa em 429 e falha inteira por herança da primeira — um
  // vermelho que não diz nada sobre o código. Banco descartável, escopo local.
  await prisma.rateLimit.deleteMany({});

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = modulo.createNestApplication({ logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  // Só as sessões que ESTA suíte criou, por ID — nunca "todas as da conta". Nenhuma Membership foi
  // tocada aqui. Ver `sessoesCriadas`: um teardown amplo derrubaria a sessão de outra suíte.
  if (prisma) {
    if (sessoesCriadas.length > 0) {
      await prisma.authSession.deleteMany({ where: { id: { in: sessoesCriadas } } });
    }
    await prisma.$disconnect();
  }
  await app?.close();
});

describe('isolamento do teardown desta suíte', () => {
  it('uma sessão PREEXISTENTE da mesma conta não entra na lista de remoção', async () => {
    // Sessão "de outra suíte": criada direto no banco, nunca por `sessaoDe`.
    const alheia = await prisma.authSession.create({
      data: {
        id: randomUUID(),
        token: `preexistente-${randomUUID()}`,
        userId: EVA,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });

    try {
      // Garante que a suíte já criou ao menos uma sessão própria.
      await sessaoDe(EVA_EMAIL);

      // O teardown apaga por ID e só o que registrou. A sessão alheia não está lá — logo, sobrevive.
      expect(sessoesCriadas.length).toBeGreaterThan(0);
      expect(sessoesCriadas).not.toContain(alheia.id);

      // E o `preferir()` desta suíte também não a alcança.
      await preferir(EVA, ORG_A);
      const depois = await prisma.authSession.findUnique({
        where: { id: alheia.id },
        select: { activeOrganizationId: true },
      });
      expect(depois?.activeOrganizationId).toBeNull();
    } finally {
      await prisma.authSession.deleteMany({ where: { id: alheia.id } });
    }
  });
});

describe('AC-1 / AC-2 — listagem de Organizações elegíveis', () => {
  it('multi-org: lista as DUAS Organizações ativas, com papel', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    const res = await req('GET', '/session/organizacoes', cookie);

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      atual: string | null;
      organizacoes: { id: string; nome: string; papel: string }[];
    };
    expect(corpo.organizacoes.map((o) => o.id).sort()).toEqual([ORG_A, ORG_B].sort());
    expect(corpo.organizacoes.every((o) => typeof o.nome === 'string' && o.nome.length > 0)).toBe(
      true,
    );
  });

  it('org única: lista exatamente UMA (a UI não mostra seletor)', async () => {
    const cookie = await sessaoDe(CARLA_EMAIL);
    const res = await req('GET', '/session/organizacoes', cookie);

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { organizacoes: { id: string }[] };
    expect(corpo.organizacoes).toHaveLength(1);
    expect(corpo.organizacoes[0]!.id).toBe(ORG_B);
  });

  it('sem sessão → 401, nunca a lista', async () => {
    const res = await req('GET', '/session/organizacoes');
    expect(res.status).toBe(401);
  });

  it('a listagem NÃO enumera Organização sem Membership (Org C não aparece)', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    const corpo = (await (await req('GET', '/session/organizacoes', cookie)).json()) as {
      organizacoes: { id: string }[];
    };
    expect(corpo.organizacoes.map((o) => o.id)).not.toContain(ORG_C);
  });
});

describe('AC-4 / AC-5 / AC-6 — troca explícita e efeito imediato', () => {
  it('sem preferência e com 2 Orgs, a rota de domínio exige escolha (403)', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    await preferir(EVA, null); // estado "ainda não escolheu", explícito

    // Este 403 É o comportamento correto da 1.3: a plataforma não escolhe pelo usuário.
    const res = await req('GET', '/pipes', cookie);
    expect(res.status).toBe(403);
  });

  it('troca válida → 200, persiste na sessão, e a requisição SEGUINTE já usa a nova Org', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);

    const troca = await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });
    expect(troca.status).toBe(200);
    expect((await troca.json()) as { id: string }).toMatchObject({ id: ORG_B });

    // A evidência de que a troca não é só de resposta: o valor está no banco.
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_B);

    // AC-5: a MESMA sessão, SEM `x-org-id`, agora resolve contexto — antes era 403.
    const depois = await req('GET', '/pipes', cookie);
    expect(depois.status).toBe(200);
  });

  it('AC-6 — a escolha sobrevive: nova requisição com o mesmo cookie mantém a Org', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    await req('POST', '/session/organizacao', cookie, { orgId: ORG_A });

    // "Refresh" no servidor é exatamente isto: outra requisição, mesmo cookie, sem header.
    expect((await req('GET', '/pipes', cookie)).status).toBe(200);
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_A);
  });

  it('AC-9 — trocar para a Organização JÁ ativa é idempotente', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });

    const repetida = await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });
    expect(repetida.status).toBe(200);
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_B);
  });

  it('a troca alterna de verdade entre as duas Organizações', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);

    await req('POST', '/session/organizacao', cookie, { orgId: ORG_A });
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_A);

    await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_B);
  });
});

describe('AC-7 — não-enumeração: negados colapsam num 404 uniforme', () => {
  it('Organização INEXISTENTE → 404', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    const res = await req('POST', '/session/organizacao', cookie, { orgId: randomUUID() });
    expect(res.status).toBe(404);
  });

  it('Organização REAL, mas sem Membership (Org C) → 404 — o MESMO status', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    const res = await req('POST', '/session/organizacao', cookie, { orgId: ORG_C });
    // Idêntico ao caso "inexistente": é isso que impede o cliente de descobrir, pelo status, se
    // uma Organização existe. Um 403 aqui seria um oráculo de existência.
    expect(res.status).toBe(404);
  });

  it('orgId malformado → 400 (não vira consulta)', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    expect(
      (await req('POST', '/session/organizacao', cookie, { orgId: 'nao-e-uuid' })).status,
    ).toBe(400);
  });

  it('corpo sem orgId → 400', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    expect((await req('POST', '/session/organizacao', cookie, {})).status).toBe(400);
  });

  it('troca sem sessão → 401', async () => {
    expect((await req('POST', '/session/organizacao', undefined, { orgId: ORG_A })).status).toBe(
      401,
    );
  });
});

describe('AC-8 — preferência OBSOLETA não concede acesso', () => {
  it('preferência apontando para Organização sem Membership é DESCARTADA, não honrada', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });

    // Simula o envelhecimento: a preferência passa a apontar para a Org C, onde Bruno NÃO tem
    // Membership. É o que aconteceria se a Membership dele fosse revogada após a troca.
    // Escreve-se na SESSÃO (descartável, criada por este teste) — nenhuma Membership é tocada.
    await prisma.authSession.updateMany({
      where: { userId: EVA },
      data: { activeOrganizationId: ORG_C },
    });

    // Bruno tem 2 Memberships ativas: descartada a preferência, volta a "escolha obrigatória".
    // O que NÃO pode acontecer é resolver no contexto da Org C.
    const res = await req('GET', '/pipes', cookie);
    expect(res.status).toBe(403);
  });
});

describe('precedência do contrato: x-org-id › preferência › única › 403', () => {
  it('o header EXPLÍCITO vence a preferência gravada', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });

    // Preferência = B; header pede A. O pedido desta requisição tem de vencer.
    const res = await req('GET', '/pipes', cookie, undefined, { 'x-org-id': ORG_A });
    expect(res.status).toBe(200);

    // E o header NÃO altera a preferência persistida — trocar é ato explícito, não efeito colateral.
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_B);
  });

  it('header para Organização SEM Membership continua sendo rejeitado (403), mesmo com preferência válida', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);
    await req('POST', '/session/organizacao', cookie, { orgId: ORG_B });

    // Um pedido explícito inválido é REJEITADO, nunca "corrigido em silêncio" para a preferência.
    const res = await req('GET', '/pipes', cookie, undefined, { 'x-org-id': ORG_C });
    expect(res.status).toBe(403);
  });
});

describe('isolamento entre contas e sessões', () => {
  it('a troca altera SÓ a sessão da própria conta', async () => {
    const cookieBruno = await sessaoDe(EVA_EMAIL);
    const cookieCarla = await sessaoDe(CARLA_EMAIL);

    const carla = await prisma.account.findFirst({
      where: { email: CARLA_EMAIL },
      select: { id: true },
    });
    const antes = await prisma.authSession.findMany({
      where: { userId: carla!.id },
      select: { activeOrganizationId: true },
    });

    await req('POST', '/session/organizacao', cookieBruno, { orgId: ORG_A });

    const depois = await prisma.authSession.findMany({
      where: { userId: carla!.id },
      select: { activeOrganizationId: true },
    });
    expect(depois).toEqual(antes);

    // E a sessão de Carla segue funcional.
    expect((await req('GET', '/session/organizacoes', cookieCarla)).status).toBe(200);
  });

  it('não é possível forjar `activeOrganizationId` pelo corpo da troca', async () => {
    const cookie = await sessaoDe(EVA_EMAIL);

    // O corpo carrega um campo extra tentando escrever direto a preferência para a Org C.
    const res = await req('POST', '/session/organizacao', cookie, {
      orgId: ORG_A,
      activeOrganizationId: ORG_C,
    });

    // O campo extra é ignorado pela fronteira de entrada (só `orgId` é lido) e a preferência
    // gravada é a VALIDADA, nunca a forjada.
    expect(res.status).toBe(200);
    expect(await preferenciaDaSessao(cookie)).toBe(ORG_A);
  });
});
