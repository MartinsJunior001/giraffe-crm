import { describe, expect, it } from 'vitest';
import {
  planejarArquivamento,
  planejarOperacional,
  podeEscrever,
} from '../src/tasks/task-lifecycle.transitions';

/**
 * Núcleo PURO das transições da Tarefa (Story 5.1) — sem banco. Prova a matriz dos DOIS eixos independentes
 * (operacional ABERTA/CONCLUIDA e arquivamento ATIVA/ARQUIVADA): transições válidas, idempotência, bloqueio
 * por arquivamento e preservação do estado operacional ao arquivar/restaurar (AC §1528–1532).
 */

describe('eixo OPERACIONAL (concluir/reabrir)', () => {
  it('concluir: ABERTA → CONCLUIDA (evento COMPLETED)', () => {
    const p = planejarOperacional('concluir', 'ABERTA', 'ATIVA');
    expect(p).toEqual({
      tipo: 'transicao',
      transicao: { target: 'CONCLUIDA', evento: 'COMPLETED', resumo: 'Tarefa concluída' },
    });
  });

  it('concluir já CONCLUIDA → idempotente (sem evento)', () => {
    expect(planejarOperacional('concluir', 'CONCLUIDA', 'ATIVA')).toEqual({ tipo: 'idempotente' });
  });

  it('reabrir: CONCLUIDA → ABERTA (evento REOPENED)', () => {
    const p = planejarOperacional('reabrir', 'CONCLUIDA', 'ATIVA');
    expect(p).toEqual({
      tipo: 'transicao',
      transicao: { target: 'ABERTA', evento: 'REOPENED', resumo: 'Tarefa reaberta' },
    });
  });

  it('reabrir já ABERTA → idempotente', () => {
    expect(planejarOperacional('reabrir', 'ABERTA', 'ATIVA')).toEqual({ tipo: 'idempotente' });
  });

  it('ARQUIVADA bloqueia concluir E reabrir (§1526)', () => {
    expect(planejarOperacional('concluir', 'ABERTA', 'ARQUIVADA')).toEqual({
      tipo: 'bloqueado_arquivada',
    });
    expect(planejarOperacional('reabrir', 'CONCLUIDA', 'ARQUIVADA')).toEqual({
      tipo: 'bloqueado_arquivada',
    });
  });
});

describe('eixo ARQUIVAMENTO (arquivar/restaurar) — independente do operacional', () => {
  it('arquivar: ATIVA → ARQUIVADA (evento ARCHIVED)', () => {
    expect(planejarArquivamento('arquivar', 'ATIVA')).toEqual({
      tipo: 'transicao',
      transicao: { target: 'ARQUIVADA', evento: 'ARCHIVED', resumo: 'Tarefa arquivada' },
    });
  });

  it('arquivar já ARQUIVADA → idempotente', () => {
    expect(planejarArquivamento('arquivar', 'ARQUIVADA')).toEqual({ tipo: 'idempotente' });
  });

  it('restaurar: ARQUIVADA → ATIVA (evento RESTORED)', () => {
    expect(planejarArquivamento('restaurar', 'ARQUIVADA')).toEqual({
      tipo: 'transicao',
      transicao: { target: 'ATIVA', evento: 'RESTORED', resumo: 'Tarefa restaurada' },
    });
  });

  it('restaurar já ATIVA → idempotente', () => {
    expect(planejarArquivamento('restaurar', 'ATIVA')).toEqual({ tipo: 'idempotente' });
  });

  it('o eixo de arquivamento NÃO carrega o estado operacional — este é preservado por construção', () => {
    // Uma Tarefa CONCLUIDA arquivada e restaurada segue CONCLUIDA (o plano de arquivamento não toca o eixo op.).
    const p = planejarArquivamento('restaurar', 'ARQUIVADA');
    expect(p.tipo).toBe('transicao');
    // O plano só descreve o alvo de ARQUIVAMENTO — nada sobre lifecycleState.
    if (p.tipo === 'transicao') expect('target' in p.transicao && p.transicao.target).toBe('ATIVA');
  });
});

describe('podeEscrever (somente-leitura sob arquivamento)', () => {
  it('ATIVA permite escrita; ARQUIVADA bloqueia', () => {
    expect(podeEscrever('ATIVA')).toBe(true);
    expect(podeEscrever('ARQUIVADA')).toBe(false);
  });
});
