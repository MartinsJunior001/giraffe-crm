import { describe, expect, it } from 'vitest';
import type { Prisma } from '../generated/prisma';
import {
  extrairArquivosReferenciados,
  SubmissaoInvalidaError,
  validarSubmissao,
} from '../src/pipes/cards/submission';

/**
 * Núcleo PURO da submissão (Story 2.7): valida os `valores` contra o snapshot da versão publicada. Sem banco.
 * Prova a allowlist (Campo desconhecido recusa), a checagem de tipo, Seleção por `id` (nunca rótulo) e a
 * ausência de obrigatoriedade (valor ausente é permitido).
 */

function snap(fields: unknown[]): Prisma.JsonValue {
  return { formId: '00000000-0000-0000-0000-000000000000', fields } as Prisma.JsonValue;
}
const F_TEXTO = 'aaaaaaaa-0000-0000-0000-000000000001';
const F_NUM = 'aaaaaaaa-0000-0000-0000-000000000002';
const F_SEL = 'aaaaaaaa-0000-0000-0000-000000000003';
const OP_A = 'bbbbbbbb-0000-0000-0000-000000000001';
const OP_B = 'bbbbbbbb-0000-0000-0000-000000000002';

const SNAP = snap([
  { id: F_TEXTO, type: 'TEXT_SHORT', label: 'Nome', typeConfig: {} },
  { id: F_NUM, type: 'NUMBER', label: 'Idade', typeConfig: {} },
  {
    id: F_SEL,
    type: 'SELECT_SINGLE',
    label: 'Prioridade',
    typeConfig: { options: [{ id: OP_A }, { id: OP_B }] },
  },
]);

describe('validarSubmissao', () => {
  it('aceita valores válidos e devolve normalizado (só Campos conhecidos)', () => {
    const out = validarSubmissao(SNAP, { [F_TEXTO]: 'Ana', [F_NUM]: 30, [F_SEL]: OP_A });
    expect(out).toEqual({ [F_TEXTO]: 'Ana', [F_NUM]: 30, [F_SEL]: OP_A });
  });

  it('valor ausente é permitido (sem obrigatoriedade na 2.7)', () => {
    expect(validarSubmissao(SNAP, {})).toEqual({});
    expect(validarSubmissao(SNAP, { [F_TEXTO]: 'só um' })).toEqual({ [F_TEXTO]: 'só um' });
  });

  it('Campo desconhecido é RECUSADO (allowlist / anti-mass-assignment)', () => {
    expect(() => validarSubmissao(SNAP, { 'ffffffff-0000-0000-0000-000000000000': 'x' })).toThrow(
      SubmissaoInvalidaError,
    );
  });

  it('tipo errado é recusado (texto≠número, número≠texto)', () => {
    expect(() => validarSubmissao(SNAP, { [F_TEXTO]: 123 })).toThrow(SubmissaoInvalidaError);
    expect(() => validarSubmissao(SNAP, { [F_NUM]: 'trinta' })).toThrow(SubmissaoInvalidaError);
  });

  it('Seleção exige um id de opção EXISTENTE (por id, nunca rótulo)', () => {
    expect(validarSubmissao(SNAP, { [F_SEL]: OP_B })[F_SEL]).toBe(OP_B);
    expect(() => validarSubmissao(SNAP, { [F_SEL]: 'Prioridade' })).toThrow(SubmissaoInvalidaError); // rótulo, não id
    expect(() => validarSubmissao(SNAP, { [F_SEL]: 'id-inexistente' })).toThrow(
      SubmissaoInvalidaError,
    );
  });

  it('SELECT_MULTI: array de ids existentes, sem repetição', () => {
    const multi = snap([
      {
        id: F_SEL,
        type: 'SELECT_MULTI',
        label: 'Tags',
        typeConfig: { options: [{ id: OP_A }, { id: OP_B }] },
      },
    ]);
    expect(validarSubmissao(multi, { [F_SEL]: [OP_A, OP_B] })[F_SEL]).toEqual([OP_A, OP_B]);
    expect(() => validarSubmissao(multi, { [F_SEL]: [OP_A, OP_A] })).toThrow(
      SubmissaoInvalidaError,
    ); // repetida
    expect(() => validarSubmissao(multi, { [F_SEL]: [OP_A, 'x'] })).toThrow(SubmissaoInvalidaError); // inexistente
    expect(() => validarSubmissao(multi, { [F_SEL]: OP_A })).toThrow(SubmissaoInvalidaError); // não-array
  });

  it('valores não-objeto e snapshot malformado falham fechado', () => {
    expect(() => validarSubmissao(SNAP, [] as unknown)).toThrow(SubmissaoInvalidaError);
    expect(() => validarSubmissao(SNAP, 'x' as unknown)).toThrow(SubmissaoInvalidaError);
    expect(() => validarSubmissao({ fields: 'x' } as Prisma.JsonValue, {})).toThrow(
      SubmissaoInvalidaError,
    );
  });
});

// ── Campo FILE (Story 3.8, Opção 1): referência tipada, não texto ──────────────────────────────
const F_FILE = 'aaaaaaaa-0000-0000-0000-0000000000f1';
const FID_1 = '11111111-2222-3333-4444-555555555551';
const FID_2 = '11111111-2222-3333-4444-555555555552';
const SNAP_FILE = snap([{ id: F_FILE, type: 'FILE', label: 'Anexo', typeConfig: {} }]);
const SNAP_FILE_MULTI = snap([
  { id: F_FILE, type: 'FILE', label: 'Anexos', typeConfig: { multiplo: true } },
]);

describe('validarSubmissao — Campo FILE', () => {
  it('default (rejeitar): valor para Campo FILE não é aceito nesta via', () => {
    expect(() => validarSubmissao(SNAP_FILE, { [F_FILE]: FID_1 })).toThrow(SubmissaoInvalidaError);
    // Valor AUSENTE é permitido mesmo com FILE no snapshot (sem obrigatoriedade).
    expect(validarSubmissao(SNAP_FILE, {})).toEqual({});
  });

  it('referencia: aceita fileId UUID; rejeita não-UUID e tipo errado', () => {
    expect(validarSubmissao(SNAP_FILE, { [F_FILE]: FID_1 }, { arquivo: 'referencia' })[F_FILE]).toBe(
      FID_1,
    );
    expect(() =>
      validarSubmissao(SNAP_FILE, { [F_FILE]: 'não-uuid' }, { arquivo: 'referencia' }),
    ).toThrow(SubmissaoInvalidaError);
    expect(() =>
      validarSubmissao(SNAP_FILE, { [F_FILE]: 42 }, { arquivo: 'referencia' }),
    ).toThrow(SubmissaoInvalidaError);
    // single não aceita array
    expect(() =>
      validarSubmissao(SNAP_FILE, { [F_FILE]: [FID_1] }, { arquivo: 'referencia' }),
    ).toThrow(SubmissaoInvalidaError);
  });

  it('referencia + multiplo: lista de UUIDs sem repetição', () => {
    expect(
      validarSubmissao(SNAP_FILE_MULTI, { [F_FILE]: [FID_1, FID_2] }, { arquivo: 'referencia' })[
        F_FILE
      ],
    ).toEqual([FID_1, FID_2]);
    expect(() =>
      validarSubmissao(SNAP_FILE_MULTI, { [F_FILE]: [FID_1, FID_1] }, { arquivo: 'referencia' }),
    ).toThrow(SubmissaoInvalidaError); // repetido
    expect(() =>
      validarSubmissao(SNAP_FILE_MULTI, { [F_FILE]: FID_1 }, { arquivo: 'referencia' }),
    ).toThrow(SubmissaoInvalidaError); // não-array
  });

  it('extrairArquivosReferenciados achata os fileIds dos Campos FILE (sem repetição)', () => {
    const v = validarSubmissao(
      SNAP_FILE_MULTI,
      { [F_FILE]: [FID_1, FID_2] },
      { arquivo: 'referencia' },
    );
    expect(extrairArquivosReferenciados(SNAP_FILE_MULTI, v)).toEqual([FID_1, FID_2]);
    // Campo não-FILE não contribui.
    expect(extrairArquivosReferenciados(SNAP, { [F_TEXTO]: 'x' })).toEqual([]);
  });
});
