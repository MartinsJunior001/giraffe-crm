import { randomUUID } from 'node:crypto';
import type { PinoLogger } from 'nestjs-pino';
import type { PrismaService } from '../db/prisma.service';

/**
 * Forma do registro de rate limit que o Better Auth lê/escreve (better-auth 1.6 — confere
 * `BetterAuthRateLimitStorage` em `@better-auth/core`, verificado no context7 e no `.d.ts` instalado).
 * `lastRequest` é epoch em ms.
 */
export interface RegistroRateLimit {
  key: string;
  count: number;
  lastRequest: number;
}

/**
 * Contrato do storage de rate limit do Better Auth (1.6). `get`/`set` são o caminho legado (leitura +
 * escrita separadas); `consume` é o caminho **atômico** adicionado na 1.6.17 para "strict concurrent
 * enforcement" — quando presente, é ele que o limiter usa no caminho quente.
 */
export interface RateLimitStorage {
  get: (key: string) => Promise<RegistroRateLimit | null | undefined>;
  set: (key: string, value: RegistroRateLimit, update?: boolean) => Promise<void>;
  consume: (
    key: string,
    rule: { window: number; max: number },
  ) => Promise<{ allowed: boolean; retryAfter: number | null }>;
}

/**
 * Storage de rate limit (G2) sobre o PostgreSQL, com consumo **atômico**.
 *
 * ## Por que existe (o débito D-06)
 * O débito nasceu de um Better Auth mais antigo, em que o rate limit em `storage: 'database'` abria uma
 * transação por requisição e, sob rajada concorrente a `/api/auth/*`, essas transações competiam pelo
 * pool e parte das requisições virava **HTTP 500** em vez do **429** correto. **No 1.6.23 instalado o
 * modo `'database'` já é atômico** (read + `incrementOne` com guarda `count < max` + retry otimista) —
 * então este `consume` é um **refino**, não um conserto de "transação por requisição": ele reduz o
 * caminho a **uma** única instrução (um round-trip, sem read-depois-write, sem recursão de retry),
 * baixando a pressão no pool sob concorrência. Ver o relatório do D-06 para a divergência registrada.
 *
 * ## A instrução
 * `consume` faz o incremento e a decisão numa **única instrução** — `INSERT ... ON CONFLICT DO UPDATE
 * ... RETURNING`. É o mesmo padrão atômico que o `LoginFailureService` (G1) já usa. Persiste no banco
 * (sobrevive a restart, compartilhado entre réplicas — invariantes do G2 cobertos por
 * `login-http.test.ts`). Nenhuma mudança de schema: reusa a `UNIQUE(key)` da `RateLimit` e os GRANTs
 * (`SELECT/INSERT/UPDATE`) que o papel de runtime já tem.
 *
 * ## Semântica da janela (fixa, igual à referência do próprio Better Auth)
 * `lastRequest` marca a ABERTURA da janela. Enquanto a janela está aberta, cada requisição incrementa
 * `count` e NÃO mexe em `lastRequest`; quando a janela vence (`lastRequest <= agora - window`), a
 * contagem reinicia em 1 e a janela reabre. É a mesma semântica do storage `secondary-storage` do
 * Better Auth (`increment` com ttl=window fixado na abertura). `allowed = count <= max`.
 *
 * ## Fail-closed e observabilidade (critérios 4 e 8 do D-06)
 * Se o banco cair, `consume` registra um evento **distinto** (`auth.ratelimit.store_error`, sem PII) e
 * **relança** — o Better Auth responde 500, ou seja, acesso NEGADO (nunca concede sessão). Relançar em
 * vez de devolver `allowed:false` preserva a separação: **429 = limite legítimo, 500 = falha interna**.
 * A chave (`${ip}|${rota}`) NUNCA entra no log — só `event`.
 */
export function criarRateLimitStorage(prisma: PrismaService, logger: PinoLogger): RateLimitStorage {
  return {
    async get(key) {
      const linhas = await prisma.$queryRaw<
        { key: string; count: number; lastRequest: bigint }[]
      >`SELECT "key", "count", "lastRequest" FROM "RateLimit" WHERE "key" = ${key}`;
      const linha = linhas[0];
      if (linha === undefined) return null;
      return { key: linha.key, count: linha.count, lastRequest: Number(linha.lastRequest) };
    },

    async set(key, value) {
      // Fora do caminho quente: com `consume` presente, o limiter não usa `get`/`set` para contar.
      // Mantido correto e idempotente para qualquer fluxo do Better Auth que os chame (ex.: reset).
      await prisma.$executeRaw`
        INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
        VALUES (${randomUUID()}, ${key}, ${value.count}, ${BigInt(value.lastRequest)})
        ON CONFLICT ("key") DO UPDATE SET
          "count" = ${value.count},
          "lastRequest" = ${BigInt(value.lastRequest)}
      `;
    },

    async consume(key, rule) {
      const agora = Date.now();
      const corteAbertura = BigInt(agora - rule.window * 1000); // janela vencida se lastRequest <= corte
      try {
        // **Uma instrução só.** O incremento e a decisão de reabrir a janela vivem no mesmo comando —
        // sem transação por requisição, logo sem a contenção de pool que produzia o 500. O `count`
        // pós-incremento vem do `RETURNING`.
        const linhas = await prisma.$queryRaw<{ count: number }[]>`
          INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
          VALUES (${randomUUID()}, ${key}, 1, ${BigInt(agora)})
          ON CONFLICT ("key") DO UPDATE SET
            "count" = CASE
              WHEN "RateLimit"."lastRequest" <= ${corteAbertura} THEN 1
              ELSE "RateLimit"."count" + 1
            END,
            "lastRequest" = CASE
              WHEN "RateLimit"."lastRequest" <= ${corteAbertura} THEN ${BigInt(agora)}
              ELSE "RateLimit"."lastRequest"
            END
          RETURNING "count"
        `;
        const count = linhas[0]?.count ?? 1;
        if (count <= rule.max) return { allowed: true, retryAfter: null };
        return { allowed: false, retryAfter: rule.window };
      } catch (err) {
        // Fail-closed: store indisponível → NEGA (relança → 500), nunca concede. O evento é distinto do
        // 429 (critério 8). Sem PII: a chave carrega o IP e por isso não vai para o log.
        logger.error(
          {
            event: 'auth.ratelimit.store_error',
            err: err instanceof Error ? err.name : 'desconhecido',
          },
          'store do rate limit indisponível — negando requisição (fail-closed)',
        );
        throw err;
      }
    },
  };
}
