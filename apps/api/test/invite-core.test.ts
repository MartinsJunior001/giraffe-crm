import { describe, expect, it } from 'vitest';
import {
  COOLDOWN_REENVIO_MS,
  VALIDADE_CONVITE_MS,
  calcularExpiracao,
  decidirCriacao,
  emailValido,
  estaExpirado,
  normalizarEmail,
  podeReenviar,
  RATE_LIMITS,
  validarParaAceite,
} from '../src/organizations/invites/invite-core';

/**
 * Núcleo puro do Convite (Story 8.2). Prova as decisões G2 (números, ciclo, conflitos) sem banco.
 * Cada valor testado vem da decisão material do dono — nenhum é inventado.
 */

describe('normalização e validação de e-mail', () => {
  it('normaliza trim + minúsculas', () => {
    expect(normalizarEmail('  Ana@Exemplo.TEST ')).toBe('ana@exemplo.test');
  });

  it('NÃO colapsa pontos nem +tag (conservador — política de provedor não é assumida)', () => {
    expect(normalizarEmail('a.b+x@exemplo.test')).toBe('a.b+x@exemplo.test');
  });

  it.each([
    ['ana@exemplo.test', true],
    ['a@b.co', true],
    ['sem-arroba', false],
    ['a@b', false],
    ['a b@x.test', false],
    ['', false],
  ])('emailValido(%s) = %s', (email, esperado) => {
    expect(emailValido(email)).toBe(esperado);
  });
});

describe('G2 — validade de 7 dias e cooldown de 60s', () => {
  it('a validade é exatamente 7 dias', () => {
    expect(VALIDADE_CONVITE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('calcularExpiracao soma 7 dias à emissão', () => {
    const emitido = new Date('2026-07-21T00:00:00Z');
    expect(calcularExpiracao(emitido).toISOString()).toBe('2026-07-28T00:00:00.000Z');
  });

  it('estaExpirado: no instante exato do prazo e depois → expirado; antes → não', () => {
    const exp = new Date('2026-07-28T00:00:00Z');
    expect(estaExpirado(exp, new Date('2026-07-27T23:59:59Z'))).toBe(false);
    expect(estaExpirado(exp, new Date('2026-07-28T00:00:00Z'))).toBe(true);
    expect(estaExpirado(exp, new Date('2026-07-28T00:00:01Z'))).toBe(true);
  });

  it('cooldown de reenvio é 60s e é respeitado nos limites', () => {
    expect(COOLDOWN_REENVIO_MS).toBe(60_000);
    const ultimo = new Date('2026-07-21T12:00:00Z');
    expect(podeReenviar(ultimo, new Date('2026-07-21T12:00:59Z'))).toBe(false);
    expect(podeReenviar(ultimo, new Date('2026-07-21T12:01:00Z'))).toBe(true);
  });
});

describe('G2 — números de rate limit', () => {
  it('bate exatamente com a decisão material', () => {
    expect(RATE_LIMITS).toEqual({
      emissaoPorAdminPorHora: 10,
      emissaoPorOrgPorDia: 100,
      emissaoPorDestinatarioNaOrgPorDia: 5,
      aceitacaoPorIpPor15min: 20,
      aceitacaoPorConvitePor15min: 5,
    });
  });
});

describe('decisão de criação — unicidade e conflitos (epics §616 + G2)', () => {
  it('Membership ATIVA → conflito JA_MEMBRO_ATIVO', () => {
    expect(decidirCriacao('ACTIVE', false)).toEqual({
      tipo: 'conflito',
      motivo: 'JA_MEMBRO_ATIVO',
    });
  });

  it('Membership SUSPENSA → conflito MEMBRO_SUSPENSO (orientar reativação)', () => {
    expect(decidirCriacao('SUSPENDED', false)).toEqual({
      tipo: 'conflito',
      motivo: 'MEMBRO_SUSPENSO',
    });
  });

  it('já há PENDING → conflito CONVITE_PENDENTE_EXISTE (renovar é reenvio)', () => {
    expect(decidirCriacao('NONE', true)).toEqual({
      tipo: 'conflito',
      motivo: 'CONVITE_PENDENTE_EXISTE',
    });
  });

  it('ATIVA tem precedência sobre pendente', () => {
    expect(decidirCriacao('ACTIVE', true).tipo).toBe('conflito');
    expect((decidirCriacao('ACTIVE', true) as { motivo: string }).motivo).toBe('JA_MEMBRO_ATIVO');
  });

  it('REMOVED (encerrada) sem pendente → criar (permite novo Convite)', () => {
    expect(decidirCriacao('REMOVED', false)).toEqual({ tipo: 'criar' });
  });

  it('NONE sem pendente → criar', () => {
    expect(decidirCriacao('NONE', false)).toEqual({ tipo: 'criar' });
  });
});

describe('validação para aceite — sem revelar existência de conta', () => {
  const futuro = new Date('2026-07-28T00:00:00Z');
  const agora = new Date('2026-07-21T00:00:00Z');

  it('PENDING dentro do prazo → ok', () => {
    expect(validarParaAceite('PENDING', futuro, agora)).toEqual({ ok: true });
  });

  it('PENDING com prazo vencido → EXPIRADO (derivação)', () => {
    const venceu = new Date('2026-07-20T00:00:00Z');
    expect(validarParaAceite('PENDING', venceu, agora)).toEqual({ ok: false, motivo: 'EXPIRADO' });
  });

  it.each([
    ['ACCEPTED', 'JA_USADO'],
    ['CANCELLED', 'REVOGADO'],
    ['EXPIRED', 'EXPIRADO'],
  ] as const)('%s → %s', (estado, motivo) => {
    expect(validarParaAceite(estado, futuro, agora)).toEqual({ ok: false, motivo });
  });
});
