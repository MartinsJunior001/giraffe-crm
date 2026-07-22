import { describe, expect, it } from 'vitest';
import {
  decidirProcessamento,
  encerraCadeia,
  proximaAcaoPendente,
} from '../src/pipes/automations/engine/engine-dedup.core';
import {
  completarEstadosDeAcao,
  estadoFinalDaExecucao,
} from '../src/pipes/automations/engine/execution-plan.core';
import {
  ehReivindicavel,
  leaseVencido,
  tentativaDevida,
} from '../src/pipes/automations/engine/recovery.core';
import {
  BACKOFF_CAP_MS,
  BASE_BACKOFF_MS,
  MAX_ATTEMPTS,
  backoffMs,
  ehErroTransitorio,
  esgotou,
  leaseAte,
  proximaTentativaEm,
} from '../src/pipes/automations/engine/retry-policy.core';
import type { ActionResultState } from '../src/pipes/automations/engine/engine-types';

/**
 * Testes de UNIDADE dos núcleos PUROS do motor (Story 4.6) — rodam SEM banco, provando os invariantes de
 * dedup/at-least-once, ordem/efeitos parciais, backoff e recuperação de job interrompido. A execução real
 * sob RLS é provada nos testes de integração (`automation-engine-*.test.ts`).
 */

describe('engine-dedup.core — at-least-once e dedup', () => {
  it('IGNORA Execução em qualquer estado terminal (não reprocessa — §1400/§1410)', () => {
    for (const s of [
      'SUCCEEDED',
      'PARTIAL',
      'FAILED',
      'SKIPPED_CONDITIONS',
      'BLOCKED_CONFIRMATION',
    ] as const) {
      expect(decidirProcessamento(s, true)).toBe('IGNORAR');
      expect(decidirProcessamento(s, false)).toBe('IGNORAR');
    }
  });

  it('PROCESSA PENDING; RETOMA RUNNING órfão (lease vencido); OCUPADA se lease vivo (§1406)', () => {
    expect(decidirProcessamento('PENDING', true)).toBe('PROCESSAR');
    expect(decidirProcessamento('RUNNING', true)).toBe('RETOMAR');
    expect(decidirProcessamento('RUNNING', false)).toBe('OCUPADA');
  });

  it('proximaAcaoPendente pula índices JÁ gravados — "a mesma Ação não roda 2×" (§1403)', () => {
    expect(proximaAcaoPendente(3, new Set())).toBe(0);
    expect(proximaAcaoPendente(3, new Set([0]))).toBe(1);
    expect(proximaAcaoPendente(3, new Set([0, 1, 2]))).toBeNull();
    // Retomada de crash: Ação 0 concluída, 1 é a próxima — 0 nunca reexecuta.
    expect(proximaAcaoPendente(3, new Set([0]))).toBe(1);
  });

  it('encerraCadeia só para FAILED/DENIED/BLOCKED_CONFIRMATION (D4.2)', () => {
    expect(encerraCadeia('SUCCEEDED')).toBe(false);
    expect(encerraCadeia('FAILED')).toBe(true);
    expect(encerraCadeia('DENIED')).toBe(true);
    expect(encerraCadeia('BLOCKED_CONFIRMATION')).toBe(true);
    expect(encerraCadeia('BLOCKED_PRIOR_FAILURE')).toBe(false);
  });
});

describe('execution-plan.core — ordem e efeitos parciais (D4.2/§1407/§1411)', () => {
  it('completa as Ações não alcançadas como BLOCKED_PRIOR_FAILURE', () => {
    const r = completarEstadosDeAcao(['SUCCEEDED', 'FAILED'] as ActionResultState[], 4);
    expect(r).toEqual(['SUCCEEDED', 'FAILED', 'BLOCKED_PRIOR_FAILURE', 'BLOCKED_PRIOR_FAILURE']);
  });

  it('todas SUCCEEDED ⇒ SUCCEEDED', () => {
    expect(estadoFinalDaExecucao(['SUCCEEDED', 'SUCCEEDED'])).toBe('SUCCEEDED');
  });

  it('sucesso antes de FALHA ⇒ PARTIAL; falha na 1ª ⇒ FAILED (sem sucesso)', () => {
    expect(estadoFinalDaExecucao(['SUCCEEDED', 'FAILED', 'BLOCKED_PRIOR_FAILURE'])).toBe('PARTIAL');
    expect(estadoFinalDaExecucao(['FAILED', 'BLOCKED_PRIOR_FAILURE'])).toBe('FAILED');
    expect(estadoFinalDaExecucao(['DENIED'])).toBe('FAILED');
    expect(estadoFinalDaExecucao(['SUCCEEDED', 'DENIED'])).toBe('PARTIAL');
  });

  it('terminador de confirmação ⇒ BLOCKED_CONFIRMATION (L-1/§1383)', () => {
    expect(estadoFinalDaExecucao(['BLOCKED_CONFIRMATION', 'BLOCKED_PRIOR_FAILURE'])).toBe(
      'BLOCKED_CONFIRMATION',
    );
    expect(estadoFinalDaExecucao(['SUCCEEDED', 'BLOCKED_CONFIRMATION'])).toBe(
      'BLOCKED_CONFIRMATION',
    );
  });
});

describe('retry-policy.core — backoff/esgotamento/classificação', () => {
  it('backoff cresce exponencialmente e respeita o teto', () => {
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2);
    expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4);
    expect(backoffMs(100)).toBe(BACKOFF_CAP_MS);
  });

  it('proximaTentativaEm/leaseAte são puros (usam o relógio recebido)', () => {
    const agora = new Date('2026-07-22T00:00:00.000Z');
    expect(proximaTentativaEm(agora, 1).getTime()).toBe(agora.getTime() + BASE_BACKOFF_MS);
    expect(leaseAte(agora).getTime()).toBeGreaterThan(agora.getTime());
  });

  it('esgotou em MAX_ATTEMPTS', () => {
    expect(esgotou(MAX_ATTEMPTS - 1)).toBe(false);
    expect(esgotou(MAX_ATTEMPTS)).toBe(true);
  });

  it('classifica só contenção de banco como transitório; recusa de domínio não é erro aqui', () => {
    expect(ehErroTransitorio({ code: 'P2028' })).toBe(true);
    expect(ehErroTransitorio({ code: 'P2034' })).toBe(true);
    expect(ehErroTransitorio({ code: 'P2002' })).toBe(false);
    expect(ehErroTransitorio(new Error('qualquer'))).toBe(false);
    expect(ehErroTransitorio(null)).toBe(false);
  });
});

describe('recovery.core — recuperação de job interrompido (§1406)', () => {
  const agora = new Date('2026-07-22T12:00:00.000Z');
  const passado = new Date(agora.getTime() - 1);
  const futuro = new Date(agora.getTime() + 60_000);

  it('lease null ou vencido ⇒ vencido; lease futuro ⇒ vivo', () => {
    expect(leaseVencido(agora, null)).toBe(true);
    expect(leaseVencido(agora, passado)).toBe(true);
    expect(leaseVencido(agora, futuro)).toBe(false);
  });

  it('tentativa devida quando null ou no passado', () => {
    expect(tentativaDevida(agora, null)).toBe(true);
    expect(tentativaDevida(agora, passado)).toBe(true);
    expect(tentativaDevida(agora, futuro)).toBe(false);
  });

  it('reivindicável: PENDING devido; RUNNING só com lease vencido; terminal nunca', () => {
    expect(ehReivindicavel('PENDING', agora, null, null)).toBe(true);
    expect(ehReivindicavel('PENDING', agora, futuro, null)).toBe(false); // aguardando backoff
    expect(ehReivindicavel('RUNNING', agora, null, passado)).toBe(true); // crash — lease vencido
    expect(ehReivindicavel('RUNNING', agora, null, futuro)).toBe(false); // outro worker
    expect(ehReivindicavel('SUCCEEDED', agora, null, null)).toBe(false);
    expect(ehReivindicavel('BLOCKED_CONFIRMATION', agora, null, null)).toBe(false);
  });
});
