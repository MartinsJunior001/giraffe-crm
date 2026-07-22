import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AUTH } from '../src/kernel/auth/auth.tokens';
import {
  SECURITY_NOTIFICATION_PORT,
  type SecurityNotificationPort,
  type SenhaAlteradaEvento,
} from '../src/kernel/auth/security-notification.port';
import { PrismaClient } from '../generated/prisma';

/**
 * Troca AUTENTICADA de senha com step-up (Story 1.12) pela porta da frente: `AppModule` REAL, HTTP
 * real, PostgreSQL real, Better Auth real. NADA de principal falso — o ponto da Story é que a
 * reautenticação confere a senha DE VERDADE.
 *
 * As contas são DESCARTÁVEIS (e-mail `randomUUID`), criadas pelo papel MIGRATOR (o runtime tem
 * SELECT-only em `Account`, e o cadastro está desligado). Trocar a senha de uma conta do seed
 * envenenaria os outros arquivos que logam com ela — por isso, jamais o seed aqui.
 *
 * A notificação de segurança é observada por um SPY (override do port), mantendo todo o resto real.
 */

const SENHA_INICIAL = 'giraffe-vale-do-sol-42';
const SENHA_NOVA = 'montanha-azul-do-norte-77';
const SENHA_ERRADA = 'senha-obviamente-incorreta-000';

let app: INestApplication;
let baseUrl: string;
let migrator: PrismaClient;
let hashSenha: (senha: string) => Promise<string>;

/** Spy da notificação de segurança: registra os eventos emitidos, sem entregar nada. */
const notificacoes: SenhaAlteradaEvento[] = [];
const notificacaoSpy: SecurityNotificationPort = {
  notificarSeguranca(evento) {
    notificacoes.push(evento);
    return Promise.resolve();
  },
};

async function criarConta(senha: string): Promise<{ id: string; email: string }> {
  const email = `wt112-${randomUUID()}@exemplo.test`;
  const conta = await migrator.account.create({
    data: { email, name: 'Conta de Teste 1.12', emailVerified: true },
    select: { id: true },
  });
  const hash = await hashSenha(senha);
  await migrator.authCredential.create({
    data: {
      id: randomUUID(),
      accountId: conta.id,
      providerId: 'credential',
      userId: conta.id,
      password: hash,
    },
  });
  return { id: conta.id, email };
}

function cookieDe(res: Response): string {
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
}

async function login(email: string, senha: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  if (res.status !== 200) throw new Error(`login falhou (${res.status})`);
  return cookieDe(res);
}

function stepUp(cookie: string, senhaAtual: unknown): Promise<Response> {
  return fetch(`${baseUrl}/me/step-up`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ senhaAtual }),
  });
}

function trocar(cookie: string, novaSenha: unknown): Promise<Response> {
  return fetch(`${baseUrl}/me/password`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ novaSenha }),
  });
}

beforeAll(async () => {
  process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
  process.env.LOG_LEVEL = 'silent';

  migrator = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  await migrator.$connect();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SECURITY_NOTIFICATION_PORT)
    .useValue(notificacaoSpy)
    .compile();

  app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  await app.listen(0);
  baseUrl = await app.getUrl();

  const auth = app.get(AUTH);
  hashSenha = async (senha: string) => (await auth.$context).password.hash(senha);
});

afterAll(async () => {
  // Apaga as contas descartáveis criadas por este arquivo (cascata em AuthCredential/AuthSession).
  await migrator.account.deleteMany({ where: { email: { startsWith: 'wt112-' } } });
  await migrator.authVerification.deleteMany({
    where: { identifier: { startsWith: 'reset-password:wt112-' } },
  });
  await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%'`;
  await app.close();
  await migrator.$disconnect();
});

beforeEach(async () => {
  notificacoes.length = 0;
  // DB dedicado deste worktree: limpar os baldes de rate limit (login por IP + step-up) evita que a
  // contagem de um teste vaze para o seguinte.
  await migrator.$executeRaw`DELETE FROM "RateLimit" WHERE "key" LIKE 'stepup:%' OR "key" LIKE '%/sign-in/email'`;
});

describe('gate de step-up', () => {
  it('sem step-up prévio, a troca é recusada com 403 STEP_UP_REQUIRED', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);

    const res = await trocar(cookie, SENHA_NOVA);

    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });

  it('com step-up válido, a troca é aceita (200) — a prova de que o 403 acima não é trivial', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);

    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);
    const res = await trocar(cookie, SENHA_NOVA);

    expect(res.status).toBe(200);
    const corpo = (await res.json()) as {
      sessoesRevogadas: number;
      recuperacoesInvalidadas: number;
    };
    expect(corpo).toHaveProperty('sessoesRevogadas');
  });

  it('step-up EXPIRADO (janela vencida) → 403, como se não houvesse', async () => {
    const { id, email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);
    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);

    // Força o vencimento da janela (o marcador step-up:<sessionId> deste titular).
    await migrator.$executeRaw`
      UPDATE "AuthVerification" SET "expiresAt" = now() - interval '1 minute'
      WHERE "identifier" LIKE 'step-up:%' AND "value" = ${id}
    `;

    const res = await trocar(cookie, SENHA_NOVA);
    expect(res.status).toBe(403);
    expect((await res.json()) as { erro: string }).toMatchObject({ erro: 'STEP_UP_REQUIRED' });
  });

  it('a janela é de USO ÚNICO: após uma troca, uma segunda exige novo step-up', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);
    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);

    expect((await trocar(cookie, SENHA_NOVA)).status).toBe(200);
    // Sem novo step-up, a segunda troca (senha ainda mais nova) é barrada.
    const segunda = await trocar(cookie, 'terceira-senha-longa-99');
    expect(segunda.status).toBe(403);
  });
});

describe('reautenticação (step-up)', () => {
  it('senha atual incorreta → 401 não-enumerante (mesmo corpo/status de "sem sessão" quanto à senha)', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);

    const res = await stepUp(cookie, SENHA_ERRADA);
    expect(res.status).toBe(401);
    const corpo = await res.text();
    // Não revela QUE foi a senha (nada de "senha inválida"/"incorreta"): resposta neutra.
    expect(corpo.toLowerCase()).not.toMatch(/senha|password|incorret|inválid|não confere/);
  });

  it('senha atual correta → 204 e a janela passa a valer (a troca subsequente é aceita)', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);

    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);
    expect((await trocar(cookie, SENHA_NOVA)).status).toBe(200);
  });

  it('sem sessão, o step-up é 401', async () => {
    const res = await stepUp('', SENHA_INICIAL);
    expect(res.status).toBe(401);
  });

  it('≤5 falhas por (Account+IP) em 15 min; a 6ª falha → 429 (D-1)', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);

    const status: number[] = [];
    for (let i = 0; i < 6; i++) status.push((await stepUp(cookie, SENHA_ERRADA)).status);

    // As 5 primeiras falhas são 401; a 6ª estoura o teto e vira 429.
    expect(status.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(status[5]).toBe(429);
  });
});

describe('política central na troca (via HTTP)', () => {
  async function comStepUp(): Promise<string> {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);
    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);
    return cookie;
  }

  it('nova senha com 14 caracteres → 400 SENHA_FRACA (CURTA)', async () => {
    const cookie = await comStepUp();
    const res = await trocar(cookie, 'a'.repeat(14));
    expect(res.status).toBe(400);
    expect((await res.json()) as { erro: string; motivo: string }).toMatchObject({
      erro: 'SENHA_FRACA',
      motivo: 'CURTA',
    });
  });

  it('nova senha comum (≥15) → 400 SENHA_FRACA (COMUM), rejeição LOCAL', async () => {
    const cookie = await comStepUp();
    const res = await trocar(cookie, 'passwordpassword');
    expect(res.status).toBe(400);
    expect((await res.json()) as { motivo: string }).toMatchObject({ motivo: 'COMUM' });
  });

  it('nova senha forte (15 chars) → 200', async () => {
    const cookie = await comStepUp();
    const res = await trocar(cookie, 'giraffemontanha'); // 15, letras só (sem exigência de classes)
    expect(res.status).toBe(200);
  });
});

describe('efeitos da troca bem-sucedida', () => {
  it('preserva a sessão ATUAL e revoga TODAS as demais (prova real)', async () => {
    const { id, email } = await criarConta(SENHA_INICIAL);

    // Duas sessões independentes da MESMA conta (dois logins → dois cookies).
    const cookieA = await login(email, SENHA_INICIAL);
    const cookieB = await login(email, SENHA_INICIAL);

    const antes = await migrator.authSession.count({ where: { userId: id } });
    expect(antes).toBe(2);

    // Step-up e troca na sessão A.
    expect((await stepUp(cookieA, SENHA_INICIAL)).status).toBe(204);
    const troca = await trocar(cookieA, SENHA_NOVA);
    expect(troca.status).toBe(200);
    expect((await troca.json()) as { sessoesRevogadas: number }).toMatchObject({
      sessoesRevogadas: 1,
    });

    // Só a sessão A sobrevive no banco.
    const depois = await migrator.authSession.count({ where: { userId: id } });
    expect(depois).toBe(1);

    // Prova viva: a sessão A ainda autentica E a NOVA senha vale (step-up com ela → 204).
    expect((await stepUp(cookieA, SENHA_NOVA)).status).toBe(204);
    // A sessão B foi revogada: getSession não a encontra → 401.
    expect((await stepUp(cookieB, SENHA_NOVA)).status).toBe(401);
    // A senha ANTIGA não vale mais na sessão A (401 não-enumerante).
    expect((await stepUp(cookieA, SENHA_INICIAL)).status).toBe(401);
  });

  it('invalida a recuperação pendente do titular — e SÓ dele', async () => {
    const alvo = await criarConta(SENHA_INICIAL);
    const outro = await criarConta(SENHA_INICIAL);

    // Semeia tokens de recuperação com a convenção REAL do Better Auth 1.6.23:
    // identifier = `reset-password:<token>`, value = <accountId>.
    const tokenAlvo = `wt112-${randomUUID()}`;
    const tokenOutro = `wt112-${randomUUID()}`;
    const futuro = new Date(Date.now() + 3600_000);
    await migrator.authVerification.createMany({
      data: [
        {
          id: randomUUID(),
          identifier: `reset-password:${tokenAlvo}`,
          value: alvo.id,
          expiresAt: futuro,
          updatedAt: new Date(),
        },
        {
          id: randomUUID(),
          identifier: `reset-password:${tokenOutro}`,
          value: outro.id,
          expiresAt: futuro,
          updatedAt: new Date(),
        },
      ],
    });

    const cookie = await login(alvo.email, SENHA_INICIAL);
    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);
    const res = await trocar(cookie, SENHA_NOVA);
    expect(res.status).toBe(200);
    expect((await res.json()) as { recuperacoesInvalidadas: number }).toMatchObject({
      recuperacoesInvalidadas: 1,
    });

    // O token do titular sumiu; o do outro titular permanece intacto.
    const doAlvo = await migrator.authVerification.count({
      where: { value: alvo.id, identifier: { startsWith: 'reset-password:' } },
    });
    const doOutro = await migrator.authVerification.count({
      where: { value: outro.id, identifier: { startsWith: 'reset-password:' } },
    });
    expect(doAlvo).toBe(0);
    expect(doOutro).toBe(1);
  });

  it('emite a notificação de segurança (SENHA_ALTERADA) para o titular', async () => {
    const { id, email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);
    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);
    expect((await trocar(cookie, SENHA_NOVA)).status).toBe(200);

    const evento = notificacoes.find((e) => e.accountId === id);
    expect(evento).toBeDefined();
    expect(evento?.tipo).toBe('SENHA_ALTERADA');
  });

  it('troca só a PRÓPRIA conta — outra conta não é afetada', async () => {
    const alvo = await criarConta(SENHA_INICIAL);
    const vizinho = await criarConta(SENHA_INICIAL);

    const cookie = await login(alvo.email, SENHA_INICIAL);
    expect((await stepUp(cookie, SENHA_INICIAL)).status).toBe(204);
    expect((await trocar(cookie, SENHA_NOVA)).status).toBe(200);

    // O vizinho continua logando com a senha original (a troca não vazou para ele).
    const cookieViz = await login(vizinho.email, SENHA_INICIAL);
    expect(cookieViz).toMatch(/session/i);
  });
});

describe('DTO fail-closed', () => {
  it('campo não permitido no corpo do step-up → 400', async () => {
    const { email } = await criarConta(SENHA_INICIAL);
    const cookie = await login(email, SENHA_INICIAL);
    const res = await fetch(`${baseUrl}/me/step-up`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ senhaAtual: SENHA_INICIAL, accountId: 'outra' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('trilha sanitizada e notificação em LOG (log real de produção)', () => {
  it('a auditoria registra a troca, a notificação é emitida, e NENHUMA senha aparece no log', async () => {
    // Instância separada com o log LIGADO e o adapter de notificação REAL (de LOG), para provar o
    // caminho de produção — a mesma técnica do teste FR-403 do login.
    const nivelAnterior = process.env.LOG_LEVEL;
    const ambienteAnterior = process.env.NODE_ENV;
    process.env.LOG_LEVEL = 'info';
    process.env.NODE_ENV = 'test';

    const capturado: string[] = [];
    const stdoutReal = process.stdout.write.bind(process.stdout);
    const capturar =
      (real: typeof stdoutReal) =>
      (chunk: unknown, ...resto: unknown[]): boolean => {
        capturado.push(typeof chunk === 'string' ? chunk : String(chunk));
        return (real as (...args: unknown[]) => boolean)(chunk, ...resto);
      };
    (process.stdout as { write: unknown }).write = capturar(stdoutReal);

    let comLog: INestApplication | undefined;
    try {
      comLog = await NestFactory.create(AppModule); // log real, adapter de notificação real (LOG)
      await comLog.listen(0);
      const url = await comLog.getUrl();

      const { email } = await criarConta(SENHA_INICIAL);
      const cookie = await (async () => {
        const r = await fetch(`${url}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password: SENHA_INICIAL }),
        });
        return cookieDe(r);
      })();

      await fetch(`${url}/me/step-up`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ senhaAtual: SENHA_INICIAL }),
      });
      const res = await fetch(`${url}/me/password`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ novaSenha: SENHA_NOVA }),
      });
      expect(res.status).toBe(200);

      await new Promise((r) => setTimeout(r, 100));
      const tudo = capturado.join('');

      expect(tudo.length).toBeGreaterThan(0);
      // A trilha de auditoria da troca está presente…
      expect(tudo).toContain('"action":"password.change"');
      // …e a notificação de segurança foi emitida (adapter de LOG)…
      expect(tudo).toContain('"event":"security.notification"');
      // …e NENHUMA senha em claro (atual ou nova) vazou para o log.
      expect(tudo).not.toContain(SENHA_INICIAL);
      expect(tudo).not.toContain(SENHA_NOVA);
    } finally {
      (process.stdout as { write: unknown }).write = stdoutReal;
      process.env.LOG_LEVEL = nivelAnterior;
      process.env.NODE_ENV = ambienteAnterior;
      await comLog?.close();
    }
  });
});
