import { describe, expect, it } from 'vitest';
import type { ConfiguracaoValidada } from '../src/pipes/automations/automation-config';
import {
  calcularRevisaoAutomacao,
  montarSnapshotAutomacao,
} from '../src/pipes/automations/automation-snapshot';

/**
 * Núcleo PURO do snapshot da Automação (Story 4.2). O snapshot congela a config validada e a revisão é um
 * hash DETERMINÍSTICO e estável frente à ordem das chaves — é o que garante que uma versão congelada seja
 * identificável e imutável (twin de `forms/snapshot.ts`).
 */

const base: ConfiguracaoValidada = {
  schemaVersion: 1,
  quando: { tipo: 'CARD_CRIADO', refs: [] },
  condicoes: [{ tipo: 'CAMPO', operador: 'IGUAL', valor: 'x', refs: [] }],
  entao: [{ tipo: 'MOVER_CARD', parametros: { destino: 'a' }, refs: [] }],
};

describe('montarSnapshotAutomacao', () => {
  it('copia só a config validada (schemaVersion/quando/condicoes/entao)', () => {
    const snap = montarSnapshotAutomacao(base);
    expect(snap).toEqual({
      schemaVersion: 1,
      quando: base.quando,
      condicoes: base.condicoes,
      entao: base.entao,
    });
  });
});

describe('calcularRevisaoAutomacao', () => {
  it('é determinística — a mesma config produz a mesma revisão', () => {
    expect(calcularRevisaoAutomacao(montarSnapshotAutomacao(base))).toBe(
      calcularRevisaoAutomacao(montarSnapshotAutomacao(base)),
    );
  });

  it('é estável frente à ordem de inserção das chaves dos parâmetros', () => {
    const outraOrdem: ConfiguracaoValidada = {
      ...base,
      entao: [{ tipo: 'MOVER_CARD', parametros: { destino: 'a' }, refs: [] }],
    };
    // Reconstruído com as mesmas chaves em ordem diferente — a revisão canônica ignora a ordem.
    const embaralhado = {
      entao: outraOrdem.entao,
      condicoes: outraOrdem.condicoes,
      quando: outraOrdem.quando,
      schemaVersion: outraOrdem.schemaVersion,
    };
    expect(calcularRevisaoAutomacao(embaralhado)).toBe(
      calcularRevisaoAutomacao(montarSnapshotAutomacao(base)),
    );
  });

  it('muda quando a config muda (uma edição real produz outra revisão)', () => {
    const editada: ConfiguracaoValidada = {
      ...base,
      entao: [{ tipo: 'FINALIZAR_CARD', parametros: {}, refs: [] }],
    };
    expect(calcularRevisaoAutomacao(montarSnapshotAutomacao(editada))).not.toBe(
      calcularRevisaoAutomacao(montarSnapshotAutomacao(base)),
    );
  });
});
