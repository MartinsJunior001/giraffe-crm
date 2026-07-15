import { describe, expect, it } from 'vitest';
import type { FieldType, Prisma } from '../generated/prisma';
import {
  type CampoParaSnapshot,
  PublicacaoInvalidaError,
  calcularRevisao,
  montarSnapshot,
} from '../src/pipes/forms/snapshot';

/**
 * Núcleo PURO da publicação (Story 2.6): montagem do snapshot e validação de publicabilidade. Sem banco.
 * Prova os invariantes de conteúdo — sem opção de Seleção não publica, gate de Arquivo, malformado falha
 * fechado — e o determinismo da revisão (mesmo conteúdo → mesmo hash; qualquer mudança → hash diferente).
 */

let seq = 0;
function uuid(): string {
  seq += 1;
  return `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`;
}

function campo(over: Partial<CampoParaSnapshot> & { type: FieldType }): CampoParaSnapshot {
  return {
    id: over.id ?? uuid(),
    label: over.label ?? 'Campo',
    type: over.type,
    help: over.help ?? null,
    typeConfig: over.typeConfig ?? {},
    required: over.required ?? false,
  };
}

/** typeConfig de Seleção com opções (state opcional; ausente = ACTIVE). */
function selecaoConfig(
  opcoes: { label: string; state?: 'ACTIVE' | 'ARCHIVED' }[],
): Prisma.JsonValue {
  return {
    options: opcoes.map((o, i) => ({
      id: uuid(),
      label: o.label,
      position: i + 1,
      state: o.state ?? 'ACTIVE',
    })),
  } as Prisma.JsonValue;
}

const FORM = '11111111-1111-1111-1111-111111111111';

describe('montarSnapshot — validações de publicabilidade', () => {
  it('Formulário sem Campos ativos não publica', () => {
    expect(() => montarSnapshot(FORM, [], { fileUpload: false })).toThrow(PublicacaoInvalidaError);
  });

  it('Campo de texto ativo produz snapshot com id/label/tipo/ajuda e sem options', () => {
    const c = campo({ type: 'TEXT_SHORT', label: 'Nome', help: 'ajuda' });
    const snap = montarSnapshot(FORM, [c], { fileUpload: false });
    expect(snap.fields).toHaveLength(1);
    expect(snap.fields[0]).toMatchObject({
      id: c.id,
      label: 'Nome',
      type: 'TEXT_SHORT',
      help: 'ajuda',
    });
    expect(snap.fields[0]!.typeConfig).toEqual({});
  });

  it('Seleção com opção ativa entra no snapshot com as opções (id/label/position)', () => {
    const c = campo({
      type: 'SELECT_SINGLE',
      typeConfig: selecaoConfig([{ label: 'A' }, { label: 'B' }]),
    });
    const snap = montarSnapshot(FORM, [c], { fileUpload: false });
    expect(snap.fields[0]!.typeConfig.options!.map((o) => o.label)).toEqual(['A', 'B']);
    expect(snap.fields[0]!.typeConfig.options!.map((o) => o.position)).toEqual([1, 2]);
  });

  it('Seleção só com opções arquivadas NÃO publica (≥1 opção ativa)', () => {
    const c = campo({
      type: 'SELECT_SINGLE',
      typeConfig: selecaoConfig([{ label: 'X', state: 'ARCHIVED' }]),
    });
    expect(() => montarSnapshot(FORM, [c], { fileUpload: false })).toThrow(PublicacaoInvalidaError);
  });

  it('Seleção com opção arquivada + ativa: só a ativa entra no snapshot', () => {
    const c = campo({
      type: 'SELECT_SINGLE',
      typeConfig: selecaoConfig([{ label: 'Velha', state: 'ARCHIVED' }, { label: 'Nova' }]),
    });
    const snap = montarSnapshot(FORM, [c], { fileUpload: false });
    expect(snap.fields[0]!.typeConfig.options!.map((o) => o.label)).toEqual(['Nova']);
  });

  it('Seleção com typeConfig malformado falha fechada (não publica)', () => {
    const c = campo({
      type: 'SELECT_SINGLE',
      typeConfig: { options: 'não-array' } as unknown as Prisma.JsonValue,
    });
    expect(() => montarSnapshot(FORM, [c], { fileUpload: false })).toThrow(PublicacaoInvalidaError);
  });

  it('Campo FILE ativo barra a publicação quando upload desabilitado; libera quando habilitado', () => {
    const c = campo({ type: 'FILE' });
    expect(() => montarSnapshot(FORM, [c], { fileUpload: false })).toThrow(PublicacaoInvalidaError);
    expect(montarSnapshot(FORM, [c], { fileUpload: true }).fields).toHaveLength(1);
  });
});

describe('calcularRevisao — determinística', () => {
  it('mesmo snapshot → mesma revisão; mudança de rótulo → revisão diferente', () => {
    const a = montarSnapshot(FORM, [campo({ id: FORM, type: 'TEXT_SHORT', label: 'Nome' })], {
      fileUpload: false,
    });
    const b = montarSnapshot(FORM, [campo({ id: FORM, type: 'TEXT_SHORT', label: 'Nome' })], {
      fileUpload: false,
    });
    const c = montarSnapshot(FORM, [campo({ id: FORM, type: 'TEXT_SHORT', label: 'Outro' })], {
      fileUpload: false,
    });
    expect(calcularRevisao(a)).toBe(calcularRevisao(b));
    expect(calcularRevisao(a)).not.toBe(calcularRevisao(c));
  });
});
