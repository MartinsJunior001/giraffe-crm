import { describe, expect, it } from 'vitest';
import {
  planejarArquivamento,
  planejarOperacional,
  podeEscrever,
} from '../src/solicitacoes/solicitacao-lifecycle.transitions';

/**
 * Núcleo PURO das transições da Solicitação (Story 5.2) — sem banco. Twin da 5.1 sem eixo temporal. Prova a
 * matriz dos DOIS eixos independentes (operacional ABERTA/RESOLVIDA e arquivamento ATIVA/ARQUIVADA):
 * transições válidas, idempotência, bloqueio por arquivamento e preservação do estado operacional (§1546).
 */

describe('eixo OPERACIONAL (resolver/reabrir)', () => {
  it('resolver: ABERTA → RESOLVIDA (evento RESOLVED)', () => {
    expect(planejarOperacional('resolver', 'ABERTA', 'ATIVA')).toEqual({
      tipo: 'transicao',
      transicao: { target: 'RESOLVIDA', evento: 'RESOLVED', resumo: 'Solicitação resolvida' },
    });
  });

  it('resolver já RESOLVIDA → idempotente (sem evento)', () => {
    expect(planejarOperacional('resolver', 'RESOLVIDA', 'ATIVA')).toEqual({ tipo: 'idempotente' });
  });

  it('reabrir: RESOLVIDA → ABERTA (evento REOPENED)', () => {
    expect(planejarOperacional('reabrir', 'RESOLVIDA', 'ATIVA')).toEqual({
      tipo: 'transicao',
      transicao: { target: 'ABERTA', evento: 'REOPENED', resumo: 'Solicitação reaberta' },
    });
  });

  it('reabrir já ABERTA → idempotente', () => {
    expect(planejarOperacional('reabrir', 'ABERTA', 'ATIVA')).toEqual({ tipo: 'idempotente' });
  });

  it('ARQUIVADA bloqueia resolver E reabrir (§1546)', () => {
    expect(planejarOperacional('resolver', 'ABERTA', 'ARQUIVADA')).toEqual({
      tipo: 'bloqueado_arquivada',
    });
    expect(planejarOperacional('reabrir', 'RESOLVIDA', 'ARQUIVADA')).toEqual({
      tipo: 'bloqueado_arquivada',
    });
  });
});

describe('eixo ARQUIVAMENTO (arquivar/restaurar) — independente do operacional', () => {
  it('arquivar: ATIVA → ARQUIVADA (evento ARCHIVED)', () => {
    expect(planejarArquivamento('arquivar', 'ATIVA')).toEqual({
      tipo: 'transicao',
      transicao: { target: 'ARQUIVADA', evento: 'ARCHIVED', resumo: 'Solicitação arquivada' },
    });
  });

  it('arquivar já ARQUIVADA → idempotente', () => {
    expect(planejarArquivamento('arquivar', 'ARQUIVADA')).toEqual({ tipo: 'idempotente' });
  });

  it('restaurar: ARQUIVADA → ATIVA (evento RESTORED)', () => {
    expect(planejarArquivamento('restaurar', 'ARQUIVADA')).toEqual({
      tipo: 'transicao',
      transicao: { target: 'ATIVA', evento: 'RESTORED', resumo: 'Solicitação restaurada' },
    });
  });

  it('restaurar já ATIVA → idempotente', () => {
    expect(planejarArquivamento('restaurar', 'ATIVA')).toEqual({ tipo: 'idempotente' });
  });

  it('o eixo de arquivamento NÃO carrega o estado operacional — este é preservado por construção', () => {
    const p = planejarArquivamento('restaurar', 'ARQUIVADA');
    expect(p.tipo).toBe('transicao');
    if (p.tipo === 'transicao') expect('target' in p.transicao && p.transicao.target).toBe('ATIVA');
  });
});

describe('podeEscrever (somente-leitura sob arquivamento)', () => {
  it('ATIVA permite escrita; ARQUIVADA bloqueia', () => {
    expect(podeEscrever('ATIVA')).toBe(true);
    expect(podeEscrever('ARQUIVADA')).toBe(false);
  });
});
