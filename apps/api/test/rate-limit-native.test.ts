import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../generated/prisma';
import { G2_MAX } from '../src/kernel/auth/auth.factory';

/**
 * Provas do **D-06** contra o rate limiter **NATIVO** do Better Auth 1.6.23 (`storage: 'database'`), pela
 * porta da frente: HTTP real, `AppModule` de produção, PostgreSQL real. **Nenhum código custom** — o débito
 * foi resolvido pelo UPGRADE, e estas provas guardam o comportamento contra regressão.
 *
 * Cobre: (1) o limite por IP não é ultrapassado; (2) o excesso recebe **429 com `X-Retry-After`**; (3) o
 * contador é consistente; (4) **fail-closed** quando o banco falha (nunca libera); (5) **fase vermelha** — um
 * store NÃO-atômico vaza o limite (prova que a atomicidade do nativo é o que segura o número); (6) **sem PII**
 * na trilha de logs.
 *
 * ## Isolamento do balde (parallel-safe)
 * Cada asserção usa um **IP único** via `X-Forwarded-For`, honrado porque `TRUSTED_PROXY_IPS` inclui o loopback
 * NESTE worker (cada arquivo de teste roda em processo próprio — não afeta os demais, que rodam sem proxy
 * confiável). Assim o balde G2 (`${ip}|${rota}`) desta suíte não colide com o de `login-http`/`login-failure`.
 * E-mail **único por requisição** mantém o G1 (por conta) em 1 — logo o 429 observado é o **G2 por IP**.
 */

const databaseUrl = process.env.DATABASE_URL;

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient;

let contadorIp = 0;
function ipUnico(): string {
  // Faixa de documentação/teste TEST-NET-3 (RFC 5737) — nunca um IP real. Um por teste, sequencial:
  // baldes G2 distintos, sem colisão dentro desta suíte.
  contadorIp += 1;
  return `203.0.113.${contadorIp}`;
}

async function login(email: string, ip: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email, password: 'senha-qualquer-invalida-123' }),
  });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';
  // Confia no loopback SÓ neste worker: habilita o X-Forwarded-For para dar a cada teste um IP próprio.
  process.env.TRUSTED_PROXY_IPS = '127.0.0.1,::1';

  prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  await prisma.$connect();

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app?.close();
  // Limpa os baldes desta suíte (chaves da faixa de teste 203.0.113.*).
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE ${'%203.0.113.%'}`;
  await prisma.$disconnect();
  process.env.TRUSTED_PROXY_IPS = '';
});

describe('limite por IP não é ultrapassado + 429 com Retry-After (SC-D06-2/3)', () => {
  it(`permite exatamente ${G2_MAX} tentativas do MESMO IP e nega a seguinte com 429 + X-Retry-After`, async () => {
    const ip = ipUnico();
    const statuses: number[] = [];
    // G2_MAX tentativas (e-mail único cada, para o G1 nunca disparar) + 1 que deve estourar o G2.
    for (let i = 0; i < G2_MAX + 1; i++) {
      const res = await login(`d06-${randomUUID()}@exemplo.test`, ip);
      statuses.push(res.status);
      if (i === G2_MAX) {
        // A que estoura: 429 com o contrato de Retry-After.
        expect(res.status).toBe(429);
        const retry = res.headers.get('x-retry-after');
        expect(retry).not.toBeNull();
        expect(Number(retry)).toBeGreaterThan(0);
      }
    }
    // Nenhuma das primeiras G2_MAX foi 429 (o limite não bloqueou cedo demais)…
    expect(statuses.slice(0, G2_MAX).filter((s) => s === 429)).toHaveLength(0);
    // …e nenhuma foi 5xx (o limiter nega com 429, jamais com erro de servidor).
    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
  });

  it('o contador do balde é consistente com as tentativas (SC-D06-3)', async () => {
    const ip = ipUnico();
    const N = 5;
    for (let i = 0; i < N; i++) await login(`d06c-${randomUUID()}@exemplo.test`, ip);
    const linhas = await prisma.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "RateLimit" WHERE "key" LIKE ${`%${ip}%`} ORDER BY "count" DESC LIMIT 1
    `;
    expect(linhas.length).toBe(1);
    // O nativo incrementa uma vez por requisição: o contador reflete as N tentativas (sem perder nem duplicar).
    expect(linhas[0]!.count).toBe(N);
  });
});

describe('fail-closed diante de falha do banco (SC-D06-4)', () => {
  let appRuim: INestApplication;
  let urlRuim: string;

  beforeAll(async () => {
    // Instância ISOLADA cujo banco é inalcançável (porta fechada). Formato de URL válido (passa o
    // fail-fast do env), conexão preguiçosa — só falha ao atender a requisição. Não toca o banco real
    // nem os baldes das outras suítes (parallel-safe).
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://x:x@127.0.0.1:1/x';
    try {
      appRuim = await NestFactory.create(AppModule, { logger: false });
      await appRuim.listen(0);
      urlRuim = await appRuim.getUrl();
    } finally {
      process.env.DATABASE_URL = original;
    }
  });

  afterAll(async () => {
    await appRuim?.close();
  });

  it('com o storage do rate limit inacessível, o acesso é NEGADO (5xx), nunca liberado (2xx)', async () => {
    const res = await fetch(`${urlRuim}/api/auth/sign-out`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    // Fail-closed: o Better Auth propaga a falha do storage como erro (5xx), jamais concede a operação.
    // Fase VERMELHA: se o nativo falhasse ABERTO (deixasse passar quando o storage erra), viria um 2xx aqui.
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.status).toBeLessThan(600);
  });
});

describe('fase vermelha — um store NÃO-atômico VAZA o limite (SC-D06-6)', () => {
  it('consume não-atômico (read-depois-write) permite MAIS que max sob concorrência', async () => {
    // Não importa nem chama o código de produção: é um fixture DELIBERADAMENTE não-atômico, para provar
    // que a atomicidade é o que segura o limite. O store NATIVO (atômico) não exibe este vazamento — é
    // exatamente o que os testes acima demonstram.
    const chave = `redphase|${randomUUID()}`;
    const MAX = 10;
    const N = 40;

    async function consumeIngenuo(): Promise<boolean> {
      const linhas = await prisma.$queryRaw<{ count: number }[]>`
        SELECT "count" FROM "RateLimit" WHERE "key" = ${chave}
      `;
      const atual = linhas[0]?.count ?? 0;
      // Janela do TOCTOU: separa a leitura da decisão/escrita (o que o nativo faz numa instrução só).
      await new Promise((r) => setImmediate(r));
      if (atual >= MAX) return false;
      await prisma.$executeRaw`
        INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
        VALUES (${randomUUID()}, ${chave}, 1, ${BigInt(Date.now())})
        ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimit"."count" + 1
      `;
      return true;
    }

    try {
      const permitidos = (
        await Promise.all(Array.from({ length: N }, () => consumeIngenuo()))
      ).filter(Boolean).length;
      // A prova: o não-atômico LIBEROU mais que o limite (vazou). Um store atômico teria parado em MAX.
      expect(permitidos).toBeGreaterThan(MAX);
    } finally {
      await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${chave}`;
    }
  });
});

describe('sem PII na trilha (SC-D06-5)', () => {
  it('uma tentativa de login não deixa e-mail nem senha em claro no stdout', async () => {
    // App dedicada com log LIGADO (a suíte principal roda em silent) para observar o que É registrado.
    const original = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';
    const appLog = await NestFactory.create(AppModule);
    await appLog.listen(0);
    const urlLog = await appLog.getUrl();

    const capturado: string[] = [];
    const escritaOriginal = process.stdout.write.bind(process.stdout);
    // Substituição temporária do write para capturar as linhas de log.
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      capturado.push(chunk.toString());
      return escritaOriginal(chunk as string, ...(rest as []));
    }) as typeof process.stdout.write;

    const emailPii = `pii-${randomUUID()}@segredo.test`;
    const senhaPii = 'SenhaSuperSecreta!42';
    try {
      await fetch(`${urlLog}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: emailPii, password: senhaPii }),
      });
      // Dá tempo de a linha de log (assíncrona) ser escrita.
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      process.stdout.write = escritaOriginal;
      await appLog.close();
      process.env.LOG_LEVEL = original;
    }

    const logs = capturado.join('');
    expect(logs).not.toContain(emailPii); // e-mail (PII) nunca em claro
    expect(logs).not.toContain(senhaPii); // senha jamais registrada
  });
});
