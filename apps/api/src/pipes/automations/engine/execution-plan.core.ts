import { encerraCadeia } from './engine-dedup.core';
import type { ActionResultState } from './engine-types';

/** Estados FINAIS que a avaliação das Ações pode produzir (nunca PENDING/RUNNING/SKIPPED_CONDITIONS). */
export type EstadoFinalExecucao = 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'BLOCKED_CONFIRMATION';

/**
 * Núcleo PURO de ORDEM e EFEITOS PARCIAIS (Story 4.6 — D4.2, §1407/§1411). Sem I/O. Decide, a partir dos
 * resultados por-Ação (na ordem configurada `entao`), o ESTADO FINAL da Execução — os estados honestos que a
 * 4.8 lerá. O serviço executa as Ações em ordem (parando no 1º terminador de cadeia) e chama estes helpers.
 *
 * **Regra de D4.2:** Ações de uma mesma Automação executam na ordem; ao FALHAR (ou ser RECUSADA, ou exigir
 * CONFIRMAÇÃO) uma Ação, as SEGUINTES daquela Automação NÃO executam (ficam `BLOCKED_PRIOR_FAILURE`); os
 * efeitos anteriores concluídos PERMANECEM (sem rollback entre Ações); a Execução indica sucesso PARCIAL.
 */

/**
 * Completa os estados de Ação até o total: os `executados` (na ordem, o último podendo ser um terminador de
 * cadeia) seguidos de `BLOCKED_PRIOR_FAILURE` para cada Ação NÃO alcançada. Total é `entao.length`.
 *
 * Ex.: 4 Ações, executados = [SUCCEEDED, FAILED] ⇒ [SUCCEEDED, FAILED, BLOCKED_PRIOR_FAILURE, BLOCKED_PRIOR_FAILURE].
 */
export function completarEstadosDeAcao(
  executados: readonly ActionResultState[],
  total: number,
): ActionResultState[] {
  const saida: ActionResultState[] = [...executados];
  while (saida.length < total) saida.push('BLOCKED_PRIOR_FAILURE');
  return saida.slice(0, total);
}

/**
 * Estado FINAL da Execução a partir dos estados de TODAS as Ações (comprimento = `entao.length`). Precedência
 * honesta (§1411), sabendo que há no máximo UM terminador de cadeia (o serviço para no 1º):
 *
 *  · nenhum terminador ⇒ todas `SUCCEEDED` ⇒ **`SUCCEEDED`**;
 *  · terminador `BLOCKED_CONFIRMATION` ⇒ **`BLOCKED_CONFIRMATION`** (§1383 — aguardando confirmação; efeitos
 *    anteriores permanecem e aparecem por-Ação; o motor não mantém job aberto);
 *  · terminador `FAILED`/`DENIED` ⇒ **`PARTIAL`** se alguma Ação anterior teve sucesso, senão **`FAILED`**.
 *
 * `todos` vazio nunca ocorre (`entao` é não-vazio, 4.1). Fail-closed: um estado inesperado cai em `FAILED`.
 */
export function estadoFinalDaExecucao(todos: readonly ActionResultState[]): EstadoFinalExecucao {
  if (todos.length === 0) return 'FAILED';
  const houveSucesso = todos.some((s) => s === 'SUCCEEDED');
  const terminador = todos.find((s) => encerraCadeia(s));

  if (terminador === undefined) return 'SUCCEEDED';
  if (terminador === 'BLOCKED_CONFIRMATION') return 'BLOCKED_CONFIRMATION';
  // FAILED ou DENIED
  return houveSucesso ? 'PARTIAL' : 'FAILED';
}
