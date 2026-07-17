import { describe, expect, it } from 'vitest';
import {
  type CampoDef,
  ConsultaInvalidaError,
  planejarConsulta,
} from '../src/databases/records/record-query.core';

/**
 * Núcleo PURO da consulta de Registros (Story 3.5) — allowlist de Campos/operadores por tipo, coerção de valor e
 * fail-closed. Sem banco. Prova que nenhuma entrada fora da allowlist passa (a defesa contra injeção começa aqui).
 */

const campos: CampoDef[] = [
  { id: 'f-texto', type: 'TEXT_SHORT' },
  { id: 'f-num', type: 'NUMBER' },
  { id: 'f-data', type: 'DATE' },
  { id: 'f-sel', type: 'SELECT_SINGLE' },
  { id: 'f-bool', type: 'BOOLEAN' },
  { id: 'f-arquivo', type: 'FILE' }, // gated
];

describe('planejarConsulta — allowlist e paginação', () => {
  it('aceita filtros válidos por tipo e ordenação por Campo', () => {
    const p = planejarConsulta(campos, {
      filtros: [
        { fieldId: 'f-texto', op: 'contem', valor: 'ana' },
        { fieldId: 'f-num', op: 'maior', valor: 10 },
        { fieldId: 'f-data', op: 'intervalo', valor: ['2024-01-01', '2024-12-31'] },
        { fieldId: 'f-bool', op: 'igual', valor: true },
      ],
      orderByFieldId: 'f-num',
      dir: 'asc',
      take: 25,
      skip: 50,
    });
    expect(p.filtros).toHaveLength(4);
    expect(p.orderBy).toEqual({
      campo: { tipo: 'campo', fieldId: 'f-num', categoria: 'numero' },
      dir: 'ASC',
    });
    expect(p.take).toBe(25);
    expect(p.skip).toBe(50);
  });

  it('default: sem orderBy → createdAt DESC; sem take → 50; sem filtros → []', () => {
    const p = planejarConsulta(campos, {});
    expect(p.orderBy).toEqual({ campo: { tipo: 'createdAt' }, dir: 'DESC' });
    expect(p.take).toBe(50);
    expect(p.filtros).toEqual([]);
    expect(p.incluirArquivados).toBe(false);
  });
});

describe('fail-closed', () => {
  it('Campo desconhecido no filtro → erro', () => {
    expect(() =>
      planejarConsulta(campos, { filtros: [{ fieldId: 'nao-existe', op: 'igual', valor: 'x' }] }),
    ).toThrow(ConsultaInvalidaError);
  });

  it('Campo Arquivo (FILE) é gated no filtro E na ordenação → erro', () => {
    expect(() =>
      planejarConsulta(campos, { filtros: [{ fieldId: 'f-arquivo', op: 'igual', valor: 'x' }] }),
    ).toThrow(ConsultaInvalidaError);
    expect(() => planejarConsulta(campos, { orderByFieldId: 'f-arquivo' })).toThrow(
      ConsultaInvalidaError,
    );
  });

  it('operador inválido para o tipo → erro (texto não tem "maior")', () => {
    expect(() =>
      planejarConsulta(campos, { filtros: [{ fieldId: 'f-texto', op: 'maior', valor: 'x' }] }),
    ).toThrow(ConsultaInvalidaError);
  });

  it('valor de tipo errado → erro (número recebe string; data recebe lixo)', () => {
    expect(() =>
      planejarConsulta(campos, { filtros: [{ fieldId: 'f-num', op: 'igual', valor: 'dez' }] }),
    ).toThrow(ConsultaInvalidaError);
    expect(() =>
      planejarConsulta(campos, {
        filtros: [{ fieldId: 'f-data', op: 'igual', valor: 'nao-e-data' }],
      }),
    ).toThrow(ConsultaInvalidaError);
  });

  it('intervalo sem [min,max] → erro', () => {
    expect(() =>
      planejarConsulta(campos, { filtros: [{ fieldId: 'f-num', op: 'intervalo', valor: 5 }] }),
    ).toThrow(ConsultaInvalidaError);
  });

  it('take fora de 1..100 e skip negativo → erro', () => {
    expect(() => planejarConsulta(campos, { take: 101 })).toThrow(ConsultaInvalidaError);
    expect(() => planejarConsulta(campos, { take: 0 })).toThrow(ConsultaInvalidaError);
    expect(() => planejarConsulta(campos, { skip: -1 })).toThrow(ConsultaInvalidaError);
  });
});
