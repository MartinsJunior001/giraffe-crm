import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { LoginFailureService } from '../src/kernel/auth/login-failure.service';
import { PrismaClient } from '../generated/prisma';
import { withTenantContext, type TenantLogger } from '../src/kernel/db/tenant-context';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { PinoLogger } from 'nestjs-pino';

/**
 * Story 1.5 — continuidade de sessão, logout e proteção de rota, pela porta da frente: `AppModule`
 * REAL, HTTP real, PostgreSQL real. O que este arquivo prova (e um mock não provaria): que a
 * expiração é por INATIVIDADE (desliza; sem teto absoluto), que o logout revoga IMEDIATAMENTE (o
 * `cookieCache` está desligado), que a sessão é IDENTIDADE e não autorização (Membership suspensa/
 * removida bloqueia mesmo com sessão válida), e que nenhum token de sessão vaza para o log.
 *
 * Tempo se simula ENVELHECENDO a sessão no banco — nunca esperando o relógio (padrão do G1). A conta
 * de escrita deste arquivo é a **Iris**, exclusiva daqui: ela loga (tem credencial), envelhece as
 * próprias sessões e cria/altera o próprio vínculo na **Org C**. Assim o cleanup por `userId` é
 * seguro e nada colide com os outros arquivos que rodam em paralelo.
 */

const SENHA = 'senha-de-desenvolvimento-123';

const IRIS = '99999999-9999-9999-9999-999999999999';
const IRIS_EMAIL = 'iris@exemplo.test';

/**
 * IP sintético e EXCLUSIVO deste arquivo, para o antiabuso por IP (G2).
 *
 * O contador do G2 vive no banco e é chaveado por `IP|rota`. Todos os arquivos de teste que fazem
 * login por HTTP saem do mesmo loopback (`::1`), então compartilhariam esse contador — e um limparia
 * ou estouraria o do outro, rodando em paralelo. Fazendo o app confiar no proxy loopback (abaixo) e
 * mandando este `X-Forwarded-For` em toda requisição de auth, os logins deste arquivo caem numa chave
 * própria (`10.99.99.99|...`), sem colidir com `login-http.test.ts`.
 */
const IP_TESTE = '10.99.99.99';

const ORG_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ORG_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const DIA_MS = 24 * 60 * 60 * 1000;

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient; // giraffe_app (runtime)
// giraffe_migrator (dono) — SÓ faxina do vínculo descartável da Iris: desde a Story 8.6 o runtime não
// tem DELETE em "Membership" (REVOKE — DEB-MEMBERSHIP-EVENT-CASCADE).
let migrator: PrismaClient;
let falhas: LoginFailureService;

const semLogPino = { warn: () => {}, info: () => {}, error: () => {} } as unknown as PinoLogger;
const semLogTenant: TenantLogger = { debug: () => {}, info: () => {}, warn: () => {} };

async function login(headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_TESTE, ...headers },
    body: JSON.stringify({ email: IRIS_EMAIL, password: SENHA }),
  });
}

/** Só o par nome=valor do cookie, para reusar como header `cookie` em requisições autenticadas. */
function cookieDe(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

/** O `Set-Cookie` COMPLETO do token de sessão — para inspecionar HttpOnly/Secure/SameSite. */
function setCookieSessao(res: Response): string | undefined {
  return (res.headers.getSetCookie?.() ?? []).find((c) => /session_token=/i.test(c));
}

async function getSession(cookie: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/get-session`, {
    headers: { cookie, 'x-forwarded-for': IP_TESTE },
  });
}

async function orgAtual(cookie: string, orgId?: string): Promise<Response> {
  return fetch(`${baseUrl}/organizations/current`, {
    headers: { cookie, ...(orgId ? { 'x-org-id': orgId } : {}) },
  });
}

async function signOut(cookie: string): Promise<Response> {
  // O Better Auth exige `content-type: application/json` nos POST — sem ele, o sign-out devolve 415.
  return fetch(`${baseUrl}/api/auth/sign-out`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_TESTE, cookie },
    body: '{}',
  });
}

/** A sessão mais recente da Iris no banco (Iris é exclusiva deste arquivo). */
async function sessaoMaisRecente(): Promise<{ id: string; token: string; expiresAt: Date } | null> {
  const s = await prisma.authSession.findFirst({
    where: { userId: IRIS },
    orderBy: { createdAt: 'desc' },
    select: { id: true, token: true, expiresAt: true },
  });
  return s;
}

/** Envelhece/adianta `expiresAt` da sessão no banco — em vez de esperar o relógio. */
async function definirExpiresAt(id: string, quando: Date): Promise<void> {
  await prisma.authSession.update({ where: { id }, data: { expiresAt: quando } });
}

/** Deixa a Iris com EXATAMENTE um vínculo na Org C no estado dado — ou nenhum, se `null`. */
async function vinculoIris(state: 'ACTIVE' | 'SUSPENDED' | 'REMOVED' | null): Promise<void> {
  // DELETE pelo DONO (o runtime não tem mais DELETE em Membership — Story 8.6); INSERT pelo runtime.
  await withTenantContext(migrator, { orgId: ORG_C }, semLogTenant).membership.deleteMany({
    where: { accountId: IRIS, orgId: ORG_C },
  });
  if (state) {
    const dbC = withTenantContext(prisma, { orgId: ORG_C, accountId: IRIS }, semLogTenant);
    await dbC.membership.create({ data: { accountId: IRIS, orgId: ORG_C, role: 'MEMBER', state } });
  }
}

async function limparSessoesIris(): Promise<void> {
  await prisma.authSession.deleteMany({ where: { userId: IRIS } });
}

async function limparRateLimit(): Promise<void> {
  // Só a chave DESTE arquivo (IP sintético). Apagar `%${ROTA_LOGIN}` derrubaria o contador do
  // `login-http.test.ts`, que roda em paralelo sobre o mesmo banco.
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE ${IP_TESTE + '|%'}`;
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  // Confia no proxy loopback para HONRAR o nosso `X-Forwarded-For` (ver IP_TESTE). Isola o contador
  // do G2 deste arquivo do `login-http.test.ts`. Este processo de teste é isolado (vitest roda cada
  // arquivo em worker próprio), então a variável não vaza para os outros arquivos.
  process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  migrator = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  await Promise.all([prisma.$connect(), migrator.$connect()]);
  falhas = new LoginFailureService(prisma as unknown as PrismaService, semLogPino);

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await vinculoIris(null);
  await limparSessoesIris();
  await falhas.limpar(IRIS_EMAIL);
  await limparRateLimit();
  await app.close();
  await Promise.all([prisma.$disconnect(), migrator.$disconnect()]);
});

beforeEach(async () => {
  // Cada teste começa isolado: sem sessões residuais da Iris, sem vínculo na Org C, contadores zerados.
  await limparSessoesIris();
  await vinculoIris(null);
  await falhas.limpar(IRIS_EMAIL);
  await limparRateLimit();
});

describe('ciclo de vida da sessão — expiração por INATIVIDADE, sem teto absoluto', () => {
  it('TS-01 — a sessão vale em requisições subsequentes (persistência em banco)', async () => {
    const cookie = cookieDe(await login());

    // Duas requisições autenticadas seguidas, sem novo login: a sessão persiste.
    expect((await getSession(cookie)).status).toBe(200);
    const segunda = await getSession(cookie);
    expect(segunda.status).toBe(200);
    expect(((await segunda.json()) as { user?: { id?: string } })?.user?.id).toBe(IRIS);
  });

  it('TS-02 — usar a sessão ANTES de updateAge não reescreve a expiração', async () => {
    const cookie = cookieDe(await login());
    const antes = await sessaoMaisRecente();
    expect(antes).not.toBeNull();

    // Sessão recém-criada (expiresAt ≈ now+7d): usar agora não passa do limiar de updateAge (1 dia),
    // então o Better Auth NÃO deve reescrever `expiresAt`. Um UPDATE por requisição seria desperdício.
    expect((await getSession(cookie)).status).toBe(200);

    const depois = await sessaoMaisRecente();
    expect(depois!.expiresAt.getTime()).toBe(antes!.expiresAt.getTime());
  });

  it('TS-03 — usar a sessão DEPOIS de updateAge renova por expiresIn (sessão ativa renova)', async () => {
    const cookie = cookieDe(await login());
    const sessao = await sessaoMaisRecente();

    // Simula ~2 dias de uso: expiresAt cai para now+5d. O gatilho do Better Auth
    // (expiresAt - expiresIn + updateAge <= now) passa a valer, então o próximo uso empurra a
    // expiração de volta para ~now+7d. É isto que faz uma sessão ATIVA nunca expirar por inatividade.
    const cincoDias = new Date(Date.now() + 5 * DIA_MS);
    await definirExpiresAt(sessao!.id, cincoDias);

    expect((await getSession(cookie)).status).toBe(200);

    const renovada = await sessaoMaisRecente();
    // Renovada bem além dos 5 dias que gravamos — para ~7 dias a partir de agora.
    expect(renovada!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DIA_MS);
  });

  it('TS-04 — inatividade além de expiresIn invalida (getSession → null → 401)', async () => {
    const cookie = cookieDe(await login());
    const sessao = await sessaoMaisRecente();

    // Envelhece a sessão para o passado: é o equivalente a >7 dias sem uso.
    await definirExpiresAt(sessao!.id, new Date(Date.now() - DIA_MS));

    // A rota de domínio nega: getSession devolve null, o guard traduz em 401.
    expect((await orgAtual(cookie, ORG_C)).status).toBe(401);
  });

  it('TS-05 — sessão adulterada falha FECHADA (401, nunca 200 degradado)', async () => {
    const res = await orgAtual('better-auth.session_token=lixo.assinatura-invalida', ORG_C);
    expect(res.status).toBe(401);
  });

  it('TS-10 — uso CONCORRENTE que dispara o deslize não duplica nem corrompe a sessão', async () => {
    await vinculoIris('ACTIVE');
    const cookie = cookieDe(await login());
    const sessao = await sessaoMaisRecente();

    // Coloca a sessão no ponto de renovar (≈2 dias de uso) e dispara requisições de DOMÍNIO
    // simultâneas. Cada uma passa pelo guard → provider → getSession, que é onde o deslize acontece —
    // e NÃO pelo rate limiter HTTP do Better Auth. Todas tentam renovar a mesma linha ao mesmo tempo.
    //
    // Concorrência moderada (4): o suficiente para exercitar renovação simultânea sem transformar o
    // teste num teste de pressão de pool de conexões (a robustez sob rajada é o débito D-06, à parte).
    await definirExpiresAt(sessao!.id, new Date(Date.now() + 5 * DIA_MS));

    const respostas = await Promise.all(Array.from({ length: 4 }, () => orgAtual(cookie, ORG_C)));
    // Nenhuma requisição fica pelo caminho (sem 401/500) — o deslize concorrente não derruba a sessão.
    expect(respostas.every((r) => r.status === 200)).toBe(true);

    // A renovação convergiu para UM estado coerente: uma única linha (o refresh faz UPDATE, não INSERT
    // — a contagem é uma rede de segurança contra um futuro que rotacione o token) e um `expiresAt`
    // renovado para ~7 dias à frente, não corrompido.
    expect(await prisma.authSession.count({ where: { userId: IRIS } })).toBe(1);
    const final = await sessaoMaisRecente();
    expect(final!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * DIA_MS);
  });
});

describe('logout — sessão corrente, revogação IMEDIATA (RN-012, cookieCache off)', () => {
  it('TS-06 — após o sign-out, a MESMA sessão é recusada imediatamente', async () => {
    const cookie = cookieDe(await login());
    expect((await getSession(cookie)).status).toBe(200); // válida antes

    const out = await signOut(cookie);
    expect(out.status).toBe(200);

    // Sem janela de cache: getSession já não reconhece a sessão, e a rota de domínio dá 401.
    const depois = await getSession(cookie);
    const corpo = (await depois.json()) as { user?: unknown } | null;
    expect(corpo?.user ?? null).toBeNull();
    expect((await orgAtual(cookie, ORG_C)).status).toBe(401);
  });

  it('T012 — logout numa sessão NÃO derruba outra sessão da mesma Account', async () => {
    const cookie1 = cookieDe(await login());
    const cookie2 = cookieDe(await login());
    expect(await prisma.authSession.count({ where: { userId: IRIS } })).toBe(2);

    // RN-012: só a sessão corrente. A outra segue viva — revogação global é 1.10/1.12/1.13.
    expect((await signOut(cookie1)).status).toBe(200);

    expect((await getSession(cookie2)).status).toBe(200);
    expect(await prisma.authSession.count({ where: { userId: IRIS } })).toBe(1);
  });
});

describe('sessão é IDENTIDADE, não autorização (AC2) — Membership revalidada por requisição', () => {
  it('T013 — vínculo ACTIVE dá 200; SUSPENDED e REMOVED dão 403 com a MESMA sessão', async () => {
    await vinculoIris('ACTIVE');
    const cookie = cookieDe(await login());

    // Com Membership ativa na Org C: acessa.
    expect((await orgAtual(cookie, ORG_C)).status).toBe(200);

    // Suspender NÃO exige novo login para ter efeito: a próxima requisição já é negada. Se a sessão
    // carregasse a autorização como verdade cacheada, suspender não tiraria o acesso de ninguém.
    await vinculoIris('SUSPENDED');
    expect((await orgAtual(cookie, ORG_C)).status).toBe(403);

    // Remoção lógica (REMOVED): idem. A linha permanece para auditoria, mas não concede contexto.
    await vinculoIris('REMOVED');
    expect((await orgAtual(cookie, ORG_C)).status).toBe(403);
  });

  it('TS-09 — sessão de uma Organização não acessa outra (isolamento pela via da sessão)', async () => {
    await vinculoIris('ACTIVE'); // Iris é membro APENAS da Org C
    const cookie = cookieDe(await login());

    // Pedir Org A ou Org B com uma sessão que só pertence à Org C: negado. A sessão diz quem a pessoa
    // É, não o que ela PODE — quem decide continua sendo a Membership ativa.
    expect((await orgAtual(cookie, ORG_A)).status).toBe(403);
    expect((await orgAtual(cookie, ORG_B)).status).toBe(403);
    // E a Org C legítima segue acessível.
    expect((await orgAtual(cookie, ORG_C)).status).toBe(200);
  });
});

describe('cookie e log', () => {
  it('TS-08 — em dev o cookie é HttpOnly e SameSite=Lax, SEM Secure, e continua usável', async () => {
    const res = await login();
    const setCookie = setCookieSessao(res);
    expect(setCookie).toBeDefined();

    expect(setCookie!).toMatch(/HttpOnly/i);
    expect(setCookie!).toMatch(/SameSite=Lax/i);
    // Em dev (http) NÃO pode vir Secure — senão o browser recusaria o cookie e o dev não logaria.
    expect(setCookie!).not.toMatch(/;\s*Secure/i);

    // E o cookie de dev É utilizável: prova que não afrouxamos produção para dev funcionar.
    expect((await getSession(cookieDe(res))).status).toBe(200);
  });

  it('TS-07 — em produção (baseURL https) o cookie carrega Secure e HttpOnly', async () => {
    // O que decide o `Secure` no Better Auth é o ESQUEMA do baseURL, não o NODE_ENV: com um
    // `BETTER_AUTH_URL` https — que é exatamente a URL pública real de produção — o cookie de sessão
    // vem `Secure`. Provamos com uma instância cujo baseURL é https; o transporte local segue http,
    // mas o atributo do cookie é o de produção. (Se alguém setasse `advanced.useSecureCookies:false`,
    // este teste ficaria vermelho — é o alvo da mutação M3.)
    const urlAnterior = process.env.BETTER_AUTH_URL;
    process.env.BETTER_AUTH_URL = 'https://api.giraffe.test';

    let prod: INestApplication | undefined;
    try {
      prod = await NestFactory.create(AppModule, { logger: false });
      await prod.listen(0);
      const url = await prod.getUrl();

      const res = await fetch(`${url}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_TESTE },
        body: JSON.stringify({ email: IRIS_EMAIL, password: SENHA }),
      });
      expect(res.status).toBe(200);

      const setCookie = (res.headers.getSetCookie?.() ?? []).find((c) => /session_token=/i.test(c));
      expect(setCookie).toBeDefined();
      expect(setCookie!).toMatch(/;\s*Secure/i);
      expect(setCookie!).toMatch(/HttpOnly/i);
    } finally {
      process.env.BETTER_AUTH_URL = urlAnterior;
      await prod?.close();
    }
  });

  it('TS-11 — nenhum token de sessão / cookie aparece no log', async () => {
    // Sobe uma instância com o log LIGADO, captura tudo que ela escreve, e prova que o token de sessão
    // (que viaja no Set-Cookie e volta no header cookie) não está lá — a redaction cobre cookie/set-cookie.
    const nivelAnterior = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';

    // Forçamos NODE_ENV≠development para ESTA instância. Em desenvolvimento o `AppModule` liga o
    // transport `pino-pretty`, e um transport do pino roda num WORKER THREAD que escreve direto no
    // descritor de arquivo 1 — fora da main thread, contornando a interceptação de
    // `process.stdout.write` abaixo (a captura viria vazia, como acontece localmente quando o `.env`
    // define NODE_ENV=development). Sem o transport, o pino serializa o log em JSON e o escreve de
    // forma síncrona no `process.stdout` — que é, também, exatamente o caminho de log de PRODUÇÃO.
    const ambienteAnterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const capturado: string[] = [];
    const stdoutReal = process.stdout.write.bind(process.stdout);
    const stderrReal = process.stderr.write.bind(process.stderr);
    const capturar =
      (real: typeof stdoutReal) =>
      (chunk: unknown, ...resto: unknown[]): boolean => {
        capturado.push(typeof chunk === 'string' ? chunk : String(chunk));
        return (real as (...args: unknown[]) => boolean)(chunk, ...resto);
      };
    (process.stdout as { write: unknown }).write = capturar(stdoutReal);
    (process.stderr as { write: unknown }).write = capturar(stderrReal);

    let comLog: INestApplication | undefined;
    try {
      comLog = await NestFactory.create(AppModule);
      await comLog.listen(0);
      const url = await comLog.getUrl();

      const res = await fetch(`${url}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': IP_TESTE },
        body: JSON.stringify({ email: IRIS_EMAIL, password: SENHA }),
      });
      const cookieHeader = (res.headers.getSetCookie?.() ?? [])
        .map((c) => c.split(';')[0])
        .join('; ');
      const token = decodeURIComponent(
        (res.headers.getSetCookie?.() ?? [])
          .find((c) => /session_token=/i.test(c))
          ?.split(';')[0]
          ?.split('=')
          .slice(1)
          .join('=') ?? '',
      ).split('.')[0]!;

      await fetch(`${url}/organizations/current`, { headers: { cookie: cookieHeader } });
      await fetch(`${url}/api/auth/sign-out`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': IP_TESTE,
          cookie: cookieHeader,
        },
        body: '{}',
      });

      await new Promise((r) => setTimeout(r, 100)); // deixa o pino-http descarregar o log da resposta

      const tudo = capturado.join('');
      // Guarda contra falso-positivo: exigimos que HOUVE log capturado da app (ver o NODE_ENV
      // forçado acima — em dev o transport de worker thread escaparia desta captura).
      expect(tudo.length).toBeGreaterThan(0);
      expect(tudo).toContain('giraffe-api');

      // O essencial: o token de sessão não aparece em lugar nenhum do que foi logado.
      expect(token.length).toBeGreaterThan(10);
      expect(tudo).not.toContain(token);
    } finally {
      (process.stdout as { write: unknown }).write = stdoutReal;
      (process.stderr as { write: unknown }).write = stderrReal;
      process.env.LOG_LEVEL = nivelAnterior;
      process.env.NODE_ENV = ambienteAnterior;
      await comLog?.close();
    }
  });
});

afterEach(async () => {
  // Segurança extra: se um teste subiu instância própria e falhou antes de fechar, o afterAll fecha a
  // principal; aqui só garantimos que sessões/vínculos residuais não vazem para o próximo teste.
  await limparSessoesIris();
  await vinculoIris(null);
});
