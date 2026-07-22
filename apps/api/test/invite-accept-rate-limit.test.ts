import { describe, expect, it } from 'vitest';
import { InviteAcceptRateLimit } from '../src/organizations/invites/invite-accept-rate-limit';
import { RateLimitExcedidoError } from '../src/organizations/invites/invite-rate-limit';
import { RATE_LIMITS } from '../src/organizations/invites/invite-core';

/**
 * Rate limit do ACEITE (Story 8.3) com um `RateLimiter` DUBLÊ — sem banco: prova as chaves (por IP e
 * por hash do token), os tetos vindos de `RATE_LIMITS` (limites que a 8.2 deixou dormentes), e o
 * `Retry-After` de 900s (janela de 15 min). Fail-closed é do primitivo (que propaga erro ao contar).
 */
function fakeLimiter(excederPrefixos: string[] = []) {
  const chamadas: { chave: string; janelaMs: number; teto: number }[] = [];
  const rl = {
    contar: (chave: string, politica: { janelaMs: number; teto: number }) => {
      chamadas.push({ chave, janelaMs: politica.janelaMs, teto: politica.teto });
      const excedido = excederPrefixos.some((p) => chave.startsWith(p));
      return Promise.resolve({ count: excedido ? politica.teto + 1 : 1, excedido });
    },
  };
  return { rl: rl as never, chamadas };
}

const IP = '203.0.113.7';
const HASH = 'a'.repeat(64);

describe('InviteAcceptRateLimit', () => {
  it('cobra AMBOS os limites: por IP e por hash do token, com os tetos de RATE_LIMITS', async () => {
    const { rl, chamadas } = fakeLimiter();
    await new InviteAcceptRateLimit(rl).cobrar(IP, HASH);

    const porChave = new Map(chamadas.map((c) => [c.chave, c]));
    expect(porChave.get(`inv:acc:ip:${IP}`)?.teto).toBe(RATE_LIMITS.aceitacaoPorIpPor15min);
    expect(porChave.get(`inv:acc:tok:${HASH}`)?.teto).toBe(RATE_LIMITS.aceitacaoPorConvitePor15min);
    expect(chamadas).toHaveLength(2);
  });

  it('IP ausente vira chave fixa (ainda conta) — não é bypass', async () => {
    const { rl, chamadas } = fakeLimiter();
    await new InviteAcceptRateLimit(rl).cobrar(undefined, HASH);
    expect(chamadas.some((c) => c.chave === 'inv:acc:ip:sem-ip')).toBe(true);
  });

  it('teto por IP excedido → RateLimitExcedidoError com Retry-After 900s (15 min)', async () => {
    const { rl } = fakeLimiter(['inv:acc:ip:']);
    const erro = await new InviteAcceptRateLimit(rl).cobrar(IP, HASH).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(RateLimitExcedidoError);
    expect((erro as RateLimitExcedidoError).retryAfterSeconds).toBe(900);
  });

  it('teto por token excedido → 429 (mesmo IP sob o limite)', async () => {
    const { rl } = fakeLimiter(['inv:acc:tok:']);
    const erro = await new InviteAcceptRateLimit(rl).cobrar(IP, HASH).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(RateLimitExcedidoError);
  });

  it('nenhum limite excedido → não lança', async () => {
    const { rl } = fakeLimiter();
    await expect(new InviteAcceptRateLimit(rl).cobrar(IP, HASH)).resolves.toBeUndefined();
  });
});
