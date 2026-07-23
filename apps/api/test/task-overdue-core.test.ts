import { describe, expect, it } from 'vitest';
import { derivarAtrasada, elegivelParaOcorrencia } from '../src/tasks/task-overdue.core';

/**
 * Núcleo PURO da condição temporal da Tarefa (Story 5.1) — sem banco. Prova o estado `atrasada` DERIVADO
 * (AC §1529): aberta+ativa+prazo vencido; concluída/arquivada nunca atrasada; sem prazo nunca atrasada;
 * limiar inclusivo; e a determinação por INSTANTE (fuso oficial cai por construção).
 */

const T0 = new Date('2026-07-23T12:00:00.000Z');
const ANTES = new Date('2026-07-23T11:59:59.000Z');
const DEPOIS = new Date('2026-07-23T12:00:01.000Z');

describe('derivarAtrasada', () => {
  it('ABERTA + ATIVA + prazo vencido → atrasada', () => {
    expect(derivarAtrasada('ABERTA', 'ATIVA', T0, DEPOIS)).toBe(true);
  });

  it('prazo no futuro → não atrasada', () => {
    expect(derivarAtrasada('ABERTA', 'ATIVA', T0, ANTES)).toBe(false);
  });

  it('limiar INCLUSIVO: no exato instante do prazo já conta', () => {
    expect(derivarAtrasada('ABERTA', 'ATIVA', T0, T0)).toBe(true);
  });

  it('CONCLUIDA nunca aparece atrasada (§1524), mesmo com prazo vencido', () => {
    expect(derivarAtrasada('CONCLUIDA', 'ATIVA', T0, DEPOIS)).toBe(false);
  });

  it('ARQUIVADA nunca aparece atrasada, mesmo aberta e vencida', () => {
    expect(derivarAtrasada('ABERTA', 'ARQUIVADA', T0, DEPOIS)).toBe(false);
  });

  it('sem prazo (null) → nunca atrasada', () => {
    expect(derivarAtrasada('ABERTA', 'ATIVA', null, DEPOIS)).toBe(false);
  });

  it('determinação por INSTANTE: o mesmo instante absoluto vale em qualquer fuso (fuso oficial por construção)', () => {
    // Prazo expresso com offset distinto mas MESMO instante absoluto que T0 (12:00Z == 09:00-03:00).
    const mesmoInstante = new Date('2026-07-23T09:00:00.000-03:00');
    expect(mesmoInstante.getTime()).toBe(T0.getTime());
    expect(derivarAtrasada('ABERTA', 'ATIVA', mesmoInstante, T0)).toBe(true);
  });
});

describe('elegivelParaOcorrencia (mesma condição — o scan só emite de Tarefa atrasada)', () => {
  it('coincide com derivarAtrasada em todos os eixos', () => {
    expect(elegivelParaOcorrencia('ABERTA', 'ATIVA', T0, DEPOIS)).toBe(true);
    expect(elegivelParaOcorrencia('CONCLUIDA', 'ATIVA', T0, DEPOIS)).toBe(false);
    expect(elegivelParaOcorrencia('ABERTA', 'ARQUIVADA', T0, DEPOIS)).toBe(false);
    expect(elegivelParaOcorrencia('ABERTA', 'ATIVA', null, DEPOIS)).toBe(false);
  });
});
