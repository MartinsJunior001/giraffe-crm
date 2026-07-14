import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import {
  CHAVE_LOCK_CLEANUP,
  JANELA_MS,
  LoginFailureService,
} from '../src/kernel/auth/login-failure.service';
import type { PrismaService } from '../src/kernel/db/prisma.service';

/**
 * O **lock** do agendador da coleta de lixo antiabuso — o débito **D-05**.
 *
 * A rotina de coleta (`limparExpirados`) já é idempotente e testada (`login-failure.test.ts`). O que
 * este arquivo prova é a peça nova: `limparExpiradosComLock` serializa a coleta por
 * `pg_try_advisory_xact_lock`, de modo que duas execuções concorrentes não rodem os mesmos DELETEs ao
 * mesmo tempo — uma roda, a outra PULA. Contra PostgreSQL real: o advisory lock é uma propriedade do
 * banco, um mock provaria o mock.
 *
 * O `holder` é um cliente separado com `connection_limit=1` que segura um advisory lock de SESSÃO na
 * mesma chave — simulando "outra execução em curso". Enquanto ele segura, a coleta pula; ao liberar, roda.
 */

const eventos: Record<string, unknown>[] = [];
const logger = {
  info: (dados: Record<string, unknown>) => eventos.push(dados),
  warn: () => {},
  error: () => {},
} as unknown as PinoLogger;

let prisma: PrismaClient;
let holder: PrismaClient;
let servico: LoginFailureService;

const chaveRL = `d05-lock-${randomUUID()}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL ausente: o lock da coleta é testado contra PostgreSQL real.');
  }
  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.$connect();
  // Cliente separado: "outra execução" que segura o advisory lock numa conexão distinta da do serviço.
  holder = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await holder.$connect();
  servico = new LoginFailureService(prisma as unknown as PrismaService, logger);
});

afterAll(async () => {
  await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${chaveRL}`;
  await prisma.$disconnect();
  await holder.$disconnect();
});

/**
 * Executa `fn` enquanto o `holder` segura o advisory lock da coleta.
 *
 * Usa `pg_advisory_xact_lock` (bloqueante, de transação) dentro de uma transação interativa que fica
 * ABERTA até liberarmos — garante que aquisição e liberação ocorrem na MESMA conexão (o pool do Prisma
 * poderia rodar um `unlock` de sessão em outra conexão e deixar o lock preso) e que o lock cai sozinho
 * ao fim da transação. Nenhum lock vaza entre testes.
 */
async function comLockRetido<T>(fn: () => Promise<T>): Promise<T> {
  let liberar!: () => void;
  const espera = new Promise<void>((r) => (liberar = r));
  let txConcluida!: Promise<unknown>;
  const lockPronto = new Promise<void>((resolve, reject) => {
    txConcluida = holder
      .$transaction(
        async (tx) => {
          // `$executeRaw` (não `$queryRaw`): `pg_advisory_xact_lock` retorna `void`, que o Prisma não
          // consegue desserializar como coluna de resultado.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAVE_LOCK_CLEANUP}::bigint)`;
          resolve(); // lock adquirido — pode prosseguir
          await espera; // mantém a transação (e o lock) abertos
        },
        { timeout: 20_000 },
      )
      .catch(reject);
  });
  await lockPronto;
  try {
    return await fn();
  } finally {
    liberar();
    await txConcluida;
  }
}

/** Insere uma linha `RateLimit` JÁ EXPIRADA (fora da janela) — alvo legítimo da coleta. */
async function inserirRateLimitExpirado(): Promise<void> {
  const expirado = BigInt(Date.now() - JANELA_MS - 60_000);
  await prisma.$executeRaw`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${chaveRL}, 1, ${expirado})
    ON CONFLICT ("key") DO UPDATE SET "count" = 1, "lastRequest" = ${expirado}
  `;
}

async function existeRateLimit(): Promise<boolean> {
  const linhas = await prisma.$queryRaw<{ um: number }[]>`
    SELECT 1 AS um FROM "RateLimit" WHERE "key" = ${chaveRL}
  `;
  return linhas.length > 0;
}

describe('coleta com lock (D-05)', () => {
  it('com o lock retido por outra sessão, a coleta PULA — não roda os DELETEs (SC-D05-3)', async () => {
    await inserirRateLimitExpirado();
    eventos.length = 0;

    await comLockRetido(async () => {
      const resultado = await servico.limparExpiradosComLock();

      // Pulou: não obteve o lock…
      expect(resultado).toEqual({ pulado: true });
      // …emitiu o evento distinto…
      expect(eventos.some((e) => e.event === 'auth.antiabuse.cleanup.skipped')).toBe(true);
      // …e a linha expirada CONTINUA lá (a coleta não rodou).
      expect(await existeRateLimit()).toBe(true);
    });
  });

  it('liberado o lock, a coleta roda e remove o expirado (SC-D05-3 — verde)', async () => {
    await inserirRateLimitExpirado();
    expect(await existeRateLimit()).toBe(true);

    const resultado = await servico.limparExpiradosComLock();

    expect(resultado.pulado).toBe(false);
    // A NOSSA linha expirada sumiu (a coleta rodou).
    expect(await existeRateLimit()).toBe(false);
  });

  it('idempotente com lock: 2ª passada não ressuscita nem re-apaga a nossa linha (SC-D05-2)', async () => {
    await inserirRateLimitExpirado();

    await servico.limparExpiradosComLock(); // 1ª: apaga
    const segunda = await servico.limparExpiradosComLock(); // 2ª: nada nosso a apagar

    expect(segunda.pulado).toBe(false);
    expect(await existeRateLimit()).toBe(false);
  });

  it('falha do banco NÃO é silenciosa: o erro propaga (SC-D05-4)', async () => {
    // Se a transação da coleta falhar (banco caindo no meio), o erro tem de subir — nunca ser engolido
    // e reportado como sucesso. Aqui um prisma cujo `$transaction` rejeita prova que o método propaga.
    const erro = new Error('banco indisponível');
    const prismaQuebrado = {
      $transaction: vi.fn().mockRejectedValue(erro),
    } as unknown as PrismaService;
    const servicoQuebrado = new LoginFailureService(prismaQuebrado, logger);

    await expect(servicoQuebrado.limparExpiradosComLock()).rejects.toThrow(erro);
  });
});
