import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import { LoginFailureService, MAX_FALHAS } from '../src/kernel/auth/login-failure.service';
import type { PrismaService } from '../src/kernel/db/prisma.service';

/**
 * O contador de falhas por identificador — o **G1**.
 *
 * Ele existe porque o rate limiter nativo do Better Auth chaveia por `${ip}|${path}` e conta
 * *solicitações*: ele é incapaz de contar *falhas por conta*. Sem este contador, a força bruta
 * dirigida a UMA conta ficaria sem proteção — um atacante com uma lista de e-mails, testando uma
 * senha comum em cada, nunca estoura um limite por conta.
 *
 * Contra PostgreSQL REAL: a atomicidade do incremento é uma propriedade do banco
 * (`INSERT ... ON CONFLICT DO UPDATE`), não da aplicação. Um mock provaria o mock.
 */

const eventos: Record<string, unknown>[] = [];
const logger = {
  warn: (dados: Record<string, unknown>) => eventos.push(dados),
  info: () => {},
  error: () => {},
} as unknown as PinoLogger;

let prisma: PrismaClient;
let servico: LoginFailureService;

/** Identificadores próprios deste arquivo — os testes rodam em paralelo contra o mesmo banco. */
const ALVO = 'alvo-g1@exemplo.test';
const OUTRO = 'outro-g1@exemplo.test';
const CONCORRENTE = 'concorrente-g1@exemplo.test';
const NORMALIZADO = 'normalizar-g1@exemplo.test';

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente: o contador do G1 é testado contra PostgreSQL real.');
  }
  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.$connect();
  servico = new LoginFailureService(prisma as unknown as PrismaService, logger);
});

afterAll(async () => {
  // Limpa só as chaves DESTE arquivo.
  for (const id of [ALVO, OUTRO, CONCORRENTE, NORMALIZADO, ' NORMALIZAR-G1@Exemplo.TEST ']) {
    await servico.limpar(id);
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  eventos.length = 0;
  for (const id of [ALVO, OUTRO, CONCORRENTE, NORMALIZADO]) await servico.limpar(id);
});

describe('a chave é HMAC — nunca o e-mail', () => {
  it('a tabela NÃO contém o e-mail em claro', async () => {
    await servico.registrarFalha(ALVO);

    // A varredura é na tabela inteira, de propósito: procura o e-mail em QUALQUER linha, não só na
    // que acabamos de criar.
    const linhas = await prisma.$queryRaw<{ key: string }[]>`SELECT "key" FROM "LoginFailure"`;
    const tudo = JSON.stringify(linhas);

    // E-mail é PII. Em claro aqui, esta tabela viraria um SEGUNDO cadastro de e-mails, fora do
    // controle do `Account` — e um dump dela seria uma lista de usuários.
    expect(tudo).not.toContain(ALVO);
    expect(tudo).not.toContain('exemplo.test');

    // O que ESTÁ lá é o HMAC: hex, 64 caracteres (SHA-256).
    const chave = servico.chaveDe(ALVO);
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
    expect(linhas.some((l) => l.key === chave)).toBe(true);
  });

  it('o e-mail não aparece nos logs — nem em claro, nem hasheado', async () => {
    await servico.registrarFalha(ALVO);

    const log = JSON.stringify(eventos);
    expect(log).not.toContain(ALVO);
    // A chave HMAC também não: ela é um identificador ESTÁVEL de uma pessoa, logo PII
    // pseudonimizada — correlacionável entre logs, e sujeita à LGPD.
    expect(log).not.toContain(servico.chaveDe(ALVO));
    // O que o operador precisa saber está lá.
    expect(eventos[0]).toMatchObject({ event: 'auth.login.failed', count: 1 });
  });

  it('normalização: capitalização e espaços caem na MESMA chave', async () => {
    // Sem normalizar, `ANA@X` e `ana@x` gerariam chaves distintas — e o G1 seria contornável só
    // mudando a grafia. O limite de 5 falhas viraria "5 falhas POR GRAFIA".
    expect(servico.chaveDe(' NORMALIZAR-G1@Exemplo.TEST ')).toBe(servico.chaveDe(NORMALIZADO));

    await servico.registrarFalha(NORMALIZADO);
    const { count } = await servico.registrarFalha(' NORMALIZAR-G1@Exemplo.TEST ');

    expect(count).toBe(2); // e não 1 e 1 em contadores separados
    await servico.limpar(NORMALIZADO);
  });

  it('identificadores diferentes não compartilham contador', async () => {
    await servico.registrarFalha(ALVO);
    await servico.registrarFalha(ALVO);
    const { count } = await servico.registrarFalha(OUTRO);

    expect(count).toBe(1);
  });
});

describe('o limite (G1)', () => {
  it(`bloqueia na ${MAX_FALHAS}ª falha`, async () => {
    for (let i = 1; i < MAX_FALHAS; i++) {
      const r = await servico.registrarFalha(ALVO);
      expect(r.bloqueado).toBe(false);
      expect(r.count).toBe(i);
    }

    const quinta = await servico.registrarFalha(ALVO);
    expect(quinta.count).toBe(MAX_FALHAS);
    expect(quinta.bloqueado).toBe(true);
    expect(await servico.estaBloqueado(ALVO)).toBe(true);
  });

  it('bloqueia a tentativa SEGUINTE — mesmo que a senha estivesse certa', async () => {
    // A checagem acontece ANTES de verificar a senha. Se fosse depois, a 6ª tentativa com a senha
    // correta passaria — e o limite não limitaria nada: bastaria ao atacante acertar logo após a
    // quinta.
    for (let i = 0; i < MAX_FALHAS; i++) await servico.registrarFalha(ALVO);

    expect(await servico.estaBloqueado(ALVO)).toBe(true);
  });

  it('NÃO é bloqueio permanente: expirada a janela, a conta volta (G3)', async () => {
    // O bloqueio permanente transformaria o G1 numa arma de negação de serviço CONTRA a vítima:
    // bastaria ao atacante errar a senha 5× no e-mail dela para deixá-la de fora para sempre.
    for (let i = 0; i < MAX_FALHAS; i++) await servico.registrarFalha(ALVO);
    expect(await servico.estaBloqueado(ALVO)).toBe(true);

    // Envelhece a janela artificialmente (16 min atrás) — sem esperar 15 minutos de relógio.
    await prisma.$executeRaw`
      UPDATE "LoginFailure"
      SET "windowStart" = now() - interval '16 minutes'
      WHERE "key" = ${servico.chaveDe(ALVO)}
    `;

    expect(await servico.estaBloqueado(ALVO)).toBe(false);

    // E o contador REINICIA em 1 — não continua de 5.
    const nova = await servico.registrarFalha(ALVO);
    expect(nova.count).toBe(1);
    expect(nova.bloqueado).toBe(false);
  });

  it('o sucesso limpa o contador DO IDENTIFICADOR (G4)', async () => {
    for (let i = 0; i < 3; i++) await servico.registrarFalha(ALVO);

    await servico.limpar(ALVO);

    expect(await servico.estaBloqueado(ALVO)).toBe(false);
    const depois = await servico.registrarFalha(ALVO);
    expect(depois.count).toBe(1);
  });
});

describe('concorrência — o regime real de um ataque', () => {
  it('5 falhas SIMULTÂNEAS contam 5 (sem lost update)', async () => {
    // Um atacante não erra a senha cinco vezes em sequência educada: ele dispara tudo de uma vez.
    // Com `SELECT` seguido de `UPDATE`, as cinco leriam count=0 e escreveriam count=1 — o contador
    // marcaria 1, e o limite jamais seria atingido. É por isso que o incremento é uma instrução
    // única (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`).
    const resultados = await Promise.all(
      Array.from({ length: MAX_FALHAS }, () => servico.registrarFalha(CONCORRENTE)),
    );

    const contagens = resultados.map((r) => r.count).sort((a, b) => a - b);

    // Cada chamada enxergou um valor distinto: 1,2,3,4,5. Nenhuma contagem se perdeu.
    expect(contagens).toEqual([1, 2, 3, 4, 5]);
    expect(await servico.estaBloqueado(CONCORRENTE)).toBe(true);
  });

  it('20 falhas simultâneas contam 20 — nenhuma se perde', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => servico.registrarFalha(CONCORRENTE)),
    );

    const contagens = new Set(resultados.map((r) => r.count));
    // 20 chamadas, 20 valores DISTINTOS de contagem.
    expect(contagens.size).toBe(20);
    expect(Math.max(...contagens)).toBe(20);
  });
});
