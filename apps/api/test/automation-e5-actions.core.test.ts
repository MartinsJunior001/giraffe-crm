import { describe, expect, it } from 'vitest';
import type { Acao } from '../src/pipes/automations/automation-config';
import {
  AcaoForaDoCatalogoError,
  exigirAcoesNoCatalogo,
  obterAcaoCatalogo,
} from '../src/pipes/automations/actions/action-catalog';
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
 * Story 5.7 — núcleo PURO das Ações de E5 (Criar Tarefa/Solicitação, Enviar Notificação): resolução de alvo
 * determinístico, revalidação sob o principal (escopo/estado/não-ampliação) e validação de config fail-closed.
 * Sem banco — os invariantes de segurança vivem aqui e são provados em unidade, como `action-revalidation.core`.
 */

const ORG = 'org';
const PIPE = 'pipe-owner';
const PIPE_ALVO = 'pipe-alvo';
const CARD = 'card-1';
const TASK = 'task-1';
const REQUEST = 'request-1';

function contexto(parcial: Partial<ContextoEvento> = {}): ContextoEvento {
  return {
    cardId: null,
    recordId: null,
    taskId: null,
    requestId: null,
    linkedRecordIds: [],
    ...parcial,
  };
}

function principal(parcial: Partial<PrincipalAutomacao> = {}): PrincipalAutomacao {
  return {
    tipo: PRINCIPAL_AUTOMACAO,
    orgId: ORG,
    pipeId: PIPE,
    automationId: 'auto',
    automationVersionId: '1',
    recursosAutorizados: new Set([PIPE, PIPE_ALVO]),
    capacidades: new Set(['TASK_CREATE', 'REQUEST_CREATE', 'NOTIFICATION_SEND']),
    ...parcial,
  };
}

function pipeSnapshot(parcial: Partial<AlvoAcaoSnapshot> = {}): AlvoAcaoSnapshot {
  return {
    encontrado: true,
    orgId: ORG,
    pipeId: PIPE_ALVO,
    databaseId: null,
    lifecycleState: 'ACTIVE',
    ...parcial,
  };
}

const taskCreate: Acao = {
  tipo: 'TASK_CREATE',
  parametros: { title: 'x' },
  refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
};
const requestCreate: Acao = {
  tipo: 'REQUEST_CREATE',
  parametros: { title: 'x' },
  refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
};
const notify: Acao = {
  tipo: 'NOTIFICATION_SEND',
  parametros: { notificationType: 'CARD_MOVED_BY_AUTOMATION' },
  refs: [],
};

// ── Resolução de alvo determinístico ──────────────────────────────────────────────────────────────────

describe('resolução de alvo (E5)', () => {
  it('TASK_CREATE/REQUEST_CREATE resolvem para o Pipe alvo da referência', () => {
    expect(resolverAlvoDeterministico(taskCreate, contexto())).toEqual({ recursoId: PIPE_ALVO });
    expect(resolverAlvoDeterministico(requestCreate, contexto())).toEqual({ recursoId: PIPE_ALVO });
  });

  it('NOTIFICATION_SEND resolve para o ÚNICO recurso primário do Evento (Card XOR Tarefa XOR Solicitação)', () => {
    expect(resolverAlvoDeterministico(notify, contexto({ cardId: CARD }))).toEqual({
      recursoId: CARD,
    });
    expect(resolverAlvoDeterministico(notify, contexto({ taskId: TASK }))).toEqual({
      recursoId: TASK,
    });
    expect(resolverAlvoDeterministico(notify, contexto({ requestId: REQUEST }))).toEqual({
      recursoId: REQUEST,
    });
  });

  it('NOTIFICATION_SEND é fail-closed com ZERO ou MAIS DE UM recurso primário (ambíguo ⇒ nulo)', () => {
    expect(resolverAlvoDeterministico(notify, contexto())).toBeNull();
    expect(resolverAlvoDeterministico(notify, contexto({ cardId: CARD, taskId: TASK }))).toBeNull();
  });
});

// ── Revalidação sob o principal (escopo/estado/não-ampliação) ─────────────────────────────────────────

describe('revalidação (E5) — fail-closed, não-ampliação', () => {
  it('TASK_CREATE permitido no Pipe alvo em escopo e ACTIVE', () => {
    const alvo = resolverAlvoDeterministico(taskCreate, contexto());
    const r = revalidarAcao(taskCreate, alvo, pipeSnapshot(), principal());
    expect(r.permitido).toBe(true);
  });

  it('não-ampliação: SEM a capacidade explícita ⇒ SEM_CAPACIDADE (mesmo sendo tipo válido)', () => {
    const alvo = resolverAlvoDeterministico(taskCreate, contexto());
    const r = revalidarAcao(
      taskCreate,
      alvo,
      pipeSnapshot(),
      principal({ capacidades: new Set() }),
    );
    expect(r).toMatchObject({ permitido: false, motivo: 'SEM_CAPACIDADE' });
  });

  it('escopo restrito: Pipe alvo FORA da allowlist ⇒ FORA_DO_ESCOPO', () => {
    const acao: Acao = { ...taskCreate, refs: [{ tipo: 'PIPE', id: 'pipe-nao-autorizado' }] };
    const r = revalidarAcao(
      acao,
      { recursoId: 'pipe-nao-autorizado' },
      pipeSnapshot({ pipeId: 'pipe-nao-autorizado' }),
      principal(),
    );
    expect(r).toMatchObject({ permitido: false, motivo: 'FORA_DO_ESCOPO' });
  });

  it('Pipe alvo ARQUIVADO ⇒ ESTADO_INVALIDO; inexistente/cross-tenant ⇒ NAO_ENCONTRADO', () => {
    const alvo = resolverAlvoDeterministico(taskCreate, contexto());
    expect(
      revalidarAcao(taskCreate, alvo, pipeSnapshot({ lifecycleState: 'ARCHIVED' }), principal()),
    ).toMatchObject({ permitido: false, motivo: 'ESTADO_INVALIDO' });
    expect(
      revalidarAcao(taskCreate, alvo, pipeSnapshot({ encontrado: false }), principal()),
    ).toMatchObject({ permitido: false, motivo: 'NAO_ENCONTRADO' });
  });

  it('NOTIFICATION: recurso do Pipe PROPRIETÁRIO ⇒ permitido; de outro Pipe ⇒ FORA_DO_ESCOPO', () => {
    const alvo = resolverAlvoDeterministico(notify, contexto({ cardId: CARD }));
    // Recurso (Card) do Pipe proprietário do principal (`PIPE`).
    expect(
      revalidarAcao(
        notify,
        alvo,
        { encontrado: true, orgId: ORG, pipeId: PIPE, databaseId: null, lifecycleState: null },
        principal(),
      ).permitido,
    ).toBe(true);
    // Recurso de OUTRO Pipe (mesma Org) ⇒ fora do escopo.
    expect(
      revalidarAcao(
        notify,
        alvo,
        {
          encontrado: true,
          orgId: ORG,
          pipeId: 'outro-pipe',
          databaseId: null,
          lifecycleState: null,
        },
        principal(),
      ),
    ).toMatchObject({ permitido: false, motivo: 'FORA_DO_ESCOPO' });
  });
});

// ── Validação de config fail-closed (catálogo 4.5) ────────────────────────────────────────────────────

describe('validação de config (E5) — fail-closed', () => {
  const ok = (a: Acao) => expect(() => exigirAcoesNoCatalogo([a])).not.toThrow();
  const falha = (a: Acao) =>
    expect(() => exigirAcoesNoCatalogo([a])).toThrow(AcaoForaDoCatalogoError);

  it('TASK_CREATE: aceita config válida; rejeita título ausente, ref PIPE ausente, param forjado, prazo inválido', () => {
    ok(taskCreate);
    ok({
      tipo: 'TASK_CREATE',
      parametros: {
        title: 'x',
        description: 'y',
        dueInMinutes: 60,
        responsavelMembershipId: '11111111-1111-4111-8111-111111111111',
        vincularCardDoEvento: true,
      },
      refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
    });
    falha({ tipo: 'TASK_CREATE', parametros: {}, refs: [{ tipo: 'PIPE', id: PIPE_ALVO }] }); // sem título
    falha({ tipo: 'TASK_CREATE', parametros: { title: 'x' }, refs: [] }); // sem PIPE
    falha({
      tipo: 'TASK_CREATE',
      parametros: { title: 'x', forjado: 1 },
      refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
    }); // anti-mass-assignment
    falha({
      tipo: 'TASK_CREATE',
      parametros: { title: 'x', dueInMinutes: -5 },
      refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
    }); // prazo inválido
  });

  it('REQUEST_CREATE: aceita válido; rejeita parâmetro de prazo (não existe em Solicitação)', () => {
    ok(requestCreate);
    falha({
      tipo: 'REQUEST_CREATE',
      parametros: { title: 'x', dueInMinutes: 10 },
      refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
    });
  });

  it('NOTIFICATION_SEND: exige notificationType e NENHUMA ref', () => {
    ok(notify);
    falha({ tipo: 'NOTIFICATION_SEND', parametros: {}, refs: [] }); // sem tipo
    falha({
      tipo: 'NOTIFICATION_SEND',
      parametros: { notificationType: 'X' },
      refs: [{ tipo: 'PIPE', id: PIPE_ALVO }],
    }); // com ref proibida
  });

  it('todos os 3 tipos estão no catálogo com o domínio esperado', () => {
    expect(obterAcaoCatalogo('TASK_CREATE')?.dominio).toBe('PIPE');
    expect(obterAcaoCatalogo('REQUEST_CREATE')?.dominio).toBe('PIPE');
    expect(obterAcaoCatalogo('NOTIFICATION_SEND')?.dominio).toBe('NOTIFICATION');
  });
});
