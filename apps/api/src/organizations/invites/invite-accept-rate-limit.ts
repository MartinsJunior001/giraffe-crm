import { Injectable } from '@nestjs/common';
import { RateLimiter } from '../../kernel/antiabuso/rate-limit';
import { JANELA, RATE_LIMITS } from './invite-core';
import { RateLimitExcedidoError } from './invite-rate-limit';

/**
 * Rate limit do ACEITE de Convite (Story 8.3) — consome os limites que a 8.2 já definiu em
 * `RATE_LIMITS` e deixou DORMENTES (sem consumidor até agora, AD-11):
 *   - `aceitacaoPorIpPor15min` (20) — throttla brute-force de tokens vindo de um IP.
 *   - `aceitacaoPorConvitePor15min` (5) — throttla tentativas contra UM Convite específico.
 *
 * Política de domínio sobre o primitivo atômico `RateLimiter.contar` (mesmo de 2.8). **Fail-closed:** a
 * checagem precede qualquer resolução/escrita; um erro ao contar PROPAGA (a `RateLimiter` documenta
 * que não engole erro) e o aceite não acontece. Cobra por IP e por **hash do token** (conhecível
 * pré-contexto, sem revelar o Convite). O IP é o confiável do socket (`client-ip.ts`), nunca o
 * `X-Forwarded-For` cru — chave de rate limit não pode ser falsificável.
 *
 * Ambas as janelas são de 15 min → `Retry-After` de 900s. Avalia os DOIS e usa o MAIOR (coerente com
 * a política de emissão da 8.2).
 */
@Injectable()
export class InviteAcceptRateLimit {
  constructor(private readonly rateLimiter: RateLimiter) {}

  private static readonly RETRY_AFTER_S = Math.ceil(JANELA.quinzeMinMs / 1000);

  /** Cobra os limites de aceite. Lança `RateLimitExcedidoError` (→ 429 no controller) se algum estourar. */
  async cobrar(ip: string | undefined, tokenHash: string): Promise<void> {
    const politicaIp = { janelaMs: JANELA.quinzeMinMs, teto: RATE_LIMITS.aceitacaoPorIpPor15min };
    const politicaTok = {
      janelaMs: JANELA.quinzeMinMs,
      teto: RATE_LIMITS.aceitacaoPorConvitePor15min,
    };

    // Avalia AMBOS (não para no 1º) para não vazar por ordem qual limite estourou.
    const [porIp, porToken] = await Promise.all([
      this.rateLimiter.contar(`inv:acc:ip:${ip ?? 'sem-ip'}`, politicaIp),
      this.rateLimiter.contar(`inv:acc:tok:${tokenHash}`, politicaTok),
    ]);

    if (porIp.excedido || porToken.excedido) {
      throw new RateLimitExcedidoError(InviteAcceptRateLimit.RETRY_AFTER_S);
    }
  }
}
