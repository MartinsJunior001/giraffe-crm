import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { G2_MAX, ROTA_LOGIN } from '../src/kernel/auth/auth.factory';
import { assinarHop, type PayloadHop } from '../src/kernel/auth/internal-hop';
import { PrismaClient } from '../generated/prisma';

/**
 * Hop Web→API autenticado (D-01) LIGADO — `AppModule` REAL, HTTP real, PostgreSQL real, com
 * `INTERNAL_HMAC_SECRET` configurado (modo hop). Prova o que os testes puros não podem: que a rejeição
 * fail-closed está de fato no caminho de auth (403), que uma prova válida é aceita, e que o IP do
 * envelope assinado — não o socket — é a chave do G2.
 *
 * Regressão de segurança OBRIGATÓRIA do D-01: XFF forjado, chamada direta e replay (tech story, gates).
 */

const SEGREDO = 'hop-secret-de-teste-com-mais-de-32-chars-xyz';
const KEY_VERSION = 1;
const ROTA = '/api/auth/sign-in/email';
const SENHA_ERRADA = 'senha-obviamente-errada-999';
const ANA = 'ana@exemplo.test';

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient;
let envAnterior: { secret?: string; versao?: string };

function assinarPara(ip: string, over: Partial<PayloadHop> = {}, agora = Date.now()): string {
  return assinarHop({ v: KEY_VERSION, ts: agora, ip, m: 'POST', p: ROTA, ...over }, SEGREDO);
}

function post(
  headers: Record<string, string>,
  email = ANA,
  password = SENHA_ERRADA,
): Promise<Response> {
  return fetch(`${baseUrl}${ROTA}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', ...headers },
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Zera os baldes do G2 da rota de login, EXCETO a faixa `203.0.113.*` (TEST-NET-3) que pertence às
 * suítes de contagem exata (`rate-limit-native`) — o mesmo recorte do `login-http`, para não zerar o
 * contador do vizinho no meio de uma contagem sob execução paralela. Esta suíte usa `198.51.100.*`.
 */
async function limparRate(): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM "RateLimit"
    WHERE "key" LIKE ${'%' + ROTA_LOGIN} AND "key" NOT LIKE ${'203.0.113.%'}
  `;
}

beforeAll(async () => {
  envAnterior = {
    secret: process.env.INTERNAL_HMAC_SECRET,
    versao: process.env.INTERNAL_HMAC_KEY_VERSION,
  };
  process.env.INTERNAL_HMAC_SECRET = SEGREDO;
  process.env.INTERNAL_HMAC_KEY_VERSION = String(KEY_VERSION);
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';

  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.$connect();

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await limparRate();
  await app.close();
  await prisma.$disconnect();
  // Restaura o ambiente para não vazar o modo hop a outros arquivos no run serial.
  if (envAnterior.secret === undefined) delete process.env.INTERNAL_HMAC_SECRET;
  else process.env.INTERNAL_HMAC_SECRET = envAnterior.secret;
  if (envAnterior.versao === undefined) delete process.env.INTERNAL_HMAC_KEY_VERSION;
  else process.env.INTERNAL_HMAC_KEY_VERSION = envAnterior.versao;
});

beforeEach(limparRate);

describe('fail-closed (AC2/AC3/AC4)', () => {
  it('X-Forwarded-For forjado SEM hop ⇒ 403 (declara IP sem prova)', async () => {
    const res = await post({ 'x-forwarded-for': '203.0.113.9' });
    expect(res.status).toBe(403);
  });

  it('chamada direta SEM hop e SEM XFF ⇒ NÃO 403 (cai para o socket): login processa', async () => {
    // Probe/loopback/cliente direto que não forja nada: o socket é o IP. A credencial inválida dá 401.
    const res = await post({});
    expect(res.status).toBe(401);
  });

  it('hop com assinatura inválida ⇒ 403', async () => {
    const header = assinarPara('198.51.100.10');
    const adulterado = header.slice(0, -2) + (header.endsWith('00') ? '11' : '00');
    const res = await post({ 'x-internal-hop': adulterado });
    expect(res.status).toBe(403);
  });

  it('hop assinado por segredo ERRADO ⇒ 403', async () => {
    const header = assinarHop(
      { v: KEY_VERSION, ts: Date.now(), ip: '198.51.100.11', m: 'POST', p: ROTA },
      'segredo-do-atacante-com-mais-de-32-caracteres',
    );
    const res = await post({ 'x-internal-hop': header });
    expect(res.status).toBe(403);
  });
});

describe('replay / expiração (AC5)', () => {
  it('hop com timestamp velho (fora da janela) ⇒ 403', async () => {
    const header = assinarPara('198.51.100.12', {}, Date.now() - 120_000);
    const res = await post({ 'x-internal-hop': header });
    expect(res.status).toBe(403);
  });

  it('prova de OUTRA rota reusada no login ⇒ 403 (amarração método+caminho)', async () => {
    const header = assinarPara('198.51.100.13', { p: '/organizations/current' });
    const res = await post({ 'x-internal-hop': header });
    expect(res.status).toBe(403);
  });
});

describe('prova válida (AC1)', () => {
  it('hop válido ⇒ NÃO 403: o login processa (401 por credencial inválida)', async () => {
    const res = await post({ 'x-internal-hop': assinarPara('198.51.100.20') });
    expect(res.status).toBe(401);
  });

  it('o IP do HOP é a chave do G2 — o mesmo IP estoura o limite', async () => {
    // G2 conta por IP+rota. Com o hop, a chave é o IP PROVADO (não o socket). Vários hops do MESMO IP
    // caem no mesmo balde: a (G2_MAX+1)ª é 429.
    const ip = '198.51.100.30';
    for (let i = 0; i < G2_MAX; i++) {
      const r = await post({ 'x-internal-hop': assinarPara(ip) }, `spray-${i}@exemplo.test`);
      expect(r.status).not.toBe(429);
    }
    const excedente = await post({ 'x-internal-hop': assinarPara(ip) }, 'spray-final@exemplo.test');
    expect(excedente.status).toBe(429);
  });

  it('IPs de HOP diferentes NÃO compartilham balde (seria o socket, se o hop fosse ignorado)', async () => {
    // Se a API ainda usasse o socket (loopback) como chave, todos cairiam no mesmo balde e a
    // (G2_MAX+1)ª seria 429. Com o IP do hop discriminando, cada IP tem o seu — nenhuma é 429.
    for (let i = 0; i <= G2_MAX; i++) {
      const r = await post(
        { 'x-internal-hop': assinarPara(`198.51.100.${100 + i}`) },
        `u-${i}@exemplo.test`,
      );
      expect(r.status).not.toBe(429);
    }
  });
});
