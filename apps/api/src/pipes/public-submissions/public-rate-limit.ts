import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PoliticaRateLimit, RateLimiter } from '../../kernel/antiabuso/rate-limit';

/** Janela e teto do rate limit da submissão pública (baseline antiabuso — Story 2.8). */
const POLITICA: PoliticaRateLimit = {
  janelaMs: 10 * 60 * 1000, // 10 minutos
  teto: 20, // submissões por (IP confiável, publicId) na janela
};

/**
 * Rate limit da submissão pública por **IP confiável + `publicId`** (Story 2.8, baseline antiabuso).
 *
 * É a **política de domínio** sobre o primitivo técnico `RateLimiter` (kernel/antiabuso): define a chave
 * (namespace `pub:<ip>:<publicId>`), a janela e o teto, e traduz o excesso na resposta HTTP — **429**. A
 * contagem atômica (janela deslizante, sem read-modify-write de corrida) vive no kernel; aqui fica só o que
 * é da submissão pública.
 *
 * **Fail-closed:** a checagem precede qualquer escrita; um erro ao contar propaga e a submissão NÃO acontece.
 * O IP é o do socket (ou o 1º salto não confiável atrás de proxy confiável), nunca o `X-Forwarded-For` cru
 * (ver `client-ip.ts`) — chave de rate limit não pode ser falsificável.
 */
@Injectable()
export class PublicRateLimit {
  constructor(private readonly rateLimiter: RateLimiter) {}

  /** Registra uma tentativa; lança 429 se o teto na janela foi excedido. IP ausente também conta (chave fixa). */
  async registrar(ip: string | undefined, publicId: string): Promise<void> {
    const chave = `pub:${ip ?? 'sem-ip'}:${publicId}`;
    const { excedido } = await this.rateLimiter.contar(chave, POLITICA);
    if (excedido) {
      throw new HttpException(
        'muitas submissões; tente novamente mais tarde',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
