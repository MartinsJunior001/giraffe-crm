import { describe, expect, it } from 'vitest';
import {
  type EstadoCiclo,
  planejarTransicao,
} from '../src/pipes/cards/lifecycle/card-lifecycle.transitions';

/**
 * Matriz PURA das transições de ciclo de vida do Card (Story 2.11) — derivada dos ACs, sem banco. Prova toda a
 * tabela: transições válidas (com o evento e o `previous` corretos), idempotentes (já-no-alvo) e inválidas.
 */

describe('finalizar', () => {
  it('ATIVO → FINALIZADO (evento FINALIZED, sem previous)', () => {
    const r = planejarTransicao('finalizar', 'ATIVO', null);
    expect(r).toEqual({
      tipo: 'transicao',
      transicao: {
        target: 'FINALIZADO',
        novoPrevious: null,
        evento: 'FINALIZED',
        resumo: 'Card finalizado',
      },
    });
  });
  it('FINALIZADO → idempotente', () => {
    expect(planejarTransicao('finalizar', 'FINALIZADO', null)).toEqual({ tipo: 'idempotente' });
  });
  it('ARQUIVADO → inválido', () => {
    expect(planejarTransicao('finalizar', 'ARQUIVADO', 'ATIVO').tipo).toBe('invalido');
  });
});

describe('reabrir', () => {
  it('FINALIZADO → ATIVO (evento REOPENED)', () => {
    const r = planejarTransicao('reabrir', 'FINALIZADO', null);
    expect(r).toEqual({
      tipo: 'transicao',
      transicao: {
        target: 'ATIVO',
        novoPrevious: null,
        evento: 'REOPENED',
        resumo: 'Card reaberto',
      },
    });
  });
  it('ATIVO → idempotente', () => {
    expect(planejarTransicao('reabrir', 'ATIVO', null)).toEqual({ tipo: 'idempotente' });
  });
  it('ARQUIVADO → inválido', () => {
    expect(planejarTransicao('reabrir', 'ARQUIVADO', 'FINALIZADO').tipo).toBe('invalido');
  });
});

describe('arquivar (guarda o estado de origem)', () => {
  it('ATIVO → ARQUIVADO com previous=ATIVO (evento ARCHIVED)', () => {
    expect(planejarTransicao('arquivar', 'ATIVO', null)).toEqual({
      tipo: 'transicao',
      transicao: {
        target: 'ARQUIVADO',
        novoPrevious: 'ATIVO',
        evento: 'ARCHIVED',
        resumo: 'Card arquivado',
      },
    });
  });
  it('FINALIZADO → ARQUIVADO com previous=FINALIZADO', () => {
    const r = planejarTransicao('arquivar', 'FINALIZADO', null);
    expect(r.tipo === 'transicao' && r.transicao.novoPrevious).toBe('FINALIZADO');
  });
  it('ARQUIVADO → idempotente', () => {
    expect(planejarTransicao('arquivar', 'ARQUIVADO', 'ATIVO')).toEqual({ tipo: 'idempotente' });
  });
});

describe('restaurar (devolve ao estado preservado)', () => {
  it('ARQUIVADO(previous=FINALIZADO) → FINALIZADO, zerando o previous (evento RESTORED)', () => {
    expect(planejarTransicao('restaurar', 'ARQUIVADO', 'FINALIZADO')).toEqual({
      tipo: 'transicao',
      transicao: {
        target: 'FINALIZADO',
        novoPrevious: null,
        evento: 'RESTORED',
        resumo: 'Card restaurado',
      },
    });
  });
  it('ARQUIVADO(previous=ATIVO) → ATIVO', () => {
    const r = planejarTransicao('restaurar', 'ARQUIVADO', 'ATIVO');
    expect(r.tipo === 'transicao' && r.transicao.target).toBe('ATIVO');
  });
  it('ARQUIVADO sem previous registrado → restaura para ATIVO (defesa)', () => {
    const r = planejarTransicao('restaurar', 'ARQUIVADO', null);
    expect(r.tipo === 'transicao' && r.transicao.target).toBe('ATIVO');
  });
  it('não-arquivado → inválido (nada a restaurar)', () => {
    for (const e of ['ATIVO', 'FINALIZADO'] as EstadoCiclo[]) {
      expect(planejarTransicao('restaurar', e, null).tipo).toBe('invalido');
    }
  });
});

describe('ciclo completo preserva o estado de origem', () => {
  it('FINALIZADO → arquivar → restaurar volta a FINALIZADO (não a ATIVO)', () => {
    const arq = planejarTransicao('arquivar', 'FINALIZADO', null);
    const prev = arq.tipo === 'transicao' ? arq.transicao.novoPrevious : null;
    const res = planejarTransicao('restaurar', 'ARQUIVADO', prev);
    expect(res.tipo === 'transicao' && res.transicao.target).toBe('FINALIZADO');
  });
});
