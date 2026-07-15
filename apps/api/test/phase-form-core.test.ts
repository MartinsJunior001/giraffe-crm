import { describe, expect, it } from 'vitest';
import type { Prisma } from '../generated/prisma';
import {
  requisitoSatisfeito,
  requisitosFaltantes,
} from '../src/pipes/cards/phase-values/phase-values.core';
import {
  type ContextoDeTransicao,
  VALIDADORES_PADRAO,
  executarPreflight,
  validarRequisitoEntrada,
  validarRequisitoSaida,
} from '../src/pipes/cards/movement/transition-preflight';

/**
 * Núcleo PURO da obrigatoriedade do Formulário de Fase (Story 2.15). Sem banco: prova (1) `requisitosFaltantes`
 * derivando dos Campos `required` **congelados no snapshot** (AD-12) quais ficaram sem valor, e (2) que os novos
 * validadores de entrada/saída compõem com `VALIDADORES_PADRAO` de forma ADITIVA (só bloqueiam em `false`; a lista
 * padrão da 2.14 fica intocada). A matriz de tipos/allowlist/Seleção-por-id continua sendo a de `submission.ts`.
 */

const CAMPO_A = '11111111-1111-1111-1111-111111111111';
const CAMPO_B = '22222222-2222-2222-2222-222222222222';
const CAMPO_C = '33333333-3333-3333-3333-333333333333';

function snapshot(fields: { id: string; type: string; required?: boolean }[]): Prisma.JsonValue {
  return { formId: 'f', fields } as Prisma.JsonValue;
}

describe('requisitosFaltantes — obrigatoriedade a partir do snapshot congelado', () => {
  it('Campo obrigatório presente e não-vazio ⇒ nada falta', () => {
    const snap = snapshot([{ id: CAMPO_A, type: 'TEXT_SHORT', required: true }]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: 'ok' })).toEqual([]);
    expect(requisitoSatisfeito(snap, { [CAMPO_A]: 'ok' })).toBe(true);
  });

  it('Campo obrigatório ausente ⇒ falta o id', () => {
    const snap = snapshot([{ id: CAMPO_A, type: 'TEXT_SHORT', required: true }]);
    expect(requisitosFaltantes(snap, {})).toEqual([CAMPO_A]);
    expect(requisitoSatisfeito(snap, {})).toBe(false);
  });

  it('Campo obrigatório com string vazia/só espaços ⇒ falta (não preenchido)', () => {
    const snap = snapshot([{ id: CAMPO_A, type: 'TEXT_SHORT', required: true }]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: '   ' })).toEqual([CAMPO_A]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: '' })).toEqual([CAMPO_A]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: null })).toEqual([CAMPO_A]);
  });

  it('Seleção múltipla obrigatória: array vazio falta; array com item preenche', () => {
    const snap = snapshot([{ id: CAMPO_A, type: 'SELECT_MULTI', required: true }]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: [] })).toEqual([CAMPO_A]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: ['x'] })).toEqual([]);
  });

  it('Número/booleano obrigatórios: 0 e false CONTAM como preenchidos (presença basta)', () => {
    const snap = snapshot([
      { id: CAMPO_A, type: 'NUMBER', required: true },
      { id: CAMPO_B, type: 'CHECKBOX', required: true },
    ]);
    expect(requisitosFaltantes(snap, { [CAMPO_A]: 0, [CAMPO_B]: false })).toEqual([]);
  });

  it('Campo NÃO-obrigatório vazio é ignorado; só o obrigatório faltante entra na lista', () => {
    const snap = snapshot([
      { id: CAMPO_A, type: 'TEXT_SHORT', required: false },
      { id: CAMPO_B, type: 'TEXT_SHORT', required: true },
      { id: CAMPO_C, type: 'TEXT_SHORT' }, // sem required ⇒ não obrigatório
    ]);
    expect(requisitosFaltantes(snap, {})).toEqual([CAMPO_B]);
  });

  it('Snapshot malformado falha FECHADO: sem Campos ⇒ nada obrigatório (lista vazia)', () => {
    expect(requisitosFaltantes(null, {})).toEqual([]);
    expect(requisitosFaltantes({ fields: 'não-array' } as unknown as Prisma.JsonValue, {})).toEqual(
      [],
    );
  });
});

/** Contexto mínimo de transição VÁLIDA — os built-in passam; só os requisitos de Fase variam. */
function ctxValido(over: Partial<ContextoDeTransicao> = {}): ContextoDeTransicao {
  return {
    card: { id: 'c', lifecycleState: 'ATIVO', phaseId: 'p1' },
    faseOrigem: { id: 'p1', pipeId: 'pipe', ativa: true },
    faseDestino: { id: 'p2', pipeId: 'pipe', ativa: true },
    confirmado: true,
    ...over,
  };
}

describe('validadores de requisito compondo com VALIDADORES_PADRAO (extensão aditiva)', () => {
  const LISTA = [...VALIDADORES_PADRAO, validarRequisitoSaida, validarRequisitoEntrada] as const;

  it('sem requisitos materializados (undefined) ⇒ transição válida passa', () => {
    expect(executarPreflight(ctxValido(), LISTA)).toEqual({ ok: true });
  });

  it('requisito de SAÍDA não atendido (false) ⇒ bloqueia com motivo estável', () => {
    expect(executarPreflight(ctxValido({ requisitoSaidaOk: false }), LISTA)).toEqual({
      ok: false,
      motivo: 'REQUISITO_SAIDA_NAO_ATENDIDO',
    });
  });

  it('requisito de ENTRADA não atendido (false) ⇒ bloqueia', () => {
    expect(executarPreflight(ctxValido({ requisitoEntradaOk: false }), LISTA)).toEqual({
      ok: false,
      motivo: 'REQUISITO_ENTRADA_NAO_ATENDIDO',
    });
  });

  it('requisitos satisfeitos (true) ⇒ passa', () => {
    expect(
      executarPreflight(ctxValido({ requisitoSaidaOk: true, requisitoEntradaOk: true }), LISTA),
    ).toEqual({ ok: true });
  });

  it('bloqueio estrutural (built-in) PREVALECE sobre o requisito de Fase (curto-circuito na ordem)', () => {
    // Ciclo não aberto vem antes na lista; mesmo com requisito de entrada faltando, o motivo é o do built-in.
    const r = executarPreflight(
      ctxValido({
        card: { id: 'c', lifecycleState: 'FINALIZADO', phaseId: 'p1' },
        requisitoEntradaOk: false,
      }),
      LISTA,
    );
    expect(r).toEqual({ ok: false, motivo: 'CICLO_NAO_ABERTO' });
  });

  it('VALIDADORES_PADRAO (2.14) permanece com 5 validadores — a 2.15 NÃO reescreve a constante', () => {
    expect(VALIDADORES_PADRAO).toHaveLength(5);
  });
});
