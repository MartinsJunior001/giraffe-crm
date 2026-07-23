import { describe, expect, it } from 'vitest';
import {
  aplicarCap,
  aplicarRegraAtor,
  type CandidatoDestinatario,
  colapsarPorMembership,
  MAX_DESTINATARIOS,
} from '../src/notifications/distribution/notification-distribution.core';

/**
 * Provas PURAS do núcleo de distribuição (Story 5.6) — dedup por Membership (OQ-33.b), regra do ator (OQ-33.a) e
 * CAP de fan-out (OQ-33.f). Sem banco, sem Nest.
 */

function c(membershipId: string, userId: string): CandidatoDestinatario {
  return { membershipId, userId };
}

describe('colapsarPorMembership — múltiplos papéis → 1 pessoa', () => {
  it('colapsa a mesma Membership repetida, preservando a 1ª ocorrência', () => {
    const out = colapsarPorMembership([c('m1', 'u1'), c('m1', 'u1'), c('m2', 'u2')]);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.membershipId).sort()).toEqual(['m1', 'm2']);
  });

  it('lista vazia → vazia', () => {
    expect(colapsarPorMembership([])).toEqual([]);
  });
});

describe('aplicarRegraAtor — exclusão/inclusão do ator', () => {
  it('exclui o ator quando incluirAtor=false (por userId)', () => {
    const out = aplicarRegraAtor([c('m1', 'ator'), c('m2', 'outro')], 'ator', false);
    expect(out.map((x) => x.userId)).toEqual(['outro']);
  });

  it('mantém o ator quando incluirAtor=true', () => {
    const out = aplicarRegraAtor([c('m1', 'ator'), c('m2', 'outro')], 'ator', true);
    expect(out).toHaveLength(2);
  });

  it('ator nulo (evento de sistema) não exclui ninguém', () => {
    const out = aplicarRegraAtor([c('m1', 'u1'), c('m2', 'u2')], null, false);
    expect(out).toHaveLength(2);
  });
});

describe('aplicarCap — fan-out limitado (fail-closed determinístico)', () => {
  it('não trunca abaixo do teto', () => {
    const entrada = [c('m1', 'u1'), c('m2', 'u2')];
    const { destinatarios, truncados } = aplicarCap(entrada);
    expect(truncados).toBe(0);
    expect(destinatarios).toHaveLength(2);
  });

  it('trunca de forma determinística acima do teto', () => {
    const entrada = Array.from({ length: MAX_DESTINATARIOS + 5 }, (_, i) =>
      c(`m-${String(i).padStart(4, '0')}`, `u-${i}`),
    );
    const { destinatarios, truncados } = aplicarCap(entrada);
    expect(destinatarios).toHaveLength(MAX_DESTINATARIOS);
    expect(truncados).toBe(5);
    // Determinístico: sempre os menores `membershipId` por ordenação estável.
    expect(destinatarios[0]?.membershipId).toBe('m-0000');
  });
});
