import { describe, expect, it } from 'vitest';
import {
  planejarRemocao,
  remocaoReduzAdmin,
} from '../src/organizations/members/membership-removal.core';
import type {
  MembershipRole,
  MembershipState,
} from '../src/organizations/members/membership-role.core';

/**
 * Núcleo PURO da remoção/saída (Story 8.6), provado sem PostgreSQL. A ATOMICIDADE do último Admin (o que
 * só o banco garante) é provada por `membership-removal-http` (concorrência real); aqui prova-se a REGRA.
 */

function entrada(over: {
  estadoAtual?: MembershipState;
  adminsAtivos?: number;
  papelAlvo?: MembershipRole;
  stepUpValido?: boolean;
}) {
  return {
    estadoAtual: over.estadoAtual ?? 'ACTIVE',
    adminsAtivos: over.adminsAtivos ?? 2,
    papelAlvo: over.papelAlvo ?? 'MEMBER',
    stepUpValido: over.stepUpValido ?? true,
  } as const;
}

describe('planejarRemocao — ordem determinística e fail-closed', () => {
  it('já REMOVED → NOOP (idempotente), mesmo sem step-up (no-op não exige auth)', () => {
    expect(planejarRemocao(entrada({ estadoAtual: 'REMOVED', stepUpValido: false }))).toEqual({
      tipo: 'NOOP',
    });
  });

  it('sem step-up → STEP_UP (antes de qualquer aplicação)', () => {
    expect(planejarRemocao(entrada({ stepUpValido: false }))).toEqual({ tipo: 'STEP_UP' });
  });

  it('remove o ÚLTIMO Admin ativo → ULTIMO_ADMIN (com step-up válido)', () => {
    expect(
      planejarRemocao(entrada({ papelAlvo: 'ADMIN', adminsAtivos: 1, stepUpValido: true })),
    ).toEqual({ tipo: 'ULTIMO_ADMIN' });
  });

  it('remove um Admin quando há OUTROS Admins ativos → APLICAR', () => {
    expect(planejarRemocao(entrada({ papelAlvo: 'ADMIN', adminsAtivos: 2 }))).toEqual({
      tipo: 'APLICAR',
    });
  });

  it('remove um MEMBER (não reduz Admin) mesmo com 1 Admin na Org → APLICAR', () => {
    expect(planejarRemocao(entrada({ papelAlvo: 'MEMBER', adminsAtivos: 1 }))).toEqual({
      tipo: 'APLICAR',
    });
  });

  it('remove um Admin SUSPENDED (não é Admin ativo → não reduz) mesmo com adminsAtivos=1 → APLICAR', () => {
    expect(
      planejarRemocao(entrada({ estadoAtual: 'SUSPENDED', papelAlvo: 'ADMIN', adminsAtivos: 1 })),
    ).toEqual({ tipo: 'APLICAR' });
  });

  it('NÃO existe bloqueio de auto-alvo: a saída própria é permitida (diferente da autossuspensão)', () => {
    // O núcleo não recebe `ehProprio`; a distinção é só de auditoria no serviço.
    expect(planejarRemocao(entrada({ papelAlvo: 'MEMBER' }))).toEqual({ tipo: 'APLICAR' });
  });

  it('step-up é exigido ANTES do último-admin (sem step-up e último Admin → STEP_UP, não ULTIMO_ADMIN)', () => {
    expect(
      planejarRemocao(entrada({ papelAlvo: 'ADMIN', adminsAtivos: 1, stepUpValido: false })),
    ).toEqual({ tipo: 'STEP_UP' });
  });
});

describe('remocaoReduzAdmin', () => {
  it('só reduz quando o alvo é ADMIN ATIVO', () => {
    expect(remocaoReduzAdmin('ACTIVE', 'ADMIN')).toBe(true);
    expect(remocaoReduzAdmin('SUSPENDED', 'ADMIN')).toBe(false); // suspenso não conta como ativo
    expect(remocaoReduzAdmin('ACTIVE', 'MEMBER')).toBe(false);
    expect(remocaoReduzAdmin('ACTIVE', 'GUEST')).toBe(false);
    expect(remocaoReduzAdmin('REMOVED', 'ADMIN')).toBe(false);
  });
});
