import { Injectable } from '@nestjs/common';
import { type PoliticaRateLimit, RateLimiter } from '../../kernel/antiabuso/rate-limit';
import { COOLDOWN_REENVIO_MS, JANELA, RATE_LIMITS } from './invite-core';

/**
 * Excesso de rate-limit da emissão/reenvio (Story 8.2, G2). Erro de DOMÍNIO — carrega os segundos de
 * `Retry-After`; quem o traduz em **429 + header** é o controller (a fronteira HTTP). Manter o serviço
 * livre de `HttpException` é o que permite testá-lo sem o Nest.
 */
export class RateLimitExcedidoError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate limit excedido');
    this.name = 'RateLimitExcedidoError';
  }
}

/**
 * Política de rate-limit da EMISSÃO/REENVIO de Convite (Story 8.2, G2) sobre o primitivo atômico
 * `RateLimiter` (kernel/antiabuso). Aqui vive só a política de domínio — chaves, janelas, tetos; a
 * contagem sem corrida é do kernel.
 *
 * **Escopo 8.2:** só emissão/reenvio. Os limites de ACEITAÇÃO (por IP e por Convite) são do endpoint
 * de aceite, que é da Story 8.3 — os números já vivem em `invite-core.RATE_LIMITS` para lá.
 *
 * `Retry-After` é o tamanho da janela do limite excedido (segundos): teto conservador e honesto (o
 * primitivo conta por janela deslizante e não expõe o instante exato de liberação).
 */
@Injectable()
export class InviteRateLimit {
  constructor(private readonly rateLimiter: RateLimiter) {}

  private readonly porAdmin: PoliticaRateLimit = {
    janelaMs: JANELA.horaMs,
    teto: RATE_LIMITS.emissaoPorAdminPorHora,
  };
  private readonly porOrg: PoliticaRateLimit = {
    janelaMs: JANELA.diaMs,
    teto: RATE_LIMITS.emissaoPorOrgPorDia,
  };
  private readonly porDestinatario: PoliticaRateLimit = {
    janelaMs: JANELA.diaMs,
    teto: RATE_LIMITS.emissaoPorDestinatarioNaOrgPorDia,
  };
  private readonly cooldown: PoliticaRateLimit = { janelaMs: COOLDOWN_REENVIO_MS, teto: 1 };

  /**
   * Cobra os limites ANTES da entrega (fail-closed). Lança `RateLimitExcedidoError` no 1º limite
   * excedido. `inviteId` presente ⇒ reenvio, e o cooldown de 60s por Convite também é cobrado.
   *
   * As chaves carregam o namespace `inv:` e o `orgId`/`accountId` do CONTEXTO (nunca do cliente),
   * então não são falsificáveis. A checagem precede qualquer escrita/entrega.
   */
  async cobrar(params: {
    orgId: string;
    adminAccountId: string;
    normalizedEmail: string;
    inviteId?: string;
  }): Promise<void> {
    const { orgId, adminAccountId, normalizedEmail, inviteId } = params;

    const checagens: Array<{ chave: string; politica: PoliticaRateLimit }> = [
      { chave: `inv:adm:${adminAccountId}`, politica: this.porAdmin },
      { chave: `inv:org:${orgId}`, politica: this.porOrg },
      { chave: `inv:dest:${orgId}:${normalizedEmail}`, politica: this.porDestinatario },
    ];
    if (inviteId) {
      checagens.push({ chave: `inv:cd:${inviteId}`, politica: this.cooldown });
    }

    for (const { chave, politica } of checagens) {
      const { excedido } = await this.rateLimiter.contar(chave, politica);
      if (excedido) {
        throw new RateLimitExcedidoError(Math.ceil(politica.janelaMs / 1000));
      }
    }
  }
}
