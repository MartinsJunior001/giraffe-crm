import { describe, expect, it } from 'vitest';
import {
  InviteRateLimit,
  RateLimitExcedidoError,
} from '../src/organizations/invites/invite-rate-limit';
import { RATE_LIMITS } from '../src/organizations/invites/invite-core';

/**
 * Política de rate-limit de emissão/reenvio (Story 8.2, G2). Testada com um `RateLimiter` DUBLÊ — sem
 * banco: prova as chaves, os tetos, a inclusão do cooldown só no reenvio, e o `Retry-After`.
 */

/** Dublê do RateLimiter: registra as chamadas e marca `excedido` para as chaves programadas. */
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

const PARAMS = {
  orgId: 'org-1',
  adminAccountId: 'adm-1',
  normalizedEmail: 'ana@exemplo.test',
};

describe('InviteRateLimit — emissão', () => {
  it('cobra os TRÊS limites de emissão (admin/org/destinatário), sem cooldown', async () => {
    const { rl, chamadas } = fakeLimiter();
    await new InviteRateLimit(rl).cobrar(PARAMS);

    expect(chamadas.map((c) => c.chave)).toEqual([
      'inv:adm:adm-1',
      'inv:org:org-1',
      'inv:dest:org-1:ana@exemplo.test',
    ]);
    // Tetos vindos de RATE_LIMITS (G2).
    expect(chamadas[0]!.teto).toBe(RATE_LIMITS.emissaoPorAdminPorHora);
    expect(chamadas[1]!.teto).toBe(RATE_LIMITS.emissaoPorOrgPorDia);
    expect(chamadas[2]!.teto).toBe(RATE_LIMITS.emissaoPorDestinatarioNaOrgPorDia);
  });

  it('no REENVIO, cobra também o cooldown por Convite (teto 1, janela 60s)', async () => {
    const { rl, chamadas } = fakeLimiter();
    await new InviteRateLimit(rl).cobrar({ ...PARAMS, inviteId: 'conv-9' });

    const cooldown = chamadas.find((c) => c.chave === 'inv:cd:conv-9');
    expect(cooldown).toBeDefined();
    expect(cooldown!.teto).toBe(1);
    expect(cooldown!.janelaMs).toBe(60_000);
  });
});

describe('InviteRateLimit — excesso', () => {
  it('limite por admin excedido → RateLimitExcedidoError com Retry-After = 3600s (1h)', async () => {
    const { rl } = fakeLimiter(['inv:adm:']);
    await expect(new InviteRateLimit(rl).cobrar(PARAMS)).rejects.toMatchObject({
      name: 'RateLimitExcedidoError',
      retryAfterSeconds: 3600,
    });
  });

  it('limite por Organização excedido → Retry-After = 86400s (1 dia)', async () => {
    const { rl } = fakeLimiter(['inv:org:']);
    const erro = await new InviteRateLimit(rl).cobrar(PARAMS).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(RateLimitExcedidoError);
    expect((erro as RateLimitExcedidoError).retryAfterSeconds).toBe(86400);
  });

  it('cooldown de reenvio excedido → Retry-After = 60s', async () => {
    const { rl } = fakeLimiter(['inv:cd:']);
    const erro = await new InviteRateLimit(rl)
      .cobrar({ ...PARAMS, inviteId: 'conv-9' })
      .catch((e: unknown) => e);
    expect((erro as RateLimitExcedidoError).retryAfterSeconds).toBe(60);
  });

  it('para no PRIMEIRO limite excedido (não cobra os seguintes)', async () => {
    const { rl, chamadas } = fakeLimiter(['inv:adm:']);
    await new InviteRateLimit(rl).cobrar(PARAMS).catch(() => {});
    // Só a 1ª chave foi checada antes de lançar.
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]!.chave).toBe('inv:adm:adm-1');
  });
});
