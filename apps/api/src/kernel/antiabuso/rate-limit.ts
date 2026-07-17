import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../db/prisma.service';

/** Política de uma janela deslizante de rate limit: tamanho da janela (ms) e teto de eventos na janela. */
export interface PoliticaRateLimit {
  /** Tamanho da janela deslizante, em milissegundos. */
  readonly janelaMs: number;
  /** Máximo de eventos permitidos para a mesma chave dentro da janela. */
  readonly teto: number;
}

/** Resultado de uma contagem: a contagem atual da chave na janela e se o teto foi excedido. */
export interface ResultadoRateLimit {
  /** Contagem da chave dentro da janela após computar esta tentativa. */
  readonly count: number;
  /** `true` quando `count` ultrapassou o `teto` da política — o chamador decide a resposta (ex.: 429). */
  readonly excedido: boolean;
}

/**
 * Primitivo ANTIABUSO genérico (fronteira técnica do kernel — AD-4/AD-5): contagem ATÔMICA de eventos por
 * chave numa janela deslizante, sobre a tabela GLOBAL `RateLimit` (sem RLS — não pertence a um tenant).
 *
 * É deliberadamente **técnico e sem política de domínio**: não sabe o que é uma "submissão pública", não
 * constrói chaves nem escolhe janela/teto, e não lança HTTP. Quem define a chave (namespace), a janela, o
 * teto e a resposta (429, mensagem, auditoria) é o domínio consumidor. Assim o mesmo primitivo serve à
 * submissão pública (2.8) e a outros baldes antiabuso futuros (ex.: o semáforo de scan da 3.7) sem que
 * nenhuma regra de negócio precise viver no kernel.
 *
 * A contagem é feita num **único statement** `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (atômico, sem
 * read-modify-write de corrida): se a última tentativa saiu da janela, zera; senão incrementa. **Fail-closed:**
 * um erro ao contar propaga (o chamador deve verificar ANTES de qualquer escrita); a ausência de linha
 * retornada (impossível pelo RETURNING) é tratada como excedido, nunca como liberado.
 *
 * Reusa a mesma infra DB-backed do rate limit nativo do Better Auth (a tabela `RateLimit`), mas com
 * **namespaces de chave próprios** por consumidor — as chaves de auth são `${ip}|${path}` e não colidem com
 * as chaves dos consumidores de domínio, que carregam seu próprio prefixo de finalidade.
 */
@Injectable()
export class RateLimiter {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra ATOMICAMENTE uma tentativa para `chave` e devolve a contagem na janela e se o teto foi excedido.
   *
   * A `chave` inclui o namespace/finalidade do consumidor (ex.: `pub:<ip>:<publicId>`) — o primitivo não a
   * interpreta. Não lança em caso de excesso: apenas informa `excedido`, cabendo ao chamador a resposta.
   */
  async contar(chave: string, politica: PoliticaRateLimit): Promise<ResultadoRateLimit> {
    const agora = Date.now();
    const inicioJanela = agora - politica.janelaMs;

    const linhas = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
      VALUES (${randomUUID()}, ${chave}, 1, ${BigInt(agora)})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."lastRequest" < ${BigInt(inicioJanela)} THEN 1
                       ELSE "RateLimit"."count" + 1 END,
        "lastRequest" = ${BigInt(agora)}
      RETURNING "count"
    `;

    // Ausência de linha é impossível (o RETURNING sempre devolve a linha do upsert); tratá-la como
    // excedido mantém o fail-closed: na dúvida, barra — nunca libera.
    const count = linhas[0]?.count ?? politica.teto + 1;
    return { count, excedido: count > politica.teto };
  }
}
