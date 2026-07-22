import { describe, expect, it } from 'vitest';
import {
  derivarEventId,
  ehPapelValido,
  exigeStepUp,
  planejarAlteracaoPapel,
  planejarRevogacaoIncompativel,
  reduzQuantidadeDeAdmin,
} from '../src/organizations/members/membership-role.core';

/**
 * Núcleo PURO da alteração de papel (Story 8.4). Sem banco: prova cada invariante da decisão em unidade —
 * step-up exigido, proteção do último Admin, teto AD-9, no-op, idempotência do eventId.
 */

describe('exigeStepUp (D-1) — só promover→Admin e rebaixar Admin', () => {
  it('promover para Admin exige step-up', () => {
    expect(exigeStepUp('MEMBER', 'ADMIN')).toBe(true);
    expect(exigeStepUp('GUEST', 'ADMIN')).toBe(true);
  });
  it('rebaixar Admin exige step-up', () => {
    expect(exigeStepUp('ADMIN', 'MEMBER')).toBe(true);
    expect(exigeStepUp('ADMIN', 'GUEST')).toBe(true);
  });
  it('trocas entre não-Admins NÃO exigem step-up (gate escopado, não blanket)', () => {
    expect(exigeStepUp('MEMBER', 'GUEST')).toBe(false);
    expect(exigeStepUp('GUEST', 'MEMBER')).toBe(false);
  });
});

describe('reduzQuantidadeDeAdmin — gatilho da proteção do último Admin', () => {
  it('rebaixar Admin reduz; promover/trocar não', () => {
    expect(reduzQuantidadeDeAdmin('ADMIN', 'MEMBER')).toBe(true);
    expect(reduzQuantidadeDeAdmin('ADMIN', 'GUEST')).toBe(true);
    expect(reduzQuantidadeDeAdmin('MEMBER', 'ADMIN')).toBe(false);
    expect(reduzQuantidadeDeAdmin('MEMBER', 'GUEST')).toBe(false);
  });
});

describe('planejarAlteracaoPapel — decisão fail-closed e ordenada', () => {
  const base = { adminsAtivos: 3, stepUpValido: true } as const;

  it('alvo não-ativo → INATIVA (só Membership ativa muda de papel)', () => {
    expect(
      planejarAlteracaoPapel({
        ...base,
        papelAtual: 'MEMBER',
        novoPapel: 'ADMIN',
        estadoAlvo: 'SUSPENDED',
      }).tipo,
    ).toBe('INATIVA');
    expect(
      planejarAlteracaoPapel({
        ...base,
        papelAtual: 'MEMBER',
        novoPapel: 'ADMIN',
        estadoAlvo: 'REMOVED',
      }).tipo,
    ).toBe('INATIVA');
  });

  it('papel já é o desejado → NOOP (idempotência sem escrita)', () => {
    expect(
      planejarAlteracaoPapel({
        ...base,
        papelAtual: 'MEMBER',
        novoPapel: 'MEMBER',
        estadoAlvo: 'ACTIVE',
      }).tipo,
    ).toBe('NOOP');
  });

  it('exige step-up e não há janela → STEP_UP (mesmo com muitos admins)', () => {
    expect(
      planejarAlteracaoPapel({
        adminsAtivos: 5,
        stepUpValido: false,
        papelAtual: 'MEMBER',
        novoPapel: 'ADMIN',
        estadoAlvo: 'ACTIVE',
      }).tipo,
    ).toBe('STEP_UP');
  });

  it('rebaixar o ÚLTIMO Admin ativo (adminsAtivos <= 1) → ULTIMO_ADMIN', () => {
    expect(
      planejarAlteracaoPapel({
        adminsAtivos: 1,
        stepUpValido: true,
        papelAtual: 'ADMIN',
        novoPapel: 'MEMBER',
        estadoAlvo: 'ACTIVE',
      }).tipo,
    ).toBe('ULTIMO_ADMIN');
  });

  it('rebaixar Admin quando há 2+ admins → APLICAR', () => {
    expect(
      planejarAlteracaoPapel({
        adminsAtivos: 2,
        stepUpValido: true,
        papelAtual: 'ADMIN',
        novoPapel: 'MEMBER',
        estadoAlvo: 'ACTIVE',
      }).tipo,
    ).toBe('APLICAR');
  });

  it('promover para Admin com step-up → APLICAR (não é reduzir, contagem irrelevante)', () => {
    expect(
      planejarAlteracaoPapel({
        adminsAtivos: 1,
        stepUpValido: true,
        papelAtual: 'MEMBER',
        novoPapel: 'ADMIN',
        estadoAlvo: 'ACTIVE',
      }).tipo,
    ).toBe('APLICAR');
  });

  it('step-up é checado ANTES do último Admin (auth é pré-condição)', () => {
    expect(
      planejarAlteracaoPapel({
        adminsAtivos: 1,
        stepUpValido: false,
        papelAtual: 'ADMIN',
        novoPapel: 'MEMBER',
        estadoAlvo: 'ACTIVE',
      }).tipo,
    ).toBe('STEP_UP');
  });
});

describe('planejarRevogacaoIncompativel — teto AD-9 do Convidado', () => {
  const grants = [
    { id: 'g-admin', role: 'ADMIN' as const },
    { id: 'g-member', role: 'MEMBER' as const },
    { id: 'g-viewer', role: 'VIEWER' as const },
  ];
  it('rebaixar para GUEST revoga DatabaseGrants ≠ VIEWER; preserva VIEWER', () => {
    expect(planejarRevogacaoIncompativel('GUEST', grants)).toEqual(['g-admin', 'g-member']);
  });
  it('novo papel ≠ GUEST não revoga nada (sem teto)', () => {
    expect(planejarRevogacaoIncompativel('MEMBER', grants)).toEqual([]);
    expect(planejarRevogacaoIncompativel('ADMIN', grants)).toEqual([]);
  });
});

describe('derivarEventId — determinístico (outbox idempotente)', () => {
  it('mesma operação → mesmo id; operação distinta → id distinto', () => {
    const org = '11111111-1111-1111-1111-111111111111';
    const memb = '22222222-2222-2222-2222-222222222222';
    const corr = '33333333-3333-3333-3333-333333333333';
    const a = derivarEventId(org, memb, corr);
    const b = derivarEventId(org, memb, corr);
    const c = derivarEventId(org, memb, '44444444-4444-4444-4444-444444444444');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('ehPapelValido', () => {
  it('aceita os três papéis; rejeita o resto', () => {
    expect(ehPapelValido('ADMIN')).toBe(true);
    expect(ehPapelValido('MEMBER')).toBe(true);
    expect(ehPapelValido('GUEST')).toBe(true);
    expect(ehPapelValido('SUPERADMIN')).toBe(false);
    expect(ehPapelValido(null)).toBe(false);
    expect(ehPapelValido(1)).toBe(false);
  });
});
