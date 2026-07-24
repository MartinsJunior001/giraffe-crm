import { describe, expect, it } from 'vitest';
import type { Acao } from '../src/pipes/automations/automation-config';
import {
  ACOES_CATALOGO,
  AcaoForaDoCatalogoError,
  exigeConfirmacaoHumana,
  exigirAcoesNoCatalogo,
  obterAcaoCatalogo,
  TIPOS_ACAO,
} from '../src/pipes/automations/actions/action-catalog';

/**
 * Catálogo de Ações (Story 4.5) — teste PURO do vocabulário fixo/completo da Fase 1 (Card + Registro), do
 * enforcement fail-closed de configuração (alvo determinístico, refs, parâmetros) e do requisito de confirmação
 * humana. Sem banco: o catálogo é um invariante testável sem PostgreSQL, como `condition-catalog.core.test.ts`
 * (4.4) e `event-catalog.core.test.ts` (4.3).
 */

/** Os tipos EXATOS — 8 de E4 (Story §1380) + 3 de E5 (Story 5.7) — congela o catálogo. */
const CATALOGO_ESPERADO = [
  'CARD_MOVE',
  'CARD_ASSIGN_RESPONSIBLE',
  'CARD_SET_FIELD_VALUE',
  'CARD_FINALIZE',
  'CARD_ARCHIVE',
  'RECORD_CREATE',
  'RECORD_CREATE_RELATED',
  'RECORD_EDIT',
  // E5 (Story 5.7)
  'TASK_CREATE',
  'REQUEST_CREATE',
  'NOTIFICATION_SEND',
];

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

/** Helper: constrói uma Ação estrutural (como a 4.1 a produziria). */
function acao(parcial: Partial<Acao>): Acao {
  return { tipo: 'CARD_FINALIZE', parametros: {}, refs: [], ...parcial };
}

describe('catálogo de Ações — fixo, completo, 2 domínios', () => {
  it('contém EXATAMENTE os tipos aprovados (8 de E4 + 3 de E5)', () => {
    expect([...TIPOS_ACAO].sort()).toEqual([...CATALOGO_ESPERADO].sort());
    expect(ACOES_CATALOGO).toHaveLength(11);
  });

  it('cobre os domínios oficiais (Card/Registro de E4 + Pipe/Notificação de E5)', () => {
    const dominios = new Set(ACOES_CATALOGO.map((a) => a.dominio));
    expect([...dominios].sort()).toEqual(['CARD', 'NOTIFICATION', 'PIPE', 'RECORD']);
  });

  it('(g) marca confirmação humana nas Ações sensíveis (mover/finalizar/arquivar/alterar Campo)', () => {
    expect(exigeConfirmacaoHumana('CARD_MOVE')).toBe(true);
    expect(exigeConfirmacaoHumana('CARD_FINALIZE')).toBe(true);
    expect(exigeConfirmacaoHumana('CARD_ARCHIVE')).toBe(true);
    expect(exigeConfirmacaoHumana('CARD_SET_FIELD_VALUE')).toBe(true);
    expect(exigeConfirmacaoHumana('RECORD_EDIT')).toBe(true);
    // Criação de Registro e atribuição de Responsável não são gate de confirmação humana no núcleo.
    expect(exigeConfirmacaoHumana('RECORD_CREATE')).toBe(false);
    expect(exigeConfirmacaoHumana('CARD_ASSIGN_RESPONSIBLE')).toBe(false);
    // Tipo desconhecido não "exige confirmação" — a recusa já barra (fail-closed é da revalidação).
    expect(exigeConfirmacaoHumana('INEXISTENTE')).toBe(false);
  });
});

describe('(a) enforcement fail-closed (exigirAcoesNoCatalogo)', () => {
  it('aceita cada tipo do catálogo com refs/parâmetros válidos', () => {
    const validas: Acao[] = [
      acao({ tipo: 'CARD_MOVE', refs: [{ tipo: 'PHASE', id: UUID_A }] }),
      acao({ tipo: 'CARD_ASSIGN_RESPONSIBLE', parametros: { membershipId: UUID_A } }),
      acao({
        tipo: 'CARD_SET_FIELD_VALUE',
        parametros: { valor: 'x' },
        refs: [{ tipo: 'FIELD', id: UUID_A }],
      }),
      acao({ tipo: 'CARD_FINALIZE' }),
      acao({ tipo: 'CARD_ARCHIVE' }),
      acao({ tipo: 'RECORD_CREATE', refs: [{ tipo: 'DATABASE', id: UUID_A }] }),
      acao({ tipo: 'RECORD_CREATE_RELATED', refs: [{ tipo: 'DATABASE', id: UUID_A }] }),
      acao({ tipo: 'RECORD_EDIT', parametros: { alvo: { modo: 'EVENTO' } } }),
      acao({ tipo: 'RECORD_EDIT', parametros: { alvo: { modo: 'VINCULO' } } }),
      acao({
        tipo: 'RECORD_EDIT',
        parametros: { alvo: { modo: 'EXPLICITO' }, valores: { [UUID_B]: 'y' } },
        refs: [{ tipo: 'RECORD', id: UUID_A }],
      }),
    ];
    expect(() => exigirAcoesNoCatalogo(validas)).not.toThrow();
  });

  it('rejeita tipo de Ação DESCONHECIDO (config-time 400 análogo a CONDICAO_FORA_DO_CATALOGO)', () => {
    expect(() => exigirAcoesNoCatalogo([acao({ tipo: 'MOVER_CARD' })])).toThrow(
      AcaoForaDoCatalogoError,
    );
    expect(() => exigirAcoesNoCatalogo([acao({ tipo: 'ACAO_XYZ' })])).toThrow(/desconhecido/);
  });

  it('rejeita ausência da referência EXIGIDA (Fase no mover; Campo no alterar; Database no criar)', () => {
    expect(() => exigirAcoesNoCatalogo([acao({ tipo: 'CARD_MOVE', refs: [] })])).toThrow(
      /exatamente uma referência/,
    );
    expect(() =>
      exigirAcoesNoCatalogo([acao({ tipo: 'CARD_SET_FIELD_VALUE', parametros: { valor: 'x' } })]),
    ).toThrow(/exatamente uma referência/);
    expect(() => exigirAcoesNoCatalogo([acao({ tipo: 'RECORD_CREATE', refs: [] })])).toThrow(
      /exatamente uma referência/,
    );
  });

  it('(e) alvo determinístico: RECORD_EDIT explícito exige EXATAMENTE uma referência de Registro', () => {
    // Explícito sem referência → inválido.
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({ tipo: 'RECORD_EDIT', parametros: { alvo: { modo: 'EXPLICITO' } } }),
      ]),
    ).toThrow(/exatamente uma referência/);
    // Explícito com DUAS referências → inválido (sem varredura/ambiguidade).
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({
          tipo: 'RECORD_EDIT',
          parametros: { alvo: { modo: 'EXPLICITO' } },
          refs: [
            { tipo: 'RECORD', id: UUID_A },
            { tipo: 'RECORD', id: UUID_B },
          ],
        }),
      ]),
    ).toThrow(/exatamente uma referência/);
    // Modo derivado do Evento NÃO aceita referência configurada.
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({
          tipo: 'RECORD_EDIT',
          parametros: { alvo: { modo: 'EVENTO' } },
          refs: [{ tipo: 'RECORD', id: UUID_A }],
        }),
      ]),
    ).toThrow(/não aceita referência/);
    // Modo desconhecido → inválido.
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({ tipo: 'RECORD_EDIT', parametros: { alvo: { modo: 'TODOS' } } }),
      ]),
    ).toThrow(/modo de alvo desconhecido/);
  });

  it('rejeita parâmetro fora da allowlist (anti-mass-assignment) e refs onde não cabem', () => {
    expect(() =>
      exigirAcoesNoCatalogo([acao({ tipo: 'CARD_FINALIZE', parametros: { forjado: 1 } })]),
    ).toThrow(/não aceita parâmetros/);
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({ tipo: 'CARD_FINALIZE', refs: [{ tipo: 'PHASE', id: UUID_A }] }),
      ]),
    ).toThrow(/não aceita referências/);
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({
          tipo: 'CARD_ASSIGN_RESPONSIBLE',
          parametros: { membershipId: UUID_A, extra: true },
        }),
      ]),
    ).toThrow(/chave não permitida/);
  });

  it('rejeita membershipId que não é UUID (alvo determinístico e tenant-safe)', () => {
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({ tipo: 'CARD_ASSIGN_RESPONSIBLE', parametros: { membershipId: 'fulano' } }),
      ]),
    ).toThrow(/UUID/);
  });

  it('exige a chave `valor` presente em CARD_SET_FIELD_VALUE (null é permitido para limpar)', () => {
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({
          tipo: 'CARD_SET_FIELD_VALUE',
          refs: [{ tipo: 'FIELD', id: UUID_A }],
          parametros: {},
        }),
      ]),
    ).toThrow(/obrigatório/);
    expect(() =>
      exigirAcoesNoCatalogo([
        acao({
          tipo: 'CARD_SET_FIELD_VALUE',
          refs: [{ tipo: 'FIELD', id: UUID_A }],
          parametros: { valor: null },
        }),
      ]),
    ).not.toThrow();
  });

  it('metadados: refs e domínio por tipo', () => {
    expect(obterAcaoCatalogo('CARD_MOVE')?.dominio).toBe('CARD');
    expect(obterAcaoCatalogo('RECORD_CREATE')?.dominio).toBe('RECORD');
    expect(obterAcaoCatalogo('INEXISTENTE')).toBeUndefined();
  });
});
