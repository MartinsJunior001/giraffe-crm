import { describe, expect, it } from 'vitest';
import type { Acao } from '../src/pipes/automations/automation-config';
import {
  type AlvoAcaoSnapshot,
  type ContextoEvento,
  resolverAlvoDeterministico,
  revalidarAcao,
} from '../src/pipes/automations/actions/action-revalidation.core';
import {
  PRINCIPAL_AUTOMACAO,
  type PrincipalAutomacao,
} from '../src/pipes/automations/actions/automation-principal';

/**
 * Revalidação de Ação sob o principal Automação (Story 4.5 — RN-101; AD-9/AD-18) — teste PURO. Prova:
 *  (b) revalidação fail-closed: alvo inexistente/estado inválido/fora do escopo → recusa;
 *  (c) não-ampliação: recurso fora do escopo restrito do principal → recusa (mesmo que o criador pudesse);
 *  (d) isolamento cross-tenant: alvo de outra Org → recusa;
 *  (e) alvo determinístico: mesmo Evento/config → mesmo alvo, sem ambiguidade.
 */

const ORG = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OUTRA_ORG = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const PIPE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OUTRO_PIPE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CARD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DATABASE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RECORD = '99999999-9999-4999-8999-999999999999';

function principal(parcial: Partial<PrincipalAutomacao> = {}): PrincipalAutomacao {
  return {
    tipo: PRINCIPAL_AUTOMACAO,
    orgId: ORG,
    pipeId: PIPE,
    automationId: 'auto-1',
    automationVersionId: 'v1',
    recursosAutorizados: new Set([PIPE, DATABASE]),
    capacidades: new Set([
      'CARD_FINALIZE',
      'CARD_MOVE',
      'RECORD_CREATE',
      'RECORD_CREATE_RELATED',
      'RECORD_EDIT',
    ]),
    ...parcial,
  };
}

function contexto(parcial: Partial<ContextoEvento> = {}): ContextoEvento {
  return {
    cardId: CARD,
    recordId: RECORD,
    taskId: null,
    requestId: null,
    linkedRecordIds: [],
    ...parcial,
  };
}

function cardSnapshot(parcial: Partial<AlvoAcaoSnapshot> = {}): AlvoAcaoSnapshot {
  return {
    encontrado: true,
    orgId: ORG,
    pipeId: PIPE,
    databaseId: null,
    lifecycleState: 'ATIVO',
    ...parcial,
  };
}

const acaoFinalizar: Acao = { tipo: 'CARD_FINALIZE', parametros: {}, refs: [] };

// ── (e) Resolução do alvo determinístico ──────────────────────────────────────────────────────────────

describe('(e) resolução do alvo determinístico', () => {
  it('Ação de Card resolve para o Card de contexto do Evento', () => {
    expect(resolverAlvoDeterministico(acaoFinalizar, contexto())).toEqual({ recursoId: CARD });
  });

  it('é determinística: mesmo Evento/config → mesmo alvo', () => {
    const ctx = contexto();
    const r1 = resolverAlvoDeterministico(acaoFinalizar, ctx);
    const r2 = resolverAlvoDeterministico(acaoFinalizar, ctx);
    expect(r1).toEqual(r2);
    expect(r1).toEqual({ recursoId: CARD });
  });

  it('Ação de Card sem Card de contexto → nenhum alvo (fail-closed)', () => {
    expect(resolverAlvoDeterministico(acaoFinalizar, contexto({ cardId: null }))).toBeNull();
  });

  it('RECORD_EDIT modo EVENTO resolve para o Registro que originou o Evento', () => {
    const a: Acao = { tipo: 'RECORD_EDIT', parametros: { alvo: { modo: 'EVENTO' } }, refs: [] };
    expect(resolverAlvoDeterministico(a, contexto())).toEqual({ recursoId: RECORD });
    expect(resolverAlvoDeterministico(a, contexto({ recordId: null }))).toBeNull();
  });

  it('RECORD_EDIT modo VINCULO exige EXATAMENTE um vínculo — 0 ou >1 é ambíguo → nulo', () => {
    const a: Acao = { tipo: 'RECORD_EDIT', parametros: { alvo: { modo: 'VINCULO' } }, refs: [] };
    expect(resolverAlvoDeterministico(a, contexto({ linkedRecordIds: [RECORD] }))).toEqual({
      recursoId: RECORD,
    });
    expect(resolverAlvoDeterministico(a, contexto({ linkedRecordIds: [] }))).toBeNull();
    expect(
      resolverAlvoDeterministico(a, contexto({ linkedRecordIds: [RECORD, 'outro'] })),
    ).toBeNull();
  });

  it('RECORD_EDIT modo EXPLICITO resolve para a referência configurada', () => {
    const a: Acao = {
      tipo: 'RECORD_EDIT',
      parametros: { alvo: { modo: 'EXPLICITO' } },
      refs: [{ tipo: 'RECORD', id: RECORD }],
    };
    expect(resolverAlvoDeterministico(a, contexto())).toEqual({ recursoId: RECORD });
  });

  it('RECORD_CREATE_RELATED exige um Card de contexto (senão nulo)', () => {
    const a: Acao = {
      tipo: 'RECORD_CREATE_RELATED',
      parametros: {},
      refs: [{ tipo: 'DATABASE', id: DATABASE }],
    };
    expect(resolverAlvoDeterministico(a, contexto())).toEqual({ recursoId: DATABASE });
    expect(resolverAlvoDeterministico(a, contexto({ cardId: null }))).toBeNull();
  });

  it('tipo fora do catálogo → nenhum alvo (defesa em profundidade)', () => {
    const a: Acao = { tipo: 'INEXISTENTE', parametros: {}, refs: [] };
    expect(resolverAlvoDeterministico(a, contexto())).toBeNull();
  });
});

// ── Revalidação sob o principal ───────────────────────────────────────────────────────────────────────

describe('revalidação sob o principal Automação', () => {
  it('permite a Ação quando alvo existe, é da Org/Pipe do principal, estado válido e há capacidade', () => {
    const r = revalidarAcao(acaoFinalizar, { recursoId: CARD }, cardSnapshot(), principal());
    expect(r.permitido).toBe(true);
    expect(r.motivo).toBeNull();
  });

  it('(b) alvo INDETERMINADO (sem alvo resolvido) → recusa, não executa', () => {
    const r = revalidarAcao(acaoFinalizar, null, cardSnapshot(), principal());
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('ALVO_INDETERMINADO');
  });

  it('(b) alvo INEXISTENTE (não encontrado sob RLS) → recusa', () => {
    const r = revalidarAcao(
      acaoFinalizar,
      { recursoId: CARD },
      cardSnapshot({ encontrado: false }),
      principal(),
    );
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('NAO_ENCONTRADO');
  });

  it('(b) estado INVÁLIDO (Card arquivado é somente-leitura) → recusa', () => {
    const r = revalidarAcao(
      acaoFinalizar,
      { recursoId: CARD },
      cardSnapshot({ lifecycleState: 'ARQUIVADO' }),
      principal(),
    );
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('ESTADO_INVALIDO');
  });

  it('(c) NÃO-AMPLIAÇÃO: sem capacidade explícita → recusa, mesmo que o alvo seja alcançável', () => {
    const semCap = principal({ capacidades: new Set(['RECORD_CREATE']) }); // não tem CARD_FINALIZE
    const r = revalidarAcao(acaoFinalizar, { recursoId: CARD }, cardSnapshot(), semCap);
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('SEM_CAPACIDADE');
  });

  it('(c) NÃO-AMPLIAÇÃO: Card de OUTRO Pipe → recusa (Ações de Card só no Pipe da Automação)', () => {
    const r = revalidarAcao(
      acaoFinalizar,
      { recursoId: CARD },
      cardSnapshot({ pipeId: OUTRO_PIPE }),
      principal(),
    );
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('FORA_DO_ESCOPO');
  });

  it('(d) ISOLAMENTO cross-tenant: alvo de OUTRA Organização → recusa', () => {
    const r = revalidarAcao(
      acaoFinalizar,
      { recursoId: CARD },
      cardSnapshot({ orgId: OUTRA_ORG }),
      principal(),
    );
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('FORA_DA_ORG');
  });

  it('Registro: criar exige Database no escopo configurado; fora dele → recusa', () => {
    const criar: Acao = {
      tipo: 'RECORD_CREATE',
      parametros: {},
      refs: [{ tipo: 'DATABASE', id: DATABASE }],
    };
    const alvoOk = revalidarAcao(
      criar,
      { recursoId: DATABASE },
      cardSnapshot({ pipeId: null, databaseId: DATABASE, lifecycleState: 'ACTIVE' }),
      principal(),
    );
    expect(alvoOk.permitido).toBe(true);

    const foraEscopo = revalidarAcao(
      criar,
      { recursoId: 'outro-db' },
      cardSnapshot({ pipeId: null, databaseId: 'outro-db', lifecycleState: 'ACTIVE' }),
      principal(),
    );
    expect(foraEscopo.permitido).toBe(false);
    expect(foraEscopo.motivo).toBe('FORA_DO_ESCOPO');
  });

  it('RECORD_EDIT modo EVENTO: alvo derivado do Evento é escopado por Org (não exige ref configurada)', () => {
    const editar: Acao = {
      tipo: 'RECORD_EDIT',
      parametros: { alvo: { modo: 'EVENTO' } },
      refs: [],
    };
    // Registro da MESMA Org, sem estar na allowlist de recursos: permitido (é o sujeito do Evento).
    const ok = revalidarAcao(
      editar,
      { recursoId: RECORD },
      cardSnapshot({ pipeId: null, databaseId: 'db-do-registro', lifecycleState: 'ATIVO' }),
      principal(),
    );
    expect(ok.permitido).toBe(true);
    // Mas de OUTRA Org continua recusado (isolamento).
    const alheio = revalidarAcao(
      editar,
      { recursoId: RECORD },
      cardSnapshot({ orgId: OUTRA_ORG, pipeId: null, databaseId: 'db', lifecycleState: 'ATIVO' }),
      principal(),
    );
    expect(alheio.permitido).toBe(false);
    expect(alheio.motivo).toBe('FORA_DA_ORG');
  });

  it('(g) o veredito carrega o requisito de confirmação humana para o motor (4.6) decidir', () => {
    // CARD_FINALIZE é sensível → exige confirmação, mesmo quando permitido.
    const permitido = revalidarAcao(
      acaoFinalizar,
      { recursoId: CARD },
      cardSnapshot(),
      principal(),
    );
    expect(permitido.exigeConfirmacaoHumana).toBe(true);
    // RECORD_CREATE não é gate de confirmação.
    const criar: Acao = {
      tipo: 'RECORD_CREATE',
      parametros: {},
      refs: [{ tipo: 'DATABASE', id: DATABASE }],
    };
    const r = revalidarAcao(
      criar,
      { recursoId: DATABASE },
      cardSnapshot({ pipeId: null, databaseId: DATABASE, lifecycleState: 'ACTIVE' }),
      principal(),
    );
    expect(r.exigeConfirmacaoHumana).toBe(false);
  });

  it('tipo desconhecido → ACAO_DESCONHECIDA (fail-closed)', () => {
    const a: Acao = { tipo: 'INEXISTENTE', parametros: {}, refs: [] };
    const r = revalidarAcao(a, { recursoId: CARD }, cardSnapshot(), principal());
    expect(r.permitido).toBe(false);
    expect(r.motivo).toBe('ACAO_DESCONHECIDA');
  });
});
