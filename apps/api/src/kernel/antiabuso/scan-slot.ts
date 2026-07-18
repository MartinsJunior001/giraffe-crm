import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../db/prisma.service';

/** Resultado de uma aquisição de slot: o token (posse) ou `null` quando o teto foi atingido (fail-closed). */
export type AquisicaoSlot = string | null;

/**
 * Semáforo de CONCORRÊNCIA genérico (fronteira técnica do kernel — AD-4/AD-5), sobre a tabela GLOBAL `ScanSlot`
 * (sem RLS — não pertence a um tenant; o isolamento é lógico, embutido na `key`). Limita quantas operações
 * caras (ex.: verificação antivírus da 3.7) podem rodar ao mesmo tempo por `key`, fail-closed no teto.
 *
 * É deliberadamente **técnico e sem política de domínio**: não sabe o que é um "scan", não constrói a chave nem
 * escolhe teto/TTL, e não lança HTTP. Quem define a `key` (ex.: `scan:<orgId>`), o teto e o TTL, e a resposta
 * ao saturar (429), é o domínio consumidor — como o `RateLimiter` irmão.
 *
 * **Atomicidade real:** a aquisição roda numa transação no client RAIZ (a tabela é global, sem contexto de
 * tenant) com um `pg_advisory_xact_lock(hashtext(key))` que SERIALIZA aquisições concorrentes da mesma `key`.
 * Sem o lock, dois inserts concorrentes poderiam ambos ver "abaixo do teto" e ambos inserir (over-admissão).
 * Antes de contar, os slots EXPIRADOS da chave são apagados (auto-liberação de slot órfão de um scan que morreu).
 * **Fail-closed:** ausência de linha retornada ⇒ `null` (não adquiriu); nunca "adquiriu por omissão".
 */
@Injectable()
export class ScanSlotSemaphore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tenta adquirir um slot para `key`. Devolve o `token` (para liberar depois) ou `null` se já há `teto` slots
   * ativos. `ttlSeconds` é a auto-liberação: um slot não liberado explicitamente expira e deixa de contar.
   */
  async adquirir(key: string, teto: number, ttlSeconds: number): Promise<AquisicaoSlot> {
    const token = randomUUID();

    const linhas = await this.prisma.$transaction(async (tx) => {
      // Serializa aquisições concorrentes da MESMA key (advisory lock transaction-local — solta no commit).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
      // Auto-liberação: remove slots já expirados desta key antes de contar.
      await tx.$executeRaw`DELETE FROM "ScanSlot" WHERE "key" = ${key} AND "expiraEm" <= now()`;
      // Insere só se abaixo do teto (conta ativos na mesma transação, já sob o lock).
      return tx.$queryRaw<{ token: string }[]>`
        INSERT INTO "ScanSlot" ("token", "key", "expiraEm")
        SELECT ${token}::uuid, ${key}, now() + make_interval(secs => ${ttlSeconds})
        WHERE (SELECT count(*) FROM "ScanSlot" WHERE "key" = ${key} AND "expiraEm" > now()) < ${teto}
        RETURNING "token"
      `;
    });

    return linhas[0]?.token ?? null;
  }

  /** Libera um slot pelo `token` (DELETE). Chamado em `finally` — idempotente (token inexistente = no-op). */
  async liberar(token: string): Promise<void> {
    await this.prisma.$executeRaw`DELETE FROM "ScanSlot" WHERE "token" = ${token}::uuid`;
  }
}
