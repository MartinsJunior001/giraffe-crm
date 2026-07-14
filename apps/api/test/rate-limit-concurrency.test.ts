import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../generated/prisma';

/**
 * Guarda de regressão do **D-06** pela porta da frente: HTTP real, `AppModule` real (Better Auth como em
 * produção), PostgreSQL real, **pool restrito** e rajada **concorrente** contra a MESMA chave de `/api/auth/*`.
 *
 * O D-06 descrevia um defeito de uma versão ANTERIOR do Better Auth: o rate limiter em `storage: 'database'`
 * abria UMA transação por requisição e, sob rajada concorrente com o pool apertado, as transações competiam
 * e parte das respostas virava **500** em vez do 429 correto. O upgrade ao Better Auth **1.6.23 já resolveu
 * isso** — o `storage: 'database'` desta versão é atômico (read + `incrementOne` com guarda `count < max` +
 * retry otimista, verificado na fonte). Este teste **prova** que a rajada concorrente com pool restrito **não**
 * produz 500 no store NATIVO (SC-D06-1/6): sem código custom, só o Better Auth de produção. A prova de
 * limite/429/Retry-After/contador/fail-closed e a fase vermelha (não-atômico vaza) estão em
 * `rate-limit-native.test.ts`.
 *
 * ## Isolamento do contador
 * A rota exercitada é `/api/auth/sign-out` — de propósito. O contador do Better Auth é chaveado por
 * `${ip}|${rota}`; `sign-out` cai num balde diferente do `sign-in/email` que `login-http.test.ts` usa e
 * limpa. Assim esta rajada **não** contamina o contador daquele arquivo (nem vice-versa), e os dois
 * arquivos rodam em paralelo sem interferência. `zero 500` é robusto a qualquer interferência: uma
 * limpeza concorrente do contador só trocaria 429 por 200/40x — nunca criaria um 500.
 */

const N = 24; // ≥ 16 concorrentes, como exige o critério

let app: INestApplication;
let baseUrl: string;
let prisma: PrismaClient;
let urlOriginal: string | undefined;

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';

  // Pool RESTRITO para reproduzir a contenção que produzia o 500 na versão ANTIGA (transação por
  // requisição). O store atômico do Better Auth 1.6.23 termina folgado sob a mesma restrição.
  urlOriginal = process.env.DATABASE_URL;
  const sep = (urlOriginal ?? '').includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${urlOriginal ?? ''}${sep}connection_limit=1&pool_timeout=5`;

  // Cliente de limpeza usa a URL ORIGINAL (sem restrição) — só a app roda no pool apertado.
  prisma = new PrismaClient({ datasourceUrl: urlOriginal });
  await prisma.$connect();

  app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0);
  baseUrl = await app.getUrl();
});

afterAll(async () => {
  await app.close();
  // Restaura a env para não vazar a restrição para outros arquivos (defesa extra — o pool 'forks' já
  // isola o processo).
  process.env.DATABASE_URL = urlOriginal;
  // Limpa o balde de sign-out desta execução (não é lixo expirado, então a coleta não o levaria).
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE ${'%/sign-out'}`;
  await prisma.$disconnect();
});

describe('rate limiter sob rajada concorrente (D-06)', () => {
  it(`${N} requisições concorrentes a /api/auth/* NÃO produzem 500 (SC-D06-1/6)`, async () => {
    const respostas = await Promise.all(
      Array.from({ length: N }, () =>
        fetch(`${baseUrl}/api/auth/sign-out`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        }),
      ),
    );
    const status = respostas.map((r) => r.status);

    // O coração do D-06: nenhuma resposta é 500 por contenção de transação.
    expect(status.filter((s) => s === 500)).toHaveLength(0);
    // Toda requisição obteve resposta (nenhuma caiu por erro de conexão/pool_timeout).
    expect(status).toHaveLength(N);
    // E nenhuma é erro de servidor (5xx) — o limiter nega com 429, nunca com 5xx.
    expect(status.filter((s) => s >= 500)).toHaveLength(0);
  });

  it('o limiter de fato engajou: há contador de rate limit para a rota (SC-D06-6)', async () => {
    // Prova que a rajada passou pelo limiter nativo (e não que a rota simplesmente ignora o limiter):
    // existe uma linha `RateLimit` para o balde de sign-out, com contagem > 0.
    const linhas = await prisma.$queryRaw<{ count: number }[]>`
      SELECT "count" FROM "RateLimit" WHERE "key" LIKE ${'%/sign-out'} ORDER BY "count" DESC LIMIT 1
    `;
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas[0]!.count).toBeGreaterThan(0);
  });
});
