import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../kernel/db/prisma.service';

/** Janela e teto do rate limit da submissão pública (baseline antiabuso — Story 2.8). */
const JANELA_MS = 10 * 60 * 1000; // 10 minutos
const TETO = 20; // submissões por (IP confiável, publicId) na janela

/**
 * Rate limit ATÔMICO da submissão pública por **IP confiável + `publicId`** (Story 2.8, baseline antiabuso).
 *
 * Reusa a tabela `RateLimit` (a mesma infra DB-backed do rate limit nativo do Better Auth), com **namespace
 * próprio** (`pub:<ip>:<publicId>`) — sem colidir com as chaves de auth (`ip|path`). A contagem é feita num
 * **único statement** `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (atômico, sem read-modify-write de
 * corrida): se a última requisição saiu da janela, zera; senão incrementa. Acima do teto → **429**.
 *
 * **Fail-closed:** a checagem precede qualquer escrita; um erro ao verificar propaga e a submissão NÃO acontece.
 * O IP é o do socket (ou o 1º salto não confiável atrás de proxy confiável), nunca o `X-Forwarded-For` cru
 * (ver `client-ip.ts`) — chave de rate limit não pode ser falsificável.
 */
@Injectable()
export class PublicRateLimit {
  constructor(private readonly prisma: PrismaService) {}

  /** Registra uma tentativa; lança 429 se o teto na janela foi excedido. IP ausente também conta (chave fixa). */
  async registrar(ip: string | undefined, publicId: string): Promise<void> {
    const chave = `pub:${ip ?? 'sem-ip'}:${publicId}`;
    const agora = Date.now();
    const inicioJanela = agora - JANELA_MS;

    const linhas = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimit" ("id", "key", "count", "lastRequest")
      VALUES (${randomUUID()}, ${chave}, 1, ${BigInt(agora)})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."lastRequest" < ${BigInt(inicioJanela)} THEN 1
                       ELSE "RateLimit"."count" + 1 END,
        "lastRequest" = ${BigInt(agora)}
      RETURNING "count"
    `;

    const count = linhas[0]?.count ?? TETO + 1; // ausência de linha (impossível) = fail-closed
    if (count > TETO) {
      throw new HttpException(
        'muitas submissões; tente novamente mais tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
