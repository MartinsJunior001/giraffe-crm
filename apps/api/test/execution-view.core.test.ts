import { describe, expect, it } from 'vitest';
import {
  type ExecucaoBruta,
  type ExecutionState,
  avaliacaoCondicoes,
  duracaoMs,
  motivoLegivel,
  projetarCadeia,
  projetarExecucao,
  projetarResultadoAcao,
} from '../src/pipes/automations/executions/execution-view';

/**
 * Provas PURAS do núcleo da Trilha de Execuções (Story 4.8) — projeção allowlist e derivações, SEM banco.
 * A sanitização (AD-30) vive aqui e é testável sem infra: só a allowlist sai, e o mascaramento não vaza alvo.
 */

const EXEC_BASE: ExecucaoBruta = {
  id: 'exec-1',
  eventId: 'evt-1',
  automationId: 'auto-1',
  automationVersionId: 3,
  configSnapshotRevision: 'rev-abc',
  state: 'SUCCEEDED',
  attempt: 1,
  startedAt: new Date('2026-07-20T10:00:00.000Z'),
  finishedAt: new Date('2026-07-20T10:00:02.500Z'),
  initiatorType: 'HUMANO',
  initiatorAccountId: 'acc-1',
  initiatorAutomationId: null,
  correlationId: 'corr-1',
  executionChainId: 'chain-1',
  chainDepth: 0,
  lastErrorCode: null,
  createdAt: new Date('2026-07-20T10:00:00.000Z'),
};

describe('avaliacaoCondicoes — agregado honesto e distinto (D6)', () => {
  it.each<[ExecutionState, string]>([
    ['SKIPPED_CONDITIONS', 'NAO_SATISFEITA'],
    ['SUCCEEDED', 'SATISFEITA'],
    ['PARTIAL', 'SATISFEITA'],
    ['FAILED', 'SATISFEITA'],
    ['BLOCKED_CONFIRMATION', 'SATISFEITA'],
    ['PENDING', 'PENDENTE'],
    ['RUNNING', 'PENDENTE'],
    ['HALTED_BY_LIMIT', 'NAO_AVALIADA'],
  ])('%s → %s', (state, esperado) => {
    expect(avaliacaoCondicoes(state)).toBe(esperado);
  });
});

describe('motivoLegivel — mapa estático, fail-closed no eco', () => {
  it('mapeia códigos conhecidos', () => {
    expect(motivoLegivel('CONDITION_NOT_MET')).toBe('Condições não satisfeitas');
    expect(motivoLegivel('DEPTH_EXCEEDED')).toBe('Limite de profundidade de encadeamento atingido');
    expect(motivoLegivel('CYCLE_DETECTED')).toBe('Ciclo de automação detectado');
    expect(motivoLegivel('CHAIN_TIMEOUT')).toBe('Tempo máximo da cadeia excedido');
    expect(motivoLegivel('PRIOR_ACTION_BLOCKED')).toBe('Ação anterior falhou ou foi bloqueada');
  });
  it('código válido não mapeado → rótulo genérico preservando o código', () => {
    expect(motivoLegivel('ALGUM_CODIGO_NOVO')).toBe('Falha (código: ALGUM_CODIGO_NOVO)');
  });
  it('null/vazio → null', () => {
    expect(motivoLegivel(null)).toBeNull();
    expect(motivoLegivel(undefined)).toBeNull();
    expect(motivoLegivel('')).toBeNull();
  });
  it('NÃO ecoa nada que não seja enum estrutural (defesa AD-30)', () => {
    expect(motivoLegivel('erro: senha=abc123')).toBeNull();
    expect(motivoLegivel('<script>')).toBeNull();
    expect(motivoLegivel('mixedCase')).toBeNull();
  });
});

describe('duracaoMs', () => {
  it('calcula quando início e fim presentes', () => {
    expect(duracaoMs(new Date('2026-07-20T10:00:00Z'), new Date('2026-07-20T10:00:02.5Z'))).toBe(
      2500,
    );
  });
  it('null se falta início ou fim', () => {
    expect(duracaoMs(null, new Date())).toBeNull();
    expect(duracaoMs(new Date(), null)).toBeNull();
  });
  it('não inventa duração negativa (relógio inconsistente)', () => {
    expect(
      duracaoMs(new Date('2026-07-20T10:00:05Z'), new Date('2026-07-20T10:00:00Z')),
    ).toBeNull();
  });
});

describe('projetarExecucao — allowlist, sem campos internos', () => {
  it('projeta o conjunto mínimo e NÃO inclui orgId nem colunas internas', () => {
    const v = projetarExecucao(
      EXEC_BASE,
      {
        eventType: 'CARD_CREATED',
        origin: 'SUBMISSION',
        resourceType: 'CARD',
        resourceId: 'card-1',
      },
      'Minha Automação',
    );
    expect(v.executionId).toBe('exec-1');
    expect(v.automation).toEqual({
      id: 'auto-1',
      name: 'Minha Automação',
      versao: 3,
      revision: 'rev-abc',
    });
    expect(v.evento).toEqual({
      eventId: 'evt-1',
      tipo: 'CARD_CREATED',
      origem: 'SUBMISSION',
      recursoPrincipal: { tipo: 'CARD', id: 'card-1' },
    });
    expect(v.avaliacaoCondicoes).toBe('SATISFEITA');
    expect(v.duracaoMs).toBe(2500);
    expect(v.iniciador).toEqual({ tipo: 'HUMANO', accountId: 'acc-1', automationId: null });
    // Fronteira: nenhum campo interno vaza.
    const chaves = Object.keys(v);
    expect(chaves).not.toContain('orgId');
    expect(chaves).not.toContain('leaseOwner');
    expect(chaves).not.toContain('nextAttemptAt');
    expect(chaves).not.toContain('configSnapshot');
    expect(chaves).not.toContain('payload');
  });

  it('evento ausente (expurgado) → recursoPrincipal null, sem quebrar', () => {
    const v = projetarExecucao(
      { ...EXEC_BASE, state: 'HALTED_BY_LIMIT', lastErrorCode: 'DEPTH_EXCEEDED' },
      null,
      null,
    );
    expect(v.evento.recursoPrincipal).toBeNull();
    expect(v.evento.tipo).toBeNull();
    expect(v.motivoLegivel).toBe('Limite de profundidade de encadeamento atingido');
    expect(v.avaliacaoCondicoes).toBe('NAO_AVALIADA');
  });
});

describe('projetarResultadoAcao — mascaramento §1447', () => {
  it('gerenciar/acesso → alvo exposto, sem marca de restrição', () => {
    const v = projetarResultadoAcao(
      {
        actionIndex: 0,
        actionType: 'CARD_FINALIZE',
        state: 'SUCCEEDED',
        errorCode: null,
        targetResourceId: 'card-9',
      },
      () => true,
    );
    expect(v.targetResourceId).toBe('card-9');
    expect(v.referenciaRestrita).toBe(false);
  });
  it('alvo inacessível → MASCARADO (null + referenciaRestrita), sem revelar existência/conteúdo', () => {
    const v = projetarResultadoAcao(
      {
        actionIndex: 1,
        actionType: 'RECORD_CREATE',
        state: 'SUCCEEDED',
        errorCode: null,
        targetResourceId: 'rec-alheio',
      },
      () => false,
    );
    expect(v.targetResourceId).toBeNull();
    expect(v.referenciaRestrita).toBe(true);
  });
  it('sem alvo → não marca restrição', () => {
    const v = projetarResultadoAcao(
      {
        actionIndex: 2,
        actionType: 'CARD_FINALIZE',
        state: 'FAILED',
        errorCode: 'EXECUTOR_ERROR',
        targetResourceId: null,
      },
      () => false,
    );
    expect(v.targetResourceId).toBeNull();
    expect(v.referenciaRestrita).toBe(false);
    expect(v.motivoLegivel).toBe('Falha ao executar a ação');
  });
});

describe('projetarCadeia — identidade + interrupção, sem árvore', () => {
  it('HALTED_BY_LIMIT expõe a causa', () => {
    const c = projetarCadeia({
      ...EXEC_BASE,
      state: 'HALTED_BY_LIMIT',
      lastErrorCode: 'CYCLE_DETECTED',
      chainDepth: 4,
    });
    expect(c).toEqual({
      executionChainId: 'chain-1',
      chainDepth: 4,
      interrompidaPorLimite: true,
      motivoLegivel: 'Ciclo de automação detectado',
    });
  });
  it('execução normal não afirma interrupção', () => {
    const c = projetarCadeia(EXEC_BASE);
    expect(c.interrompidaPorLimite).toBe(false);
    expect(c.motivoLegivel).toBeNull();
  });
});
