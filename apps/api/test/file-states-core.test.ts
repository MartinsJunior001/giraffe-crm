import { describe, expect, it } from 'vitest';
import {
  estaDisponivel,
  planejarTransicao,
  type EstadoFile,
} from '../src/files/file-states.core';

/**
 * Matriz PURA da máquina de estados do FileObject (Story 3.7) — sem banco. Prova o grafo canônico: transições
 * válidas, idempotentes (já-no-alvo, sem UPDATE) e inválidas (409), com BLOCKED/EXPURGADO terminais.
 */

const TODOS: EstadoFile[] = ['QUARENTENA', 'DISPONIVEL', 'REMOVIDO_LOGICO', 'EXPURGADO', 'BLOCKED'];

describe('promover (QUARENTENA → DISPONIVEL)', () => {
  it('promove a partir de QUARENTENA', () => {
    expect(planejarTransicao('promover', 'QUARENTENA')).toEqual({ tipo: 'transicao', target: 'DISPONIVEL' });
  });
  it('idempotente se já DISPONIVEL', () => {
    expect(planejarTransicao('promover', 'DISPONIVEL')).toEqual({ tipo: 'idempotente' });
  });
  it('inválido a partir de qualquer outro estado', () => {
    for (const e of ['REMOVIDO_LOGICO', 'EXPURGADO', 'BLOCKED'] as EstadoFile[]) {
      expect(planejarTransicao('promover', e).tipo).toBe('invalido');
    }
  });
});

describe('bloquear (QUARENTENA → BLOCKED)', () => {
  it('bloqueia a partir de QUARENTENA', () => {
    expect(planejarTransicao('bloquear', 'QUARENTENA')).toEqual({ tipo: 'transicao', target: 'BLOCKED' });
  });
  it('idempotente se já BLOCKED', () => {
    expect(planejarTransicao('bloquear', 'BLOCKED')).toEqual({ tipo: 'idempotente' });
  });
  it('NÃO rebloqueia um DISPONIVEL (inválido — o veredito é decidido uma vez)', () => {
    expect(planejarTransicao('bloquear', 'DISPONIVEL').tipo).toBe('invalido');
  });
});

describe('remover (DISPONIVEL → REMOVIDO_LOGICO)', () => {
  it('remove a partir de DISPONIVEL', () => {
    expect(planejarTransicao('remover', 'DISPONIVEL')).toEqual({
      tipo: 'transicao',
      target: 'REMOVIDO_LOGICO',
    });
  });
  it('idempotente se já REMOVIDO_LOGICO', () => {
    expect(planejarTransicao('remover', 'REMOVIDO_LOGICO')).toEqual({ tipo: 'idempotente' });
  });
  it('inválido a partir de QUARENTENA/BLOCKED/EXPURGADO', () => {
    for (const e of ['QUARENTENA', 'BLOCKED', 'EXPURGADO'] as EstadoFile[]) {
      expect(planejarTransicao('remover', e).tipo).toBe('invalido');
    }
  });
});

describe('expurgar (REMOVIDO_LOGICO → EXPURGADO)', () => {
  it('expurga a partir de REMOVIDO_LOGICO', () => {
    expect(planejarTransicao('expurgar', 'REMOVIDO_LOGICO')).toEqual({
      tipo: 'transicao',
      target: 'EXPURGADO',
    });
  });
  it('idempotente se já EXPURGADO', () => {
    expect(planejarTransicao('expurgar', 'EXPURGADO')).toEqual({ tipo: 'idempotente' });
  });
  it('inválido sem passar pela remoção lógica (DISPONIVEL/QUARENTENA)', () => {
    expect(planejarTransicao('expurgar', 'DISPONIVEL').tipo).toBe('invalido');
    expect(planejarTransicao('expurgar', 'QUARENTENA').tipo).toBe('invalido');
  });
});

describe('estaDisponivel (fail-closed)', () => {
  it('só DISPONIVEL é baixável/associável', () => {
    for (const e of TODOS) {
      expect(estaDisponivel(e)).toBe(e === 'DISPONIVEL');
    }
  });
});
