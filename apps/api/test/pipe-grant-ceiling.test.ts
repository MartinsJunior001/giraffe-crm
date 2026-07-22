import { describe, expect, it } from 'vitest';
import {
  convidadoPodeRevisarSubmissoes,
  pipeGrantsIncompativeisConvidado,
  tetoPoderPorPapelOrg,
  violacaoTetoConvidado,
} from '../src/pipes/grants/pipe-grant-ceiling';

/**
 * Núcleo PURO do teto de PipeGrant do CONVIDADO (DEB-PIPEGRANT-GUEST-CEILING). Prova, sem banco, cada
 * invariante da decisão: CONVIDADO limitado a SOMENTE_LEITURA (+ modificadores restritivos); ADMIN/MEMBER
 * de Org sem teto reduzido; capacidade expansiva vedada; fail-closed do poder efetivo; e o cálculo dos
 * grants incompatíveis no rebaixamento para GUEST.
 */

describe('violacaoTetoConvidado — write-side (conceder/alterar)', () => {
  it('CONVIDADO só pode VIEWER: ADMIN e MEMBER são recusados (motivo sanitizado)', () => {
    expect(violacaoTetoConvidado('GUEST', { role: 'ADMIN' })).toMatch(/Somente leitura|VIEWER/);
    expect(violacaoTetoConvidado('GUEST', { role: 'MEMBER' })).toMatch(/Somente leitura|VIEWER/);
  });

  it('CONVIDADO com VIEWER é permitido (null)', () => {
    expect(violacaoTetoConvidado('GUEST', { role: 'VIEWER' })).toBeNull();
  });

  it('CONVIDADO com VIEWER + restritoAoProprio (VISÃO_RESTRITA) é permitido — modificador restritivo', () => {
    // `restritoAoProprio` não entra na checagem: é RESTRITIVO, expressamente permitido ao Convidado.
    expect(
      violacaoTetoConvidado('GUEST', { role: 'VIEWER', reviewPublicSubmissions: false }),
    ).toBeNull();
  });

  it('CONVIDADO com reviewPublicSubmissions=true é recusado (capacidade operacional além do teto)', () => {
    expect(
      violacaoTetoConvidado('GUEST', { role: 'VIEWER', reviewPublicSubmissions: true }),
    ).toMatch(/submiss/i);
  });

  it('MEMBER e ADMIN de Org NÃO têm teto reduzido (a decisão é só do Convidado)', () => {
    expect(violacaoTetoConvidado('MEMBER', { role: 'ADMIN' })).toBeNull();
    expect(
      violacaoTetoConvidado('MEMBER', { role: 'MEMBER', reviewPublicSubmissions: true }),
    ).toBeNull();
    expect(violacaoTetoConvidado('ADMIN', { role: 'ADMIN' })).toBeNull();
  });
});

describe('tetoPoderPorPapelOrg — read-side fail-closed (poder efetivo)', () => {
  it('CONVIDADO nunca supera leitura, mesmo com poder derivado de grant legado', () => {
    expect(tetoPoderPorPapelOrg('GUEST', 'gerenciar')).toBe('ler');
    expect(tetoPoderPorPapelOrg('GUEST', 'operar')).toBe('ler');
    expect(tetoPoderPorPapelOrg('GUEST', 'ler')).toBe('ler');
  });

  it('MEMBER/ADMIN de Org preservam o poder derivado do grant', () => {
    expect(tetoPoderPorPapelOrg('MEMBER', 'gerenciar')).toBe('gerenciar');
    expect(tetoPoderPorPapelOrg('MEMBER', 'operar')).toBe('operar');
    expect(tetoPoderPorPapelOrg('ADMIN', 'gerenciar')).toBe('gerenciar');
  });
});

describe('convidadoPodeRevisarSubmissoes — read-side fail-closed (capacidade)', () => {
  it('CONVIDADO nunca revisa submissões públicas; MEMBER/ADMIN podem (por concessão)', () => {
    expect(convidadoPodeRevisarSubmissoes('GUEST')).toBe(false);
    expect(convidadoPodeRevisarSubmissoes('MEMBER')).toBe(true);
    expect(convidadoPodeRevisarSubmissoes('ADMIN')).toBe(true);
  });
});

describe('pipeGrantsIncompativeisConvidado — reconciliação no rebaixamento para GUEST', () => {
  const grants = [
    { id: 'g-admin', role: 'ADMIN' as const },
    { id: 'g-member', role: 'MEMBER' as const },
    { id: 'g-viewer', role: 'VIEWER' as const },
  ];

  it('rebaixar para GUEST aponta os grants ≠ VIEWER como incompatíveis (recusa), preserva VIEWER', () => {
    expect(pipeGrantsIncompativeisConvidado('GUEST', grants)).toEqual(['g-admin', 'g-member']);
  });

  it('novo papel ≠ GUEST não gera incompatibilidade (sem teto)', () => {
    expect(pipeGrantsIncompativeisConvidado('MEMBER', grants)).toEqual([]);
    expect(pipeGrantsIncompativeisConvidado('ADMIN', grants)).toEqual([]);
  });

  it('GUEST sem grants acima do teto → lista vazia (pode prosseguir)', () => {
    expect(pipeGrantsIncompativeisConvidado('GUEST', [{ id: 'g-viewer', role: 'VIEWER' }])).toEqual(
      [],
    );
  });
});
