import { describe, expect, it } from 'vitest';
import {
  calcularMarcos,
  type ConfigMarcos,
  ConfigMarcosInvalidaError,
  lerSnapshotConfig,
  montarSnapshotConfig,
  validarConfigMarcos,
} from '../src/pipes/phases/milestones/phase-milestones.core';

/**
 * Núcleo PURO dos marcos por Fase (Story 2.12) — sem I/O. Prova as três regras: validação da config (ordenação e
 * não-negatividade), snapshot (forma congelada), e o cálculo da base com a PRECEDÊNCIA override › duração › ausência.
 * Cada bloco carrega uma mutação candidata (fase vermelha): se a regra sumir, o teste correspondente fica vermelho.
 */

const VAZIA: ConfigMarcos = {
  expectedDurationMin: null,
  dueDurationMin: null,
  expirationDurationMin: null,
  expectedFieldId: null,
  dueFieldId: null,
  expirationFieldId: null,
};

const ENTRADA = new Date('2026-07-14T12:00:00.000Z');

describe('validarConfigMarcos — ordenação e não-negatividade', () => {
  it('aceita config vazia e cadeia esperado ≤ vencimento ≤ expiração', () => {
    expect(() => validarConfigMarcos(VAZIA)).not.toThrow();
    expect(() =>
      validarConfigMarcos({
        ...VAZIA,
        expectedDurationMin: 60,
        dueDurationMin: 120,
        expirationDurationMin: 120,
      }),
    ).not.toThrow();
  });

  it('rejeita esperado > vencimento', () => {
    expect(() =>
      validarConfigMarcos({ ...VAZIA, expectedDurationMin: 120, dueDurationMin: 60 }),
    ).toThrow(ConfigMarcosInvalidaError);
  });

  it('rejeita vencimento > expiração', () => {
    expect(() =>
      validarConfigMarcos({ ...VAZIA, dueDurationMin: 200, expirationDurationMin: 100 }),
    ).toThrow(ConfigMarcosInvalidaError);
  });

  it('rejeita esperado > expiração quando vencimento é nulo (par cruzado)', () => {
    expect(() =>
      validarConfigMarcos({ ...VAZIA, expectedDurationMin: 300, expirationDurationMin: 100 }),
    ).toThrow(ConfigMarcosInvalidaError);
  });

  it('rejeita duração fracionária e negativa', () => {
    expect(() => validarConfigMarcos({ ...VAZIA, expectedDurationMin: 1.5 })).toThrow();
    expect(() => validarConfigMarcos({ ...VAZIA, dueDurationMin: -1 })).toThrow();
  });
});

describe('snapshot — forma congelada', () => {
  it('montarSnapshotConfig normaliza ausências para null', () => {
    expect(montarSnapshotConfig({ expectedDurationMin: 30 })).toEqual({
      ...VAZIA,
      expectedDurationMin: 30,
    });
    expect(montarSnapshotConfig(null)).toEqual(VAZIA);
  });

  it('lerSnapshotConfig é fail-closed: campos malformados viram null', () => {
    expect(
      lerSnapshotConfig({
        expectedDurationMin: 'x',
        dueDurationMin: -5,
        expectedFieldId: 42,
        dueFieldId: 'f',
      }),
    ).toEqual({ ...VAZIA, dueFieldId: 'f' });
    expect(lerSnapshotConfig(null)).toEqual(VAZIA);
    expect(lerSnapshotConfig('lixo')).toEqual(VAZIA);
  });
});

describe('calcularMarcos — precedência override › duração › ausência', () => {
  it('sem config nem override: marco não se aplica (null)', () => {
    expect(calcularMarcos(ENTRADA, VAZIA, {})).toEqual({
      esperado: null,
      vencimento: null,
      expiracao: null,
    });
  });

  it('só duração: entrada + duração (minutos)', () => {
    const m = calcularMarcos(ENTRADA, { ...VAZIA, expectedDurationMin: 60 }, {});
    expect(m.esperado).toEqual(new Date('2026-07-14T13:00:00.000Z'));
  });

  it('override do Card prevalece sobre a duração (absoluto)', () => {
    const snapshot: ConfigMarcos = {
      ...VAZIA,
      expectedDurationMin: 60,
      expectedFieldId: 'campo-data',
    };
    const m = calcularMarcos(ENTRADA, snapshot, { 'campo-data': '2027-01-01' });
    expect(m.esperado).toEqual(new Date('2027-01-01'));
  });

  it('ausência do valor do Campo é IGNORADA: cai para a duração', () => {
    const snapshot: ConfigMarcos = {
      ...VAZIA,
      expectedDurationMin: 60,
      expectedFieldId: 'campo-data',
    };
    const m = calcularMarcos(ENTRADA, snapshot, {}); // sem valor no Campo
    expect(m.esperado).toEqual(new Date('2026-07-14T13:00:00.000Z'));
  });

  it('override malformado é fail-closed: cai para a duração', () => {
    const snapshot: ConfigMarcos = {
      ...VAZIA,
      expectedDurationMin: 60,
      expectedFieldId: 'campo-data',
    };
    const m = calcularMarcos(ENTRADA, snapshot, { 'campo-data': 'não-é-data' });
    expect(m.esperado).toEqual(new Date('2026-07-14T13:00:00.000Z'));
  });

  it('override sem duração: só o valor absoluto define o marco; sem valor → null', () => {
    const snapshot: ConfigMarcos = { ...VAZIA, expectedFieldId: 'campo-data' };
    expect(calcularMarcos(ENTRADA, snapshot, { 'campo-data': '2027-05-05' }).esperado).toEqual(
      new Date('2027-05-05'),
    );
    expect(calcularMarcos(ENTRADA, snapshot, {}).esperado).toBeNull();
  });
});
