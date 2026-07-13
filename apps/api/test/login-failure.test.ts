import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import {
  JANELA_MS,
  LoginFailureService,
  MAX_FALHAS,
} from '../src/kernel/auth/login-failure.service';
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
    await servico.registrarTentativa(ALVO);

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
    await servico.registrarTentativa(ALVO);

    const log = JSON.stringify(eventos);
    expect(log).not.toContain(ALVO);
    // A chave HMAC também não: ela é um identificador ESTÁVEL de uma pessoa, logo PII
    // pseudonimizada — correlacionável entre logs, e sujeita à LGPD.
    expect(log).not.toContain(servico.chaveDe(ALVO));
    // O que o operador precisa saber está lá.
    expect(eventos[0]).toMatchObject({ event: 'auth.login.attempt', count: 1 });
  });

  it('normalização: capitalização e espaços caem na MESMA chave', async () => {
    // Sem normalizar, `ANA@X` e `ana@x` gerariam chaves distintas — e o G1 seria contornável só
    // mudando a grafia. O limite de 5 falhas viraria "5 falhas POR GRAFIA".
    expect(servico.chaveDe(' NORMALIZAR-G1@Exemplo.TEST ')).toBe(servico.chaveDe(NORMALIZADO));

    await servico.registrarTentativa(NORMALIZADO);
    const { count } = await servico.registrarTentativa(' NORMALIZAR-G1@Exemplo.TEST ');

    expect(count).toBe(2); // e não 1 e 1 em contadores separados
    await servico.limpar(NORMALIZADO);
  });

  it('identificadores diferentes não compartilham contador', async () => {
    await servico.registrarTentativa(ALVO);
    await servico.registrarTentativa(ALVO);
    const { count } = await servico.registrarTentativa(OUTRO);

    expect(count).toBe(1);
  });
});

describe('o limite (G1)', () => {
  it(`as ${MAX_FALHAS} primeiras tentativas passam; a ${MAX_FALHAS + 1}ª excede`, async () => {
    // O incremento inclui ESTA tentativa, então o corte é `>`: as 1..5 passam (a 5ª ainda é uma
    // chance legítima) e a 6ª é barrada. Mesmo comportamento de "5 tentativas e bloqueia" de antes —
    // a diferença é que a decisão agora é atômica com o incremento (ver o teste de concorrência).
    for (let i = 1; i <= MAX_FALHAS; i++) {
      const r = await servico.registrarTentativa(ALVO);
      expect(r.count).toBe(i);
      expect(r.excedido).toBe(false);
    }

    const sexta = await servico.registrarTentativa(ALVO);
    expect(sexta.count).toBe(MAX_FALHAS + 1);
    expect(sexta.excedido).toBe(true);
    expect(await servico.estaBloqueado(ALVO)).toBe(true);
  });

  it('depois de 5 tentativas, `estaBloqueado` já indica que a próxima é barrada', async () => {
    // `estaBloqueado` é leitura pura de estado (a decisão do fluxo é atômica, em `registrarTentativa`).
    // Ao chegar em 5, a próxima tentativa incrementaria para 6 > 5 e seria barrada.
    for (let i = 0; i < MAX_FALHAS; i++) await servico.registrarTentativa(ALVO);

    expect(await servico.estaBloqueado(ALVO)).toBe(true);
  });

  it('NÃO é bloqueio permanente: expirada a janela, a conta volta (G3)', async () => {
    // O bloqueio permanente transformaria o G1 numa arma de negação de serviço CONTRA a vítima:
    // bastaria ao atacante errar a senha 5× no e-mail dela para deixá-la de fora para sempre.
    for (let i = 0; i < MAX_FALHAS; i++) await servico.registrarTentativa(ALVO);
    expect(await servico.estaBloqueado(ALVO)).toBe(true);

    // Envelhece a janela artificialmente (16 min atrás) — sem esperar 15 minutos de relógio.
    await prisma.$executeRaw`
      UPDATE "LoginFailure"
      SET "windowStart" = now() - interval '16 minutes'
      WHERE "key" = ${servico.chaveDe(ALVO)}
    `;

    expect(await servico.estaBloqueado(ALVO)).toBe(false);

    // E o contador REINICIA em 1 — não continua de 5.
    const nova = await servico.registrarTentativa(ALVO);
    expect(nova.count).toBe(1);
    expect(nova.excedido).toBe(false);
  });

  it('o sucesso limpa o contador DO IDENTIFICADOR (G4)', async () => {
    for (let i = 0; i < 3; i++) await servico.registrarTentativa(ALVO);

    await servico.limpar(ALVO);

    expect(await servico.estaBloqueado(ALVO)).toBe(false);
    const depois = await servico.registrarTentativa(ALVO);
    expect(depois.count).toBe(1);
  });
});

describe('concorrência — o regime real de um ataque', () => {
  it('5 tentativas SIMULTÂNEAS contam 5 (sem lost update)', async () => {
    // Um atacante não erra a senha cinco vezes em sequência educada: ele dispara tudo de uma vez.
    // Com `SELECT` seguido de `UPDATE`, as cinco leriam count=0 e escreveriam count=1 — o contador
    // marcaria 1, e o limite jamais seria atingido. É por isso que o incremento é uma instrução
    // única (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`).
    const resultados = await Promise.all(
      Array.from({ length: MAX_FALHAS }, () => servico.registrarTentativa(CONCORRENTE)),
    );

    const contagens = resultados.map((r) => r.count).sort((a, b) => a - b);

    // Cada chamada enxergou um valor distinto: 1,2,3,4,5. Nenhuma contagem se perdeu.
    expect(contagens).toEqual([1, 2, 3, 4, 5]);
    expect(await servico.estaBloqueado(CONCORRENTE)).toBe(true);
  });

  it('numa rajada de 20 simultâneas, EXATAMENTE 5 passam e 15 são barradas', async () => {
    // Este é o coração do G1 contra o ataque real, e o que o desenho anterior NÃO garantia: com o
    // bloqueio decidido por um SELECT no `before` e o incremento no `after`, as 20 liam o contador
    // baixo e passavam todas — 20 verificações de senha contra uma conta cujo limite é 5. Aqui a
    // decisão (`excedido`) é atômica com o incremento, então exatamente 5 ficam abaixo do corte.
    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => servico.registrarTentativa(CONCORRENTE)),
    );

    const passaram = resultados.filter((r) => !r.excedido).length;
    const barradas = resultados.filter((r) => r.excedido).length;

    expect(passaram).toBe(MAX_FALHAS); // 5
    expect(barradas).toBe(20 - MAX_FALHAS); // 15

    // E as contagens continuam distintas (nenhuma perdida): 1..20.
    const contagens = new Set(resultados.map((r) => r.count));
    expect(contagens.size).toBe(20);
    expect(Math.max(...contagens)).toBe(20);
  });
});

describe('coleta de lixo — limparExpirados (D-05)', () => {
  it('apaga o LoginFailure fora da janela e preserva o que ainda conta', async () => {
    // Hoje uma linha só some quando o dono loga com sucesso. Um *spray* de milhões de identificadores
    // que nunca autenticam grava uma linha por identificador que NUNCA é apagada — crescimento sem
    // limite. A coleta remove o que já expirou; o que ainda está na janela (ataque em curso) é intocado.
    await servico.registrarTentativa(ALVO); // será envelhecido → expirado
    await servico.registrarTentativa(OUTRO); // permanece fresco → válido

    // Envelhece SÓ o de ALVO para além da janela (16 min), sem esperar o relógio.
    await prisma.$executeRaw`
      UPDATE "LoginFailure" SET "windowStart" = now() - interval '16 minutes'
      WHERE "key" = ${servico.chaveDe(ALVO)}
    `;

    const resultado = await servico.limparExpirados();
    // >= 1: outros arquivos rodam em paralelo e podem ter suas próprias linhas expiradas. Só afirmamos
    // sobre AS NOSSAS linhas — nunca sobre o total global, que não é nosso para prever.
    expect(resultado.loginFailure).toBeGreaterThanOrEqual(1);

    // O expirado sumiu…
    const alvoRestante = await prisma.$queryRaw<{ um: number }[]>`
      SELECT 1 AS um FROM "LoginFailure" WHERE "key" = ${servico.chaveDe(ALVO)}
    `;
    expect(alvoRestante).toHaveLength(0);

    // …e o válido sobreviveu: o contador segue vivo, então a próxima tentativa é a 2ª, não a 1ª.
    const outroDepois = await servico.registrarTentativa(OUTRO);
    expect(outroDepois.count).toBe(2);
  });

  it('apaga o RateLimit (G2) expirado e preserva o recente', async () => {
    // O RateLimit é a tabela do antiabuso por IP (G2), do Better Auth. Mesma coleta, mesma janela de
    // 15 min — `lastRequest` é epoch em ms (BigInt).
    const expirado = `gc-rl-expirado-${crypto.randomUUID()}`;
    const recente = `gc-rl-recente-${crypto.randomUUID()}`;
    const agora = Date.now();

    await prisma.$executeRaw`
      INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
      VALUES (${crypto.randomUUID()}, ${expirado}, 3, ${BigInt(agora - JANELA_MS - 1000)})
    `;
    await prisma.$executeRaw`
      INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
      VALUES (${crypto.randomUUID()}, ${recente}, 3, ${BigInt(agora)})
    `;

    await servico.limparExpirados();

    const aindaExpirado = await prisma.$queryRaw<{ um: number }[]>`
      SELECT 1 AS um FROM "RateLimit" WHERE "key" = ${expirado}
    `;
    const aindaRecente = await prisma.$queryRaw<{ um: number }[]>`
      SELECT 1 AS um FROM "RateLimit" WHERE "key" = ${recente}
    `;
    expect(aindaExpirado).toHaveLength(0);
    expect(aindaRecente).toHaveLength(1);

    // Limpa a linha recente que este teste criou (não é lixo expirado, então a coleta não a levaria).
    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${recente}`;
  });

  it('é idempotente: rodar de novo sobre o que já expirou não ressuscita nem re-apaga a nossa linha', async () => {
    await servico.registrarTentativa(ALVO);
    await prisma.$executeRaw`
      UPDATE "LoginFailure" SET "windowStart" = now() - interval '16 minutes'
      WHERE "key" = ${servico.chaveDe(ALVO)}
    `;

    await servico.limparExpirados(); // 1ª coleta: apaga o de ALVO
    const segunda = await servico.limparExpirados(); // 2ª: a linha de ALVO já não existe

    // A NOSSA linha continua ausente após a 2ª passada (não voltou a existir para ser apagada de novo).
    const alvoRestante = await prisma.$queryRaw<{ um: number }[]>`
      SELECT 1 AS um FROM "LoginFailure" WHERE "key" = ${servico.chaveDe(ALVO)}
    `;
    expect(alvoRestante).toHaveLength(0);
    // `segunda` é um número (linhas apagadas na 2ª rodada) — não lança, não depende de estado global.
    expect(typeof segunda.loginFailure).toBe('number');
  });
});
