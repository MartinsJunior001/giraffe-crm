import { describe, expect, it } from 'vitest';
import type { Condicao } from '../src/pipes/automations/automation-config';
import {
  CONDICOES_CATALOGO,
  CondicaoForaDoCatalogoError,
  exigirCondicoesNoCatalogo,
  obterCondicaoCatalogo,
  TIPOS_CONDICAO,
} from '../src/pipes/automations/conditions/condition-catalog';

/**
 * Catálogo de Condições (Story 4.4) — teste PURO do vocabulário fixo/completo da Fase 1 (5 domínios) e do
 * enforcement fail-closed de configuração. Sem banco: o catálogo é um invariante testável sem PostgreSQL,
 * como `event-catalog.core.test.ts` (4.3).
 */

/** Os 7 tipos EXATOS cobrindo os 5 domínios oficiais (Story §1355) — congela o catálogo. */
const CATALOGO_ESPERADO = [
  'CARD_LIFECYCLE_STATE',
  'CARD_HEALTH',
  'CARD_PHASE',
  'CARD_FIELD_VALUE',
  'RECORD_FIELD_VALUE',
  'CARD_MILESTONE',
  'CARD_HAS_RECORD_LINK',
];

/** Helper: constrói uma Condição estrutural (como a 4.1 a produziria). */
function cond(parcial: Partial<Condicao>): Condicao {
  return { tipo: 'CARD_HEALTH', operador: 'igual', valor: 'ok', refs: [], ...parcial };
}

describe('catálogo de Condições — fixo, completo, 5 domínios', () => {
  it('contém EXATAMENTE os 7 tipos aprovados', () => {
    expect([...TIPOS_CONDICAO].sort()).toEqual([...CATALOGO_ESPERADO].sort());
    expect(CONDICOES_CATALOGO).toHaveLength(7);
  });

  it('cobre os cinco domínios oficiais', () => {
    const dominios = new Set(CONDICOES_CATALOGO.map((c) => c.dominio));
    expect([...dominios].sort()).toEqual(['CARD', 'DEADLINE', 'FIELD', 'LINK', 'PHASE']);
  });

  it('as Condições de valor exigem uma referência de Campo; a de Fase, de Fase', () => {
    expect(obterCondicaoCatalogo('CARD_FIELD_VALUE')?.refExigida).toBe('FIELD');
    expect(obterCondicaoCatalogo('RECORD_FIELD_VALUE')?.refExigida).toBe('FIELD');
    expect(obterCondicaoCatalogo('CARD_PHASE')?.refExigida).toBe('PHASE');
    expect(obterCondicaoCatalogo('CARD_HEALTH')?.refExigida).toBeNull();
  });
});

describe('enforcement fail-closed (exigirCondicoesNoCatalogo)', () => {
  it('array VAZIO é legítimo (ausência de Condição = aprovação direta)', () => {
    expect(() => exigirCondicoesNoCatalogo([])).not.toThrow();
  });

  it('aceita cada tipo do catálogo com operador/valor/refs válidos', () => {
    const validas: Condicao[] = [
      cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'igual', valor: 'ATIVO' }),
      cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'diferente', valor: 'ARQUIVADO' }),
      cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'atrasado' }),
      cond({
        tipo: 'CARD_PHASE',
        operador: 'igual',
        valor: null,
        refs: [{ tipo: 'PHASE', id: '11111111-1111-4111-8111-111111111111' }],
      }),
      cond({
        tipo: 'CARD_FIELD_VALUE',
        operador: 'contem',
        valor: 'x',
        refs: [{ tipo: 'FIELD', id: '22222222-2222-4222-8222-222222222222' }],
      }),
      cond({
        tipo: 'RECORD_FIELD_VALUE',
        operador: 'mudou',
        valor: null,
        refs: [{ tipo: 'FIELD', id: '33333333-3333-4333-8333-333333333333' }],
      }),
      cond({ tipo: 'CARD_MILESTONE', operador: 'atingido', valor: 'vencimento' }),
      cond({ tipo: 'CARD_HAS_RECORD_LINK', operador: 'existe', valor: null }),
    ];
    expect(() => exigirCondicoesNoCatalogo(validas)).not.toThrow();
  });

  it('rejeita tipo de Condição DESCONHECIDO', () => {
    expect(() => exigirCondicoesNoCatalogo([cond({ tipo: 'CAMPO' })])).toThrow(
      CondicaoForaDoCatalogoError,
    );
    expect(() => exigirCondicoesNoCatalogo([cond({ tipo: 'CARD_XYZ' })])).toThrow(/desconhecido/);
  });

  it('rejeita operador inválido para o tipo (ex.: `contem` num estado de ciclo de vida)', () => {
    expect(() =>
      exigirCondicoesNoCatalogo([
        cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'contem', valor: 'ATIVO' }),
      ]),
    ).toThrow(/operador inválido/);
  });

  it('rejeita valor fora do domínio (estado/saúde/marco inexistentes)', () => {
    expect(() =>
      exigirCondicoesNoCatalogo([cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'zumbi' })]),
    ).toThrow(/valor fora do domínio/);
    expect(() =>
      exigirCondicoesNoCatalogo([
        cond({ tipo: 'CARD_MILESTONE', operador: 'atingido', valor: 'ontem' }),
      ]),
    ).toThrow(/valor fora do domínio/);
  });

  it('rejeita ausência da referência EXIGIDA (Campo/Fase)', () => {
    expect(() =>
      exigirCondicoesNoCatalogo([
        cond({ tipo: 'CARD_FIELD_VALUE', operador: 'igual', valor: 'x', refs: [] }),
      ]),
    ).toThrow(/exatamente uma referência/);
    expect(() =>
      exigirCondicoesNoCatalogo([
        cond({ tipo: 'CARD_PHASE', operador: 'igual', valor: null, refs: [] }),
      ]),
    ).toThrow(/exatamente uma referência/);
  });

  it('rejeita MAIS de uma referência exigida (alvo determinístico, não varredura)', () => {
    expect(() =>
      exigirCondicoesNoCatalogo([
        cond({
          tipo: 'CARD_FIELD_VALUE',
          operador: 'igual',
          valor: 'x',
          refs: [
            { tipo: 'FIELD', id: '22222222-2222-4222-8222-222222222222' },
            { tipo: 'FIELD', id: '33333333-3333-4333-8333-333333333333' },
          ],
        }),
      ]),
    ).toThrow(/exatamente uma referência/);
  });
});
