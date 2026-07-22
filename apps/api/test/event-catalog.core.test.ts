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

/** Os 16 tipos NÚCLEO EXATOS da Story §1328–1337 — congela o catálogo (nem mais, nem menos). */
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
];

describe('catálogo NÚCLEO — fixo e completo (CA1)', () => {
  it('contém EXATAMENTE os 16 tipos aprovados da Fase 1', () => {
    expect([...TIPOS_NUCLEO].sort()).toEqual([...NUCLEO_ESPERADO].sort());
    expect(EVENTOS_NUCLEO).toHaveLength(16);
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

describe('pontos de extensão E5/E6 — declarados como contrato, NÃO selecionáveis', () => {
  it('as extensões existem no catálogo mas não são selecionáveis', () => {
    for (const e of EVENTOS_EXTENSAO) {
      expect(obterEventoCatalogo(e.tipo)?.origem).toBe('EXTENSION');
      expect(ehEventoSelecionavel(e.tipo)).toBe(false);
    }
  });

  it('E5 (Tarefa) e E6 (E-mail enviado) declarados; EMAIL_RECEIVED indisponível', () => {
    for (const t of ['TASK_CREATED', 'TASK_COMPLETED', 'TASK_OVERDUE', 'EMAIL_SENT']) {
      expect(obterEventoCatalogo(t)).toBeDefined();
    }
    expect(obterEventoCatalogo('EMAIL_RECEIVED')?.indisponivel).toBe(true);
  });
});

describe('enforcement fail-closed (exigirEventoNoCatalogo)', () => {
  it('rejeita tipo DESCONHECIDO', () => {
    expect(() => exigirEventoNoCatalogo('X')).toThrow(EventoForaDoCatalogoError);
    expect(() => exigirEventoNoCatalogo('CARD_CRIADO')).toThrow(/desconhecido/);
  });

  it('rejeita ponto de EXTENSÃO ainda não disponível', () => {
    expect(() => exigirEventoNoCatalogo('EMAIL_SENT')).toThrow(/extensão ainda não disponível/);
    expect(() => exigirEventoNoCatalogo('TASK_CREATED')).toThrow(EventoForaDoCatalogoError);
  });

  it('rejeita o INDISPONÍVEL permanente (EMAIL_RECEIVED)', () => {
    expect(() => exigirEventoNoCatalogo('EMAIL_RECEIVED')).toThrow(/indisponível/);
  });
});
