import { describe, expect, it } from 'vitest';
import {
  type AcaoCiclo,
  type EstadoAutomacao,
  planejarTransicao,
} from '../src/pipes/automations/automation-lifecycle.transitions';

/**
 * Matriz PURA das transições de ciclo de vida da Automação (Story 4.2), sem banco — como
 * `card-lifecycle-transitions.test.ts` (2.11). Prova cada regra de D4.3: idempotência, transição válida e
 * transição inválida (409). Ser puro é o que torna a matriz inteira testável em milissegundos.
 */

const ESTADOS: EstadoAutomacao[] = ['INACTIVE', 'ACTIVE', 'ARCHIVED'];
const ACOES: AcaoCiclo[] = ['ativar', 'desativar', 'arquivar', 'restaurar'];

describe('planejarTransicao — cobertura de toda a matriz', () => {
  it('cada combinação (ação × estado) tem um plano determinístico', () => {
    for (const acao of ACOES) {
      for (const estado of ESTADOS) {
        const plano = planejarTransicao(acao, estado);
        expect(['transicao', 'idempotente', 'invalido']).toContain(plano.tipo);
      }
    }
  });
});

describe('ativar', () => {
  it('INACTIVE → ACTIVE e CONGELA uma versão', () => {
    const plano = planejarTransicao('ativar', 'INACTIVE');
    expect(plano).toMatchObject({
      tipo: 'transicao',
      transicao: { target: 'ACTIVE', evento: 'ACTIVATED', criaVersao: true },
    });
  });
  it('ACTIVE é idempotente (sem novo evento, sem versão)', () => {
    expect(planejarTransicao('ativar', 'ACTIVE')).toEqual({ tipo: 'idempotente' });
  });
  it('ARCHIVED é inválido (restaure antes)', () => {
    expect(planejarTransicao('ativar', 'ARCHIVED').tipo).toBe('invalido');
  });
});

describe('desativar', () => {
  it('ACTIVE → INACTIVE, sem congelar versão', () => {
    expect(planejarTransicao('desativar', 'ACTIVE')).toMatchObject({
      tipo: 'transicao',
      transicao: { target: 'INACTIVE', evento: 'DEACTIVATED', criaVersao: false },
    });
  });
  it('INACTIVE é idempotente', () => {
    expect(planejarTransicao('desativar', 'INACTIVE')).toEqual({ tipo: 'idempotente' });
  });
  it('ARCHIVED é inválido', () => {
    expect(planejarTransicao('desativar', 'ARCHIVED').tipo).toBe('invalido');
  });
});

describe('arquivar — arquivar uma ATIVA implica desativação (vai a ARCHIVED, que o motor não avalia)', () => {
  it('INACTIVE → ARCHIVED', () => {
    expect(planejarTransicao('arquivar', 'INACTIVE')).toMatchObject({
      tipo: 'transicao',
      transicao: { target: 'ARCHIVED', evento: 'ARCHIVED', criaVersao: false },
    });
  });
  it('ACTIVE → ARCHIVED (desativação por construção)', () => {
    expect(planejarTransicao('arquivar', 'ACTIVE')).toMatchObject({
      tipo: 'transicao',
      transicao: { target: 'ARCHIVED', evento: 'ARCHIVED' },
    });
  });
  it('ARCHIVED é idempotente', () => {
    expect(planejarTransicao('arquivar', 'ARCHIVED')).toEqual({ tipo: 'idempotente' });
  });
});

describe('restaurar — sempre retorna INACTIVE (nunca ao estado anterior)', () => {
  it('ARCHIVED → INACTIVE', () => {
    expect(planejarTransicao('restaurar', 'ARCHIVED')).toMatchObject({
      tipo: 'transicao',
      transicao: { target: 'INACTIVE', evento: 'RESTORED', criaVersao: false },
    });
  });
  it('INACTIVE é idempotente (já é o alvo da restauração)', () => {
    expect(planejarTransicao('restaurar', 'INACTIVE')).toEqual({ tipo: 'idempotente' });
  });
  it('ACTIVE é inválido (nada a restaurar numa ativa)', () => {
    expect(planejarTransicao('restaurar', 'ACTIVE').tipo).toBe('invalido');
  });
});
