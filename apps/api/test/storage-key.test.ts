import { describe, expect, it } from 'vitest';
import { chaveQuarentena, montarChave, pertenceAoTenant } from '../src/kernel/storage/storage-key';

/**
 * Chave de storage e guarda de tenant por SEGMENTO (Story 3.7, US3) — PURO. Prova o invariante que fecha o
 * acesso cruzado: a guarda é por segmento, nunca `startsWith`, então `orgAlvo` não é prefixo de `orgAlvo-malicioso`.
 */

describe('montarChave', () => {
  it('gera `<orgId>/<uuid>` — o orgId é o 1º segmento', () => {
    const org = '11111111-1111-1111-1111-111111111111';
    const chave = montarChave(org);
    expect(chave.startsWith(`${org}/`)).toBe(true);
    expect(chave.split('/')[0]).toBe(org);
  });
});

describe('chaveQuarentena', () => {
  it('deriva `<orgId>/q/<uuid>` preservando o orgId como 1º segmento', () => {
    const chave = 'org-a/abc-uuid';
    expect(chaveQuarentena(chave)).toBe('org-a/q/abc-uuid');
    expect(chaveQuarentena(chave).split('/')[0]).toBe('org-a');
  });
});

describe('pertenceAoTenant (guarda por segmento — o coração do isolamento cross-tenant)', () => {
  it('aceita a chave da própria Org', () => {
    expect(pertenceAoTenant('org-a/uuid', 'org-a')).toBe(true);
    expect(pertenceAoTenant('org-a/q/uuid', 'org-a')).toBe(true);
  });

  it('rejeita a chave de outra Org', () => {
    expect(pertenceAoTenant('org-b/uuid', 'org-a')).toBe(false);
  });

  it('NÃO é enganada por prefixo: "org-a" não casa com "org-alonga/..."', () => {
    // Este é o teste que um `startsWith` ingênuo FALHARIA (deixaria passar).
    expect(pertenceAoTenant('org-alonga/uuid', 'org-a')).toBe(false);
    expect(pertenceAoTenant('org-a-malicioso/uuid', 'org-a')).toBe(false);
  });

  it('rejeita orgId vazio (sem contexto ⇒ nada casa — fail-closed)', () => {
    expect(pertenceAoTenant('/uuid', '')).toBe(false);
    expect(pertenceAoTenant('org-a/uuid', '')).toBe(false);
  });
});
