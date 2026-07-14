import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../generated/prisma';
import type { PrismaService } from '../src/kernel/db/prisma.service';
import type { PinoLogger } from 'nestjs-pino';
import { criarRateLimitStorage } from '../src/kernel/auth/rate-limit-storage';

/**
 * O storage atômico do rate limit (G2) — a correção do débito **D-06**.
 *
 * O que este arquivo prova, e o teste de HTTP não isola tão bem: que `consume` é ATÔMICO. Sob N chamadas
 * concorrentes à mesma chave, exatamente `max` são permitidas — nem uma a mais. A prova de que a asserção
 * PEGA a regressão (fase vermelha) está embutida: `consumeIngenuo` reproduz o get-depois-set que o desenho
 * atômico substitui, e sob a mesma rajada ele **vaza** (permite mais que `max`).
 *
 * PostgreSQL real, chave `RateLimit` global (por IP+rota) — não toca dado organizacional.
 */

let prisma: PrismaClient;
const semLog = {
  warn: () => {},
  info: () => {},
  error: () => {},
} as unknown as PinoLogger;

const REGRA = { window: 15 * 60, max: 20 };

beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Chave única desta execução — evita colidir com os outros arquivos que rodam em paralelo. */
function chaveUnica(rotulo: string): string {
  return `d06-${rotulo}-${randomUUID()}`;
}

/**
 * Implementação INGÊNUA (get-depois-set) — usada só para a MUTAÇÃO. É a corrida que o `consume` atômico
 * existe para evitar: sob concorrência, as leituras acontecem antes das escritas e todas veem o contador
 * baixo. `setImmediate` alarga a janela da corrida para torná-la determinística no teste.
 */
async function consumeIngenuo(
  key: string,
  rule: { window: number; max: number },
): Promise<{ allowed: boolean }> {
  const agora = Date.now();
  const linhas = await prisma.$queryRaw<{ count: number; lastRequest: bigint }[]>`
    SELECT "count", "lastRequest" FROM "RateLimit" WHERE "key" = ${key}
  `;
  const atual = linhas[0];
  const vencida = atual === undefined || Number(atual.lastRequest) <= agora - rule.window * 1000;
  const count = vencida ? 1 : atual.count + 1;
  await new Promise((r) => setImmediate(r)); // alarga a corrida
  await prisma.$executeRaw`
    INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
    VALUES (${randomUUID()}, ${key}, ${count}, ${BigInt(agora)})
    ON CONFLICT ("key") DO UPDATE SET "count" = ${count}, "lastRequest" = ${BigInt(agora)}
  `;
  return { allowed: count <= rule.max };
}

describe('rate-limit storage atômico (D-06)', () => {
  it('consumo concorrente permite EXATAMENTE `max` — sem perda de contagem (SC-D06-3)', async () => {
    const storage = criarRateLimitStorage(prisma as unknown as PrismaService, semLog);
    const key = chaveUnica('atomico');
    const N = 40; // > 2× o limite, para que a rajada estoure com folga

    const respostas = await Promise.all(
      Array.from({ length: N }, () => storage.consume(key, REGRA)),
    );
    const permitidas = respostas.filter((r) => r.allowed).length;
    const barradas = respostas.filter((r) => !r.allowed).length;

    // O coração da correção: o incremento é atômico, então as permitidas são exatamente `max`.
    expect(permitidas).toBe(REGRA.max);
    expect(barradas).toBe(N - REGRA.max);
    // Toda barrada carrega o retryAfter (a janela) — nenhuma escapa da contagem.
    for (const r of respostas.filter((x) => !x.allowed)) expect(r.retryAfter).toBe(REGRA.window);

    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${key}`;
  });

  it('MUTAÇÃO: o get-depois-set ingênuo VAZA sob a mesma rajada (prova a fase vermelha, SC-D06-7)', async () => {
    // Se a asserção acima passasse com qualquer implementação, ela não provaria nada. Aqui, a versão
    // não-atômica permite MAIS que `max` — é a regressão que o teste atômico pega.
    const key = chaveUnica('ingenuo');
    const N = 40;

    const respostas = await Promise.all(
      Array.from({ length: N }, () => consumeIngenuo(key, REGRA)),
    );
    const permitidas = respostas.filter((r) => r.allowed).length;

    // A corrida faz várias leituras verem o contador baixo — o limite de 20 é ultrapassado.
    expect(permitidas).toBeGreaterThan(REGRA.max);

    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${key}`;
  });

  it('reabre a janela quando ela vence: a contagem reinicia em 1 (SC-D06-2)', async () => {
    const storage = criarRateLimitStorage(prisma as unknown as PrismaService, semLog);
    const key = chaveUnica('janela');

    const primeira = await storage.consume(key, REGRA);
    expect(primeira.allowed).toBe(true);

    // Envelhece a linha para além da janela: a próxima consumida deve reabrir (count = 1), não somar.
    await prisma.$executeRaw`
      UPDATE "RateLimit" SET "lastRequest" = ${BigInt(Date.now() - (REGRA.window + 60) * 1000)}
      WHERE "key" = ${key}
    `;
    const info = await storage.get(key);
    expect(info?.count).toBe(1); // a linha ainda tem count 1 da 1ª; a reabertura acontece no próximo consume

    const depois = await storage.consume(key, REGRA);
    expect(depois.allowed).toBe(true);
    const reaberta = await storage.get(key);
    expect(reaberta?.count).toBe(1); // reiniciou — não virou 2

    await prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "key" = ${key}`;
  });

  it('fail-closed: store indisponível NEGA (relança) e loga evento distinto sem PII (SC-D06-4/5/8)', async () => {
    // Quando o banco cai, `consume` não pode conceder. Ele relança (→ 500 = negado) e emite um evento
    // DIFERENTE do 429, para que a defesa (limite) não se confunda com o defeito (falha).
    const erro = new Error('conexão recusada');
    const prismaQuebrado = {
      $queryRaw: vi.fn().mockRejectedValue(erro),
    } as unknown as PrismaService;
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn() } as unknown as PinoLogger;

    const storage = criarRateLimitStorage(prismaQuebrado, logger);
    const keySensivel = '203.0.113.7|/sign-in/email'; // contém IP — NÃO pode aparecer no log

    await expect(storage.consume(keySensivel, REGRA)).rejects.toThrow(erro);

    // Evento distinto (observabilidade separa 429 de 500)…
    expect(logger.error).toHaveBeenCalledOnce();
    const [payload] = (logger.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]!;
    expect((payload as { event: string }).event).toBe('auth.ratelimit.store_error');
    // …e SEM PII: a chave (que carrega o IP) nunca vai para o log.
    expect(JSON.stringify(payload)).not.toContain('203.0.113.7');
  });
});
