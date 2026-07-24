import { describe, expect, it } from 'vitest';
import {
  EVENTOS_EXTENSAO,
  EVENTOS_NUCLEO,
  EventoForaDoCatalogoError,
  ehEventoSelecionavel,
  exigirEventoNoCatalogo,
  obterEventoCatalogo,
  TIPOS_NUCLEO,
} from '../src/domain-events/event-catalog';

/**
 * Catálogo de Eventos (Story 4.3) — teste PURO do vocabulário fixo/completo da Fase 1 (CA1) e do enforcement
 * fail-closed. Sem banco: o catálogo é um invariante testável sem PostgreSQL, como `automation-config`.
 */

/**
 * Os tipos NÚCLEO EXATOS — congela o catálogo (nem mais, nem menos). 16 de E4 (Story §1328–1337) + 13 de E5
 * (Story 5.7 — Tarefa/Solicitação PROMOVIDOS de extensão a selecionáveis, §1660).
 */
const NUCLEO_ESPERADO = [
  'CARD_CREATED',
  'CARD_MOVED',
  'CARD_HEALTH_CHANGED',
  'CARD_FINALIZED',
  'CARD_ARCHIVED',
  'CARD_REOPENED',
  'CARD_RESTORED',
  'CARD_RESPONSIBLE_CHANGED',
  'CARD_FIELD_VALUE_CHANGED',
  'CARD_RECORD_LINK_CREATED',
  'CARD_RECORD_LINK_REMOVED',
  'RECORD_CREATED',
  'RECORD_ARCHIVED',
  'RECORD_RESTORED',
  'RECORD_FIELD_VALUE_CHANGED',
  'PHASE_FORM_SUBMITTED',
  // E5 Tarefa (Story 5.7)
  'TASK_CREATED',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'TASK_ARCHIVED',
  'TASK_RESTORED',
  'TASK_RESPONSIBLE_CHANGED',
  'TASK_OVERDUE',
  // E5 Solicitação (Story 5.7)
  'REQUEST_CREATED',
  'REQUEST_RESOLVED',
  'REQUEST_REOPENED',
  'REQUEST_ARCHIVED',
  'REQUEST_RESTORED',
  'REQUEST_RESPONSIBLE_CHANGED',
];

describe('catálogo NÚCLEO — fixo e completo (CA1)', () => {
  it('contém EXATAMENTE os tipos aprovados (16 de E4 + 13 de E5)', () => {
    expect([...TIPOS_NUCLEO].sort()).toEqual([...NUCLEO_ESPERADO].sort());
    expect(EVENTOS_NUCLEO).toHaveLength(29);
  });

  it('todos os tipos NÚCLEO são selecionáveis', () => {
    for (const tipo of NUCLEO_ESPERADO) {
      expect(ehEventoSelecionavel(tipo)).toBe(true);
      expect(() => exigirEventoNoCatalogo(tipo)).not.toThrow();
    }
  });

  it('Registro puro não carrega Pipe; Card/vínculo sim (Story §1339)', () => {
    expect(obterEventoCatalogo('RECORD_CREATED')?.temPipe).toBe(false);
    expect(obterEventoCatalogo('CARD_CREATED')?.temPipe).toBe(true);
    expect(obterEventoCatalogo('CARD_RECORD_LINK_CREATED')?.temPipe).toBe(true);
  });
});

describe('E5 (Tarefa/Solicitação) SELECIONÁVEIS (Story 5.7 — §1660)', () => {
  it('todos os Eventos de Tarefa/Solicitação são núcleo e selecionáveis (nenhum condicional)', () => {
    for (const t of [
      'TASK_CREATED',
      'TASK_COMPLETED',
      'TASK_REOPENED',
      'TASK_ARCHIVED',
      'TASK_RESTORED',
      'TASK_RESPONSIBLE_CHANGED',
      'TASK_OVERDUE',
      'REQUEST_CREATED',
      'REQUEST_RESOLVED',
      'REQUEST_REOPENED',
      'REQUEST_ARCHIVED',
      'REQUEST_RESTORED',
      'REQUEST_RESPONSIBLE_CHANGED',
    ]) {
      expect(obterEventoCatalogo(t)?.origem).toBe('CORE');
      expect(ehEventoSelecionavel(t)).toBe(true);
      expect(() => exigirEventoNoCatalogo(t)).not.toThrow();
    }
  });
});

describe('pontos de extensão E6 — declarados como contrato, NÃO selecionáveis', () => {
  it('as extensões existem no catálogo mas não são selecionáveis', () => {
    for (const e of EVENTOS_EXTENSAO) {
      expect(obterEventoCatalogo(e.tipo)?.origem).toBe('EXTENSION');
      expect(ehEventoSelecionavel(e.tipo)).toBe(false);
    }
  });

  it('E6 (E-mail enviado) declarado; EMAIL_RECEIVED indisponível', () => {
    expect(obterEventoCatalogo('EMAIL_SENT')).toBeDefined();
    expect(obterEventoCatalogo('EMAIL_RECEIVED')?.indisponivel).toBe(true);
  });
});

describe('enforcement fail-closed (exigirEventoNoCatalogo)', () => {
  it('rejeita tipo DESCONHECIDO', () => {
    expect(() => exigirEventoNoCatalogo('X')).toThrow(EventoForaDoCatalogoError);
    expect(() => exigirEventoNoCatalogo('CARD_CRIADO')).toThrow(/desconhecido/);
  });

  it('rejeita ponto de EXTENSÃO ainda não disponível (E6)', () => {
    expect(() => exigirEventoNoCatalogo('EMAIL_SENT')).toThrow(/extensão ainda não disponível/);
    // Story 5.7: TASK_CREATED foi PROMOVIDO a selecionável — não mais rejeitado.
    expect(() => exigirEventoNoCatalogo('TASK_CREATED')).not.toThrow();
  });

  it('rejeita o INDISPONÍVEL permanente (EMAIL_RECEIVED)', () => {
    expect(() => exigirEventoNoCatalogo('EMAIL_RECEIVED')).toThrow(/indisponível/);
  });
});
