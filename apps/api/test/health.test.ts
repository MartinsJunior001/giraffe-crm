import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

/**
 * Integração HTTP real: sobe o AppModule completo (módulos, controllers, decorators,
 * rotas) em porta efêmera e faz requisições de verdade. Um teste que apenas chamasse
 * `livenessPayload()` continuaria verde se a rota fosse renomeada ou se o módulo saísse
 * dos imports — este falha, que é exatamente o ponto (AC1/AC2).
 */
describe('health/readiness (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    // Ambiente mínimo válido: o factory do logger valida o env no boot (fail-fast).
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'silent';

    app = await NestFactory.create(AppModule, { logger: false });
    // Porta 0 = efêmera: não conflita com um ambiente já em execução.
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health responde 200 com exatamente { status: "ok" }', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'ok' });
    // Nenhuma chave além de `status` — sem versão, host, env ou segredo (AC2/AD-29).
    expect(Object.keys(body)).toEqual(['status']);
  });

  it('GET /ready responde 200 com exatamente { status: "ok" }', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ status: 'ok' });
    expect(Object.keys(body)).toEqual(['status']);
  });

  it('rota não declarada responde 404 (só as rotas do contrato existem)', async () => {
    const res = await fetch(`${baseUrl}/status`);
    expect(res.status).toBe(404);
  });
});
