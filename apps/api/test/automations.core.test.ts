import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ConfiguracaoInvalidaError,
  extrairReferencias,
  LIMITE_ACOES,
  LIMITE_CONDICOES,
  validarConfiguracao,
} from '../src/pipes/automations/automation-config';

/**
 * Núcleo PURO da configuração da Automação (Story 4.1). Sem banco e sem HTTP: aqui se prova que a
 * estrutura `Quando → Condições → Então` é fail-closed e que referência só existe por ID estável.
 *
 * O que este arquivo deliberadamente NÃO testa: o vocabulário dos catálogos (Evento/Condição/Ação), que
 * é 4.3/4.4/4.5. Um teste que exigisse `tipo: 'CARD_MOVIDO'` aqui congelaria um catálogo que esta Story
 * não tem autoridade para definir.
 */

const uuid = () => randomUUID();

const CONFIG_VALIDA = () => ({
  quando: { tipo: 'CARD_CRIADO' },
  condicoes: [],
  entao: [{ tipo: 'MOVER_CARD', parametros: { destino: 'x' } }],
});

describe('validarConfiguracao — estrutura Quando → Condições → Então', () => {
  it('aceita a configuração mínima válida e normaliza os opcionais', () => {
    const c = validarConfiguracao(CONFIG_VALIDA());

    expect(c.quando.tipo).toBe('CARD_CRIADO');
    expect(c.quando.refs).toEqual([]); // ausente ⇒ [], não undefined
    expect(c.condicoes).toEqual([]);
    expect(c.entao).toHaveLength(1);
  });

  it('aceita `condicoes` ausente — "sem Condição, a Ação executa direto" (D4.1)', () => {
    const c = validarConfiguracao({
      quando: { tipo: 'X' },
      entao: [{ tipo: 'Y' }],
    });
    expect(c.condicoes).toEqual([]);
  });

  it('REJEITA `entao` vazio — uma Automação sem Ação não reage a nada', () => {
    expect(() => validarConfiguracao({ quando: { tipo: 'X' }, entao: [] })).toThrow(
      ConfiguracaoInvalidaError,
    );
  });

  it.each([
    ['quando ausente', { quando: undefined, entao: [{ tipo: 'Y' }] }],
    ['quando sem tipo', { quando: {}, entao: [{ tipo: 'Y' }] }],
    ['quando com tipo vazio', { quando: { tipo: '   ' }, entao: [{ tipo: 'Y' }] }],
    ['quando array', { quando: [], entao: [{ tipo: 'Y' }] }],
    ['entao ausente', { quando: { tipo: 'X' }, entao: undefined }],
    ['entao não-array', { quando: { tipo: 'X' }, entao: { tipo: 'Y' } }],
    ['condicoes não-array', { quando: { tipo: 'X' }, condicoes: {}, entao: [{ tipo: 'Y' }] }],
    ['ação sem tipo', { quando: { tipo: 'X' }, entao: [{ parametros: {} }] }],
    [
      'ação com parametros não-objeto',
      { quando: { tipo: 'X' }, entao: [{ tipo: 'Y', parametros: 1 }] },
    ],
    [
      'condição sem operador',
      { quando: { tipo: 'X' }, condicoes: [{ tipo: 'C' }], entao: [{ tipo: 'Y' }] },
    ],
  ])('REJEITA fail-closed: %s', (_nome, entrada) => {
    expect(() => validarConfiguracao(entrada as never)).toThrow(ConfiguracaoInvalidaError);
  });
});

describe('allowlist de chaves — anti-mass-assignment', () => {
  it('REJEITA chave desconhecida em `quando` em vez de ignorá-la silenciosamente', () => {
    expect(() =>
      validarConfiguracao({
        quando: { tipo: 'X', malicioso: true },
        entao: [{ tipo: 'Y' }],
      }),
    ).toThrow(/chave não permitida/);
  });

  it('REJEITA chave desconhecida numa Ação', () => {
    expect(() =>
      validarConfiguracao({
        quando: { tipo: 'X' },
        entao: [{ tipo: 'Y', orgId: 'outra-org' }],
      }),
    ).toThrow(/chave não permitida/);
  });

  it('REJEITA chave desconhecida numa Condição', () => {
    expect(() =>
      validarConfiguracao({
        quando: { tipo: 'X' },
        condicoes: [{ tipo: 'C', operador: 'IGUAL', valor: 1, bypass: true }],
        entao: [{ tipo: 'Y' }],
      }),
    ).toThrow(/chave não permitida/);
  });
});

describe('referências — ID estável e tenant-safe', () => {
  it('aceita referência com UUID e tipo da allowlist', () => {
    const id = uuid();
    const c = validarConfiguracao({
      quando: { tipo: 'X', refs: [{ tipo: 'PHASE', id }] },
      entao: [{ tipo: 'Y' }],
    });
    expect(c.quando.refs).toEqual([{ tipo: 'PHASE', id }]);
  });

  it('REJEITA referência por RÓTULO — rótulo é editável, ID é estável', () => {
    expect(() =>
      validarConfiguracao({
        quando: { tipo: 'X', refs: [{ tipo: 'PHASE', id: 'Fase de Triagem' }] },
        entao: [{ tipo: 'Y' }],
      }),
    ).toThrow(/ID estável/);
  });

  it('REJEITA tipo de referência fora da allowlist', () => {
    expect(() =>
      validarConfiguracao({
        quando: { tipo: 'X', refs: [{ tipo: 'ORGANIZATION', id: uuid() }] },
        entao: [{ tipo: 'Y' }],
      }),
    ).toThrow(/desconhecido/);
  });

  it('REJEITA chave extra dentro da referência', () => {
    expect(() =>
      validarConfiguracao({
        quando: { tipo: 'X', refs: [{ tipo: 'PHASE', id: uuid(), orgId: uuid() }] },
        entao: [{ tipo: 'Y' }],
      }),
    ).toThrow(/chave não permitida/);
  });

  it('extrairReferencias achata os TRÊS ramos — nenhum fica de fora da revalidação', () => {
    const a = uuid();
    const b = uuid();
    const d = uuid();

    const config = validarConfiguracao({
      quando: { tipo: 'X', refs: [{ tipo: 'PHASE', id: a }] },
      condicoes: [{ tipo: 'C', operador: 'IGUAL', valor: 1, refs: [{ tipo: 'FIELD', id: b }] }],
      entao: [{ tipo: 'Y', refs: [{ tipo: 'RECORD', id: d }] }],
    });

    expect(extrairReferencias(config).map((r) => r.id)).toEqual([a, b, d]);
  });
});

describe('limites — uma configuração é uma REGRA, não um programa', () => {
  it('REJEITA acima do limite de Condições', () => {
    const condicoes = Array.from({ length: LIMITE_CONDICOES + 1 }, () => ({
      tipo: 'C',
      operador: 'IGUAL',
      valor: 1,
    }));
    expect(() =>
      validarConfiguracao({ quando: { tipo: 'X' }, condicoes, entao: [{ tipo: 'Y' }] }),
    ).toThrow(/limite/);
  });

  it('REJEITA acima do limite de Ações', () => {
    const entao = Array.from({ length: LIMITE_ACOES + 1 }, () => ({ tipo: 'Y' }));
    expect(() => validarConfiguracao({ quando: { tipo: 'X' }, entao })).toThrow(/limite/);
  });

  it('REJEITA o TOTAL de referências, mesmo com cada array dentro do seu limite', () => {
    // O caso que os limites por-array deixam passar: 20 Ações × 20 refs = 400 referências, cada array
    // legítimo, o total abusivo. Sem o teto global, isso viraria centenas de verificações no banco por
    // requisição — payload barato de escrever, caro de validar.
    const entao = Array.from({ length: 20 }, () => ({
      tipo: 'Y',
      refs: Array.from({ length: 20 }, () => ({ tipo: 'FIELD', id: uuid() })),
    }));

    expect(() => validarConfiguracao({ quando: { tipo: 'X' }, entao })).toThrow(
      /total de referências/,
    );
  });

  it('ACEITA um total dentro do teto — o limite não estrangula uso legítimo', () => {
    const entao = Array.from({ length: 5 }, () => ({
      tipo: 'Y',
      refs: Array.from({ length: 5 }, () => ({ tipo: 'FIELD', id: uuid() })),
    }));

    expect(validarConfiguracao({ quando: { tipo: 'X' }, entao }).entao).toHaveLength(5);
  });
});
