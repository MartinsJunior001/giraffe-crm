import { describe, expect, it } from 'vitest';
import type { Condicao } from '../src/pipes/automations/automation-config';
import { avaliarCondicoes } from '../src/pipes/automations/conditions/condition-eval.core';
import type {
  CardSnapshot,
  RecordSnapshot,
  SnapshotAvaliacao,
} from '../src/pipes/automations/conditions/condition-snapshot';

/**
 * Avaliador de Condições (Story 4.4) — teste PURO e determinístico do núcleo AND fail-closed. Sem banco: o
 * avaliador opera sobre o SNAPSHOT em memória (montado pelo motor 4.6 sob RLS), como `record-query.core` e
 * `card-health.core`. Cobre as provas exigidas (a)–(g) do gate de risco ALTO.
 */

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAMPO_TEXTO = 'f0000000-0000-4000-8000-000000000001';
const CAMPO_NUM = 'f0000000-0000-4000-8000-000000000002';
const CAMPO_DATA = 'f0000000-0000-4000-8000-000000000003';
const CAMPO_SEL = 'f0000000-0000-4000-8000-000000000004';
const CAMPO_BOOL = 'f0000000-0000-4000-8000-000000000005';
const CAMPO_FILE = 'f0000000-0000-4000-8000-000000000006';
const FASE = 'b0000000-0000-4000-8000-000000000001';
const OUTRA_FASE = 'b0000000-0000-4000-8000-0000000000ff';
const REC = 'c0000000-0000-4000-8000-000000000001';

const AGORA = new Date('2026-07-22T12:00:00.000Z');
const PASSADO = new Date('2026-07-22T11:00:00.000Z');
const FUTURO = new Date('2026-07-22T13:00:00.000Z');

const CAMPOS_BASE: Record<string, { type: string }> = {
  [CAMPO_TEXTO]: { type: 'TEXT_SHORT' },
  [CAMPO_NUM]: { type: 'NUMBER' },
  [CAMPO_DATA]: { type: 'DATETIME' },
  [CAMPO_SEL]: { type: 'SELECT_MULTI' },
  [CAMPO_BOOL]: { type: 'BOOLEAN' },
  [CAMPO_FILE]: { type: 'FILE' },
};

const CARD_BASE: CardSnapshot = {
  lifecycleState: 'ATIVO',
  saude: 'ok',
  phaseId: FASE,
  marcos: { esperado: null, vencimento: null, expiracao: null },
  valores: {},
  valoresAnteriores: null,
  linkedRecordIds: [],
};

const RECORD_BASE: RecordSnapshot = {
  lifecycleState: 'ATIVO',
  valores: {},
  valoresAnteriores: null,
};

function mkSnap(
  opts: {
    avaliadoEm?: Date;
    campos?: Record<string, { type: string }>;
    card?: Partial<CardSnapshot> | null;
    record?: Partial<RecordSnapshot> | null;
  } = {},
): SnapshotAvaliacao {
  return {
    orgId: ORG,
    avaliadoEm: opts.avaliadoEm ?? AGORA,
    camposPorId: opts.campos ?? CAMPOS_BASE,
    card: opts.card === null ? null : { ...CARD_BASE, ...(opts.card ?? {}) },
    record: opts.record === null ? null : { ...RECORD_BASE, ...(opts.record ?? {}) },
  };
}

function cond(p: Partial<Condicao>): Condicao {
  return { tipo: 'CARD_HEALTH', operador: 'igual', valor: 'ok', refs: [], ...p };
}

/** Avalia UMA Condição e devolve só o booleano final. */
function um(c: Condicao, s: SnapshotAvaliacao): boolean {
  return avaliarCondicoes([c], s).aprovado;
}

// ── (a) cada tipo do catálogo avalia corretamente, por tipo de valor ────────────────────────────────

describe('(a) domínio Card — estado e saúde', () => {
  it('CARD_LIFECYCLE_STATE igual/diferente', () => {
    expect(
      um(cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'igual', valor: 'ATIVO' }), mkSnap()),
    ).toBe(true);
    expect(
      um(cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'igual', valor: 'ARQUIVADO' }), mkSnap()),
    ).toBe(false);
    expect(
      um(
        cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'diferente', valor: 'ARQUIVADO' }),
        mkSnap(),
      ),
    ).toBe(true);
  });

  it('CARD_HEALTH igual', () => {
    expect(um(cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'ok' }), mkSnap())).toBe(true);
    expect(
      um(
        cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'vencido' }),
        mkSnap({ card: { saude: 'vencido' } }),
      ),
    ).toBe(true);
    expect(um(cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'vencido' }), mkSnap())).toBe(
      false,
    );
  });
});

describe('(a) domínio Fase — Fase atual do Card', () => {
  it('CARD_PHASE igual/diferente por Phase.id de referência', () => {
    const igual = cond({
      tipo: 'CARD_PHASE',
      operador: 'igual',
      valor: null,
      refs: [{ tipo: 'PHASE', id: FASE }],
    });
    expect(um(igual, mkSnap())).toBe(true);
    const outra = cond({
      tipo: 'CARD_PHASE',
      operador: 'igual',
      valor: null,
      refs: [{ tipo: 'PHASE', id: OUTRA_FASE }],
    });
    expect(um(outra, mkSnap())).toBe(false);
    const diferente = cond({
      tipo: 'CARD_PHASE',
      operador: 'diferente',
      valor: null,
      refs: [{ tipo: 'PHASE', id: OUTRA_FASE }],
    });
    expect(um(diferente, mkSnap())).toBe(true);
  });
});

describe('(a) domínio Campo e valor — por tipo de Campo (semântica do Form Builder)', () => {
  function campo(fieldId: string, operador: string, valor: unknown): Condicao {
    return cond({
      tipo: 'CARD_FIELD_VALUE',
      operador,
      valor,
      refs: [{ tipo: 'FIELD', id: fieldId }],
    });
  }

  it('texto: contem / igual', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_TEXTO]: 'hello world' } } });
    expect(um(campo(CAMPO_TEXTO, 'contem', 'lo wo'), s)).toBe(true);
    expect(um(campo(CAMPO_TEXTO, 'igual', 'hello world'), s)).toBe(true);
    expect(um(campo(CAMPO_TEXTO, 'igual', 'outro'), s)).toBe(false);
  });

  it('número: maior / menor / intervalo (sem coerção de string)', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_NUM]: 20 } } });
    expect(um(campo(CAMPO_NUM, 'maior', 10), s)).toBe(true);
    expect(um(campo(CAMPO_NUM, 'menor', 10), s)).toBe(false);
    expect(um(campo(CAMPO_NUM, 'intervalo', [10, 30]), s)).toBe(true);
    expect(um(campo(CAMPO_NUM, 'intervalo', [21, 30]), s)).toBe(false);
    // Sem coerção: "20" (string) não é número → fail-closed.
    expect(um(campo(CAMPO_NUM, 'igual', '20'), s)).toBe(false);
  });

  it('data: comparação por instante absoluto UTC (fuso oficial)', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_DATA]: '2026-07-22T12:00:00.000Z' } } });
    expect(um(campo(CAMPO_DATA, 'maior', '2026-01-01T00:00:00.000Z'), s)).toBe(true);
    expect(um(campo(CAMPO_DATA, 'menor', '2026-01-01T00:00:00.000Z'), s)).toBe(false);
    expect(
      um(
        campo(CAMPO_DATA, 'intervalo', ['2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z']),
        s,
      ),
    ).toBe(true);
  });

  it('seleção múltipla: contemOpcao', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_SEL]: ['opt-a', 'opt-b'] } } });
    expect(um(campo(CAMPO_SEL, 'contemOpcao', 'opt-a'), s)).toBe(true);
    expect(um(campo(CAMPO_SEL, 'contemOpcao', 'opt-z'), s)).toBe(false);
  });

  it('booleano: igual', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_BOOL]: true } } });
    expect(um(campo(CAMPO_BOOL, 'igual', true), s)).toBe(true);
    expect(um(campo(CAMPO_BOOL, 'igual', false), s)).toBe(false);
  });

  it('preenchido / vazio (nulo, vazio e Campo ausente — comportamento explícito)', () => {
    const preenchido = mkSnap({ card: { valores: { [CAMPO_TEXTO]: 'x' } } });
    const vazio = mkSnap({ card: { valores: { [CAMPO_TEXTO]: '' } } });
    const ausente = mkSnap({ card: { valores: {} } });
    expect(um(campo(CAMPO_TEXTO, 'preenchido', null), preenchido)).toBe(true);
    expect(um(campo(CAMPO_TEXTO, 'vazio', null), vazio)).toBe(true);
    expect(um(campo(CAMPO_TEXTO, 'vazio', null), ausente)).toBe(true);
    expect(um(campo(CAMPO_TEXTO, 'preenchido', null), ausente)).toBe(false);
  });

  it('RECORD_FIELD_VALUE lê os valores do Registro, não do Card', () => {
    const c = cond({
      tipo: 'RECORD_FIELD_VALUE',
      operador: 'igual',
      valor: 'reg',
      refs: [{ tipo: 'FIELD', id: CAMPO_TEXTO }],
    });
    expect(um(c, mkSnap({ record: { valores: { [CAMPO_TEXTO]: 'reg' } } }))).toBe(true);
    // sem snapshot de Registro (Evento de Card) → fail-closed
    expect(um(c, mkSnap({ record: null }))).toBe(false);
  });
});

describe('(a) domínio prazo e marco — CARD_MILESTONE (usa avaliadoEm, não o relógio real)', () => {
  it('atingido / nao_atingido pelo instante de referência', () => {
    const marcoPassado = mkSnap({
      card: { marcos: { esperado: null, vencimento: PASSADO, expiracao: null } },
    });
    const marcoFuturo = mkSnap({
      card: { marcos: { esperado: null, vencimento: FUTURO, expiracao: null } },
    });
    expect(
      um(cond({ tipo: 'CARD_MILESTONE', operador: 'atingido', valor: 'vencimento' }), marcoPassado),
    ).toBe(true);
    expect(
      um(
        cond({ tipo: 'CARD_MILESTONE', operador: 'nao_atingido', valor: 'vencimento' }),
        marcoPassado,
      ),
    ).toBe(false);
    expect(
      um(cond({ tipo: 'CARD_MILESTONE', operador: 'atingido', valor: 'vencimento' }), marcoFuturo),
    ).toBe(false);
    // marco não configurado → não atingido
    expect(
      um(cond({ tipo: 'CARD_MILESTONE', operador: 'atingido', valor: 'expiracao' }), mkSnap()),
    ).toBe(false);
    expect(
      um(cond({ tipo: 'CARD_MILESTONE', operador: 'nao_atingido', valor: 'expiracao' }), mkSnap()),
    ).toBe(true);
  });
});

describe('(a) domínio relacionamento — CARD_HAS_RECORD_LINK', () => {
  it('existe / nao_existe (qualquer vínculo, ou um Registro específico)', () => {
    const comVinculo = mkSnap({ card: { linkedRecordIds: [REC] } });
    expect(
      um(cond({ tipo: 'CARD_HAS_RECORD_LINK', operador: 'existe', valor: null }), comVinculo),
    ).toBe(true);
    expect(
      um(cond({ tipo: 'CARD_HAS_RECORD_LINK', operador: 'nao_existe', valor: null }), comVinculo),
    ).toBe(false);
    expect(
      um(cond({ tipo: 'CARD_HAS_RECORD_LINK', operador: 'existe', valor: null }), mkSnap()),
    ).toBe(false);
    // Registro específico
    const especifico = cond({
      tipo: 'CARD_HAS_RECORD_LINK',
      operador: 'existe',
      valor: null,
      refs: [{ tipo: 'RECORD', id: REC }],
    });
    expect(um(especifico, comVinculo)).toBe(true);
    expect(um(especifico, mkSnap({ card: { linkedRecordIds: ['outro'] } }))).toBe(false);
  });
});

// ── (b) AND ─────────────────────────────────────────────────────────────────────────────────────────

describe('(b) combinação AND', () => {
  it('conjunto VAZIO → aprovado direto', () => {
    const r = avaliarCondicoes([], mkSnap());
    expect(r.aprovado).toBe(true);
    expect(r.resultados).toHaveLength(0);
  });

  it('todas verdadeiras → aprovado', () => {
    const r = avaliarCondicoes(
      [
        cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'igual', valor: 'ATIVO' }),
        cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'ok' }),
      ],
      mkSnap(),
    );
    expect(r.aprovado).toBe(true);
    expect(r.resultados.map((x) => x.resultado)).toEqual([true, true]);
  });

  it('qualquer falsa → reprovado (mas registra CADA resultado)', () => {
    const r = avaliarCondicoes(
      [
        cond({ tipo: 'CARD_LIFECYCLE_STATE', operador: 'igual', valor: 'ATIVO' }),
        cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'expirado' }),
      ],
      mkSnap(),
    );
    expect(r.aprovado).toBe(false);
    expect(r.resultados.map((x) => x.resultado)).toEqual([true, false]);
  });
});

// ── (c) fail-closed ─────────────────────────────────────────────────────────────────────────────────

describe('(c) fail-closed — desconhecido/malformado/não-avaliável → falso, nunca exceção', () => {
  it('tipo de Condição fora do catálogo → falso (defesa em profundidade)', () => {
    expect(um(cond({ tipo: 'CONDICAO_ZUMBI', operador: 'igual', valor: 'x' }), mkSnap())).toBe(
      false,
    );
  });

  it('operador incompatível com o tipo do Campo → falso (`contem` sobre número)', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_NUM]: 20 } } });
    const c = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'contem',
      valor: '2',
      refs: [{ tipo: 'FIELD', id: CAMPO_NUM }],
    });
    expect(um(c, s)).toBe(false);
  });

  it('valor malformado → falso (número esperando string, data inválida)', () => {
    const sNum = mkSnap({ card: { valores: { [CAMPO_NUM]: 20 } } });
    expect(
      um(
        cond({
          tipo: 'CARD_FIELD_VALUE',
          operador: 'maior',
          valor: 'abc',
          refs: [{ tipo: 'FIELD', id: CAMPO_NUM }],
        }),
        sNum,
      ),
    ).toBe(false);
    const sData = mkSnap({ card: { valores: { [CAMPO_DATA]: '2026-07-22T12:00:00.000Z' } } });
    expect(
      um(
        cond({
          tipo: 'CARD_FIELD_VALUE',
          operador: 'maior',
          valor: 'nao-e-data',
          refs: [{ tipo: 'FIELD', id: CAMPO_DATA }],
        }),
        sData,
      ),
    ).toBe(false);
  });

  it('Campo FILE é gated (AD-28) → falso', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_FILE]: 'file-id' } } });
    const c = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'preenchido',
      valor: null,
      refs: [{ tipo: 'FIELD', id: CAMPO_FILE }],
    });
    expect(um(c, s)).toBe(false);
  });

  it('Condição de Card com snapshot SEM card → falso', () => {
    expect(
      um(cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'ok' }), mkSnap({ card: null })),
    ).toBe(false);
  });

  it('NUNCA lança — mesmo com entrada absurda, devolve resultado', () => {
    const lixo = {
      tipo: 'CARD_FIELD_VALUE',
      operador: 'intervalo',
      valor: null,
      refs: [],
    } as unknown as Condicao;
    expect(() => avaliarCondicoes([lixo], mkSnap())).not.toThrow();
    expect(avaliarCondicoes([lixo], mkSnap()).aprovado).toBe(false);
  });
});

// ── (d) comparação segura / anti-injeção ────────────────────────────────────────────────────────────

describe('(d) comparação literal e segura (sem injeção, sem cast DoS)', () => {
  it('metacaracteres SQL são comparados como TEXTO literal, nunca interpretados', () => {
    const payload = "'; DROP TABLE Card; -- ' OR 1=1";
    const s = mkSnap({ card: { valores: { [CAMPO_TEXTO]: payload } } });
    const c = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'igual',
      valor: payload,
      refs: [{ tipo: 'FIELD', id: CAMPO_TEXTO }],
    });
    expect(um(c, s)).toBe(true); // igualdade literal
    const outro = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'igual',
      valor: 'x',
      refs: [{ tipo: 'FIELD', id: CAMPO_TEXTO }],
    });
    expect(um(outro, s)).toBe(false);
  });

  it('data malformada não vira cast custoso — fail-closed determinístico', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_DATA]: 'tampouco-e-data' } } });
    const c = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'maior',
      valor: '2020-01-01T00:00:00Z',
      refs: [{ tipo: 'FIELD', id: CAMPO_DATA }],
    });
    expect(um(c, s)).toBe(false);
  });
});

// ── (e) determinismo ────────────────────────────────────────────────────────────────────────────────

describe('(e) determinismo — mesmo snapshot ⇒ mesmo resultado', () => {
  it('duas avaliações do mesmo snapshot são idênticas', () => {
    const s = mkSnap({ card: { saude: 'atrasado', valores: { [CAMPO_NUM]: 7 } } });
    const cs = [
      cond({ tipo: 'CARD_HEALTH', operador: 'igual', valor: 'atrasado' }),
      cond({
        tipo: 'CARD_FIELD_VALUE',
        operador: 'maior',
        valor: 5,
        refs: [{ tipo: 'FIELD', id: CAMPO_NUM }],
      }),
    ];
    expect(avaliarCondicoes(cs, s)).toEqual(avaliarCondicoes(cs, s));
  });

  it('o veredito temporal depende só de avaliadoEm (não do relógio real)', () => {
    const marcos = { esperado: null, vencimento: AGORA, expiracao: null };
    const c = cond({ tipo: 'CARD_MILESTONE', operador: 'atingido', valor: 'vencimento' });
    // avaliadoEm == marco → limiar inclusivo → atingido
    expect(um(c, mkSnap({ avaliadoEm: AGORA, card: { marcos } }))).toBe(true);
    // avaliadoEm 1ms antes → não atingido
    expect(um(c, mkSnap({ avaliadoEm: new Date(AGORA.getTime() - 1), card: { marcos } }))).toBe(
      false,
    );
  });
});

// ── (f) isolamento cross-tenant do snapshot ─────────────────────────────────────────────────────────

describe('(f) isolamento — referência ausente do snapshot é fail-closed, nunca avalia contra dado alheio', () => {
  it('Campo de outra Org não está em camposPorId → falso', () => {
    const outroCampo = 'f0000000-0000-4000-8000-0000000000ff';
    const s = mkSnap({ card: { valores: { [outroCampo]: 'segredo-alheio' } } });
    const c = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'igual',
      valor: 'segredo-alheio',
      refs: [{ tipo: 'FIELD', id: outroCampo }],
    });
    // o motor (4.6) só põe no snapshot os Campos ATIVOS alcançáveis sob RLS; um id alheio não está no índice
    expect(um(c, s)).toBe(false);
  });

  it('Fase de outra Org (Phase.id que não é a Fase atual) → falso', () => {
    const c = cond({
      tipo: 'CARD_PHASE',
      operador: 'igual',
      valor: null,
      refs: [{ tipo: 'PHASE', id: OUTRA_FASE }],
    });
    expect(um(c, mkSnap())).toBe(false);
  });
});

// ── (g) snapshot pós-Evento congela o estado ────────────────────────────────────────────────────────

describe('(g) snapshot pós-Evento — avalia contra o estado congelado, não relê nada', () => {
  it('o valor comparado vem exclusivamente de snapshot.valores', () => {
    const s = mkSnap({ card: { valores: { [CAMPO_TEXTO]: 'congelado' } } });
    const bate = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'igual',
      valor: 'congelado',
      refs: [{ tipo: 'FIELD', id: CAMPO_TEXTO }],
    });
    expect(um(bate, s)).toBe(true);
    // mutar o objeto externo depois não muda um resultado já calculado (avaliação é função pura do snapshot)
    const r1 = um(bate, s);
    const r2 = um(bate, s);
    expect(r1).toBe(r2);
  });

  it('operador de mudança usa o "antes" congelado no snapshot (valor anterior e posterior)', () => {
    const mudou = cond({
      tipo: 'CARD_FIELD_VALUE',
      operador: 'mudou',
      valor: null,
      refs: [{ tipo: 'FIELD', id: CAMPO_TEXTO }],
    });
    const comMudanca = mkSnap({
      card: { valores: { [CAMPO_TEXTO]: 'novo' }, valoresAnteriores: { [CAMPO_TEXTO]: 'velho' } },
    });
    const semMudanca = mkSnap({
      card: { valores: { [CAMPO_TEXTO]: 'igual' }, valoresAnteriores: { [CAMPO_TEXTO]: 'igual' } },
    });
    const semAntes = mkSnap({
      card: { valores: { [CAMPO_TEXTO]: 'novo' }, valoresAnteriores: null },
    });
    expect(um(mudou, comMudanca)).toBe(true);
    expect(um(mudou, semMudanca)).toBe(false);
    // sem "antes" (ex.: CARD_CREATED) não se prova mudança → fail-closed
    expect(um(mudou, semAntes)).toBe(false);
  });
});
