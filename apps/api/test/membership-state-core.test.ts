import { describe, expect, it } from 'vitest';
import {
  estadoDestino,
  planejarTransicaoEstado,
  suspensaoReduzAdmin,
  tipoEvento,
} from '../src/organizations/members/membership-state.core';

/**
 * Núcleo PURO da transição de estado da Membership (Story 8.5) — provado sem PostgreSQL. Cada
 * ramificação fail-closed é um invariante: transição inválida, no-op idempotente, autossuspensão
 * vedada, step-up exigido (D-1), proteção do último Admin (D-2).
 */

const base = {
  ehProprio: false,
  adminsAtivos: 3,
  papelAlvo: 'MEMBER' as const,
  stepUpValido: true,
};

describe('planejarTransicaoEstado — SUSPENDER', () => {
  it('membro ativo com step-up e sem ser o último Admin → APLICAR', () => {
    expect(
      planejarTransicaoEstado({ ...base, estadoAtual: 'ACTIVE', transicao: 'SUSPENDER' }),
    ).toEqual({
      tipo: 'APLICAR',
    });
  });

  it('já SUSPENDED → NOOP (idempotente, sem escrita)', () => {
    expect(
      planejarTransicaoEstado({ ...base, estadoAtual: 'SUSPENDED', transicao: 'SUSPENDER' }),
    ).toEqual({ tipo: 'NOOP' });
  });

  it('alvo REMOVED → ESTADO_INVALIDO (não se suspende encerrada)', () => {
    expect(
      planejarTransicaoEstado({ ...base, estadoAtual: 'REMOVED', transicao: 'SUSPENDER' }),
    ).toEqual({ tipo: 'ESTADO_INVALIDO' });
  });

  it('autossuspensão é vedada ANTES do step-up (não vaza requisito de ação proibida)', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'ACTIVE',
        transicao: 'SUSPENDER',
        ehProprio: true,
        stepUpValido: false,
      }),
    ).toEqual({ tipo: 'AUTOSSUSPENSAO' });
  });

  it('sem step-up → STEP_UP', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'ACTIVE',
        transicao: 'SUSPENDER',
        stepUpValido: false,
      }),
    ).toEqual({ tipo: 'STEP_UP' });
  });

  it('suspender o ÚLTIMO Admin ativo → ULTIMO_ADMIN', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'ACTIVE',
        transicao: 'SUSPENDER',
        papelAlvo: 'ADMIN',
        adminsAtivos: 1,
      }),
    ).toEqual({ tipo: 'ULTIMO_ADMIN' });
  });

  it('suspender um Admin quando há 2 → APLICAR (a proteção só barra o último)', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'ACTIVE',
        transicao: 'SUSPENDER',
        papelAlvo: 'ADMIN',
        adminsAtivos: 2,
      }),
    ).toEqual({ tipo: 'APLICAR' });
  });

  it('step-up é checado ANTES do último Admin (auth é pré-condição)', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'ACTIVE',
        transicao: 'SUSPENDER',
        papelAlvo: 'ADMIN',
        adminsAtivos: 1,
        stepUpValido: false,
      }),
    ).toEqual({ tipo: 'STEP_UP' });
  });
});

describe('planejarTransicaoEstado — REATIVAR', () => {
  it('suspensa com step-up → APLICAR', () => {
    expect(
      planejarTransicaoEstado({ ...base, estadoAtual: 'SUSPENDED', transicao: 'REATIVAR' }),
    ).toEqual({ tipo: 'APLICAR' });
  });

  it('já ACTIVE → NOOP', () => {
    expect(
      planejarTransicaoEstado({ ...base, estadoAtual: 'ACTIVE', transicao: 'REATIVAR' }),
    ).toEqual({ tipo: 'NOOP' });
  });

  it('REMOVED → ESTADO_INVALIDO (encerramento não é reativação simples — exige novo aceite)', () => {
    expect(
      planejarTransicaoEstado({ ...base, estadoAtual: 'REMOVED', transicao: 'REATIVAR' }),
    ).toEqual({ tipo: 'ESTADO_INVALIDO' });
  });

  it('sem step-up → STEP_UP', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'SUSPENDED',
        transicao: 'REATIVAR',
        stepUpValido: false,
      }),
    ).toEqual({ tipo: 'STEP_UP' });
  });

  it('reativar NÃO tem trava de último Admin nem de autossuspensão (adiciona acesso)', () => {
    expect(
      planejarTransicaoEstado({
        ...base,
        estadoAtual: 'SUSPENDED',
        transicao: 'REATIVAR',
        papelAlvo: 'ADMIN',
        adminsAtivos: 0,
        ehProprio: true,
      }),
    ).toEqual({ tipo: 'APLICAR' });
  });
});

describe('helpers', () => {
  it('suspensaoReduzAdmin: só quando ACTIVE e ADMIN', () => {
    expect(suspensaoReduzAdmin('ACTIVE', 'ADMIN')).toBe(true);
    expect(suspensaoReduzAdmin('ACTIVE', 'MEMBER')).toBe(false);
    expect(suspensaoReduzAdmin('SUSPENDED', 'ADMIN')).toBe(false);
  });

  it('estadoDestino / tipoEvento', () => {
    expect(estadoDestino('SUSPENDER')).toBe('SUSPENDED');
    expect(estadoDestino('REATIVAR')).toBe('ACTIVE');
    expect(tipoEvento('SUSPENDER')).toBe('SUSPENDED');
    expect(tipoEvento('REATIVAR')).toBe('REACTIVATED');
  });
});
