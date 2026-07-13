import 'reflect-metadata';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/kernel/db/prisma.service';

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
    // Esta é também a regressão do deadline da sonda: é a PRIMEIRA consulta ao banco no
    // processo, e portanto a que paga a subida do engine do Prisma (~2s medidos). Um
    // deadline apertado demais reprova aqui um banco perfeitamente saudável — que é
    // exatamente o momento em que o orquestrador pergunta se pode mandar tráfego.
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

/**
 * Banco fora do ar. Não dá para derrubar o Postgres no meio da suíte, então trocamos
 * APENAS o adaptador de banco — o `HealthController` é o real, e o stack HTTP do Nest
 * (roteamento, filtro de exceção, serialização) é o real. É o filtro de verdade que
 * transforma a `ServiceUnavailableException` em 503.
 */
@Module({
  controllers: [HealthController],
  providers: [{ provide: PrismaService, useValue: { isReachable: () => Promise.resolve(false) } }],
})
class BancoIndisponivelModule {}

describe('readiness com banco indisponível (HTTP)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(BancoIndisponivelModule, { logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ready responde 503 quando o banco não responde', async () => {
    // Esconder a indisponibilidade seria mentir sobre o estado do serviço: com o banco
    // fora, a API não está apta a receber tráfego, e o orquestrador precisa saber disso.
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(503);
  });

  it('o corpo do 503 não vaza host, porta, usuário nem stack do driver', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    const corpo = JSON.stringify(await res.json());

    // A mensagem de erro do driver carrega a string de conexão inteira. Nada disso
    // pode chegar ao cliente (AD-29/NFR-1).
    expect(corpo).not.toMatch(/postgres|5432|5434|giraffe_app|password|at .*\.ts:/i);
  });

  it('GET /health continua 200 mesmo com o banco fora', async () => {
    // Liveness ≠ readiness. O processo está vivo; reiniciá-lo não traria o banco de volta.
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

/**
 * O caso que um `$connect()` ansioso no `onModuleInit` quebrava: banco inalcançável já NO
 * BOOT. Antes, a aplicação morria antes de abrir a porta — sem `/health`, sem `/ready`, sem
 * 503 —, o que tornava o `/ready` inútil justamente quando ele mais importa.
 *
 * Aqui a aplicação REAL sobe (nada é substituído) apontando para um banco inexistente.
 */
describe('boot com banco inalcançável (aplicação real)', () => {
  let app: INestApplication;
  let baseUrl: string;
  // Restaurar SÓ a DATABASE_URL deixava CORS_ALLOWED_ORIGINS e LOG_LEVEL forçados para quem
  // viesse depois — teste passando (ou falhando) por estado herdado, não pelo que afirma.
  const envOriginal = { ...process.env };

  beforeAll(async () => {
    // Porta 1: recusa a conexão de imediato, sem pagar timeout.
    process.env.DATABASE_URL = 'postgresql://ninguem:nada@127.0.0.1:1/inexistente?schema=public';
    process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
    process.env.LOG_LEVEL = 'silent';

    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    process.env = { ...envOriginal };
  });

  it('a aplicação sobe: banco fora é falha de dependência, não erro de configuração', () => {
    expect(baseUrl).toMatch(/^http:\/\//);
  });

  it('GET /health responde 200 — o processo está vivo', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /ready responde 503 — e não vaza a string de conexão', async () => {
    const res = await fetch(`${baseUrl}/ready`);
    expect(res.status).toBe(503);

    const corpo = JSON.stringify(await res.json());
    expect(corpo).not.toMatch(/127\.0\.0\.1|ninguem|nada|inexistente|postgresql:\/\//i);
  });
});
