import { describe, expect, it } from 'vitest';
import {
  metadadosDoTipo,
  resolverPreferenciaEfetiva,
  tiposSilenciadosPara,
  validarSetPreferencia,
} from '../src/notifications/read/notification-type-registry';

/**
 * Núcleo PURO dos metadados de preferência por tipo (Story 5.4, R6) — sem banco, sem Nest. Prova a precedência
 * efetiva (obrigatório › override › padrão), o fallback seguro para tipo não catalogado (catálogo = 5.6), a
 * validação fail-closed do SET e a derivação dos tipos silenciados. AC4 (padrão/obrigatoriedade/não contorna).
 */

describe('metadadosDoTipo — fallback seguro (catálogo = 5.6)', () => {
  it('tipo desconhecido cai no fallback: habilitado, desativável, não-obrigatório', () => {
    const m = metadadosDoTipo('TASK_ASSIGNED');
    expect(m).toEqual({ padraoHabilitado: true, podeDesativar: true, obrigatorio: false });
  });
});

describe('resolverPreferenciaEfetiva — precedência (obrigatório › override › padrão)', () => {
  it('sem override → padrão habilitado', () => {
    expect(resolverPreferenciaEfetiva('TASK_ASSIGNED')).toBe(true);
  });
  it('override false silencia um tipo desativável', () => {
    expect(resolverPreferenciaEfetiva('TASK_ASSIGNED', false)).toBe(false);
  });
  it('override true habilita', () => {
    expect(resolverPreferenciaEfetiva('TASK_ASSIGNED', true)).toBe(true);
  });
});

describe('validarSetPreferencia — fail-closed', () => {
  it('type malformado → erro', () => {
    expect(validarSetPreferencia('minusculo', false)).toMatch(/tipo/i);
    expect(validarSetPreferencia('TASK ASSIGNED', true)).toMatch(/tipo/i);
  });
  it('habilitar é sempre permitido (tipo desativável)', () => {
    expect(validarSetPreferencia('TASK_ASSIGNED', true)).toBeNull();
  });
  it('silenciar um tipo desativável é permitido', () => {
    expect(validarSetPreferencia('TASK_ASSIGNED', false)).toBeNull();
  });
  it('enabled não-booleano → erro', () => {
    expect(validarSetPreferencia('TASK_ASSIGNED', 'x' as unknown as boolean)).toMatch(/booleano/i);
  });
});

describe('tiposSilenciadosPara — deriva o filtro das superfícies', () => {
  it('override false entra no conjunto silenciado', () => {
    const silenciados = tiposSilenciadosPara(new Map([['TASK_ASSIGNED', false]]));
    expect(silenciados).toContain('TASK_ASSIGNED');
  });
  it('override true não silencia', () => {
    const silenciados = tiposSilenciadosPara(new Map([['TASK_ASSIGNED', true]]));
    expect(silenciados).not.toContain('TASK_ASSIGNED');
  });
  it('sem overrides → conjunto vazio (tudo habilitado por padrão)', () => {
    expect(tiposSilenciadosPara(new Map())).toEqual([]);
  });
});
