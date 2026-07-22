import type { ActionResultState, ExecutionState } from './engine-types';

/**
 * Núcleo PURO da DEDUP e da at-least-once (Story 4.6 — §1402/§1403/§1410). Sem I/O. Encapsula duas decisões:
 *  1. dada uma Execução JÁ existente (dedup lógica por `eventId+automationId+versão`), o motor deve PROCESSAR,
 *     RETOMAR (crash) ou IGNORAR (terminal)?
 *  2. dada a lista de resultados de Ação JÁ gravados (dedup por índice), qual é a PRÓXIMA Ação a executar?
 *
 * **At-least-once, não exactly-once (§1400):** reprocessar o mesmo evento reencontra a mesma Execução; um
 * estado terminal ⇒ IGNORAR (nada repete). O único caminho que reexecuta é a retomada de um `RUNNING` órfão
 * (lease vencido), e mesmo essa só roda as Ações AINDA sem resultado — o dedup por índice garante "a mesma
 * Ação não roda 2×".
 */

/** O que fazer com uma Execução já materializada, a partir do seu estado + se o lease venceu. */
export type DecisaoProcessamento = 'PROCESSAR' | 'RETOMAR' | 'IGNORAR' | 'OCUPADA';

const TERMINAIS: ReadonlySet<ExecutionState> = new Set<ExecutionState>([
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'SKIPPED_CONDITIONS',
  'BLOCKED_CONFIRMATION',
]);

/**
 * Decide o processamento de uma Execução existente:
 *  · `PENDING` ⇒ `PROCESSAR` (1ª vez ou retentativa devida);
 *  · `RUNNING` + lease vencido ⇒ `RETOMAR` (recuperação de crash); lease vivo ⇒ `OCUPADA` (outro worker);
 *  · terminal ⇒ `IGNORAR` (at-least-once: já decidido, nada repete).
 */
export function decidirProcessamento(
  state: ExecutionState,
  leaseVencido: boolean,
): DecisaoProcessamento {
  if (TERMINAIS.has(state)) return 'IGNORAR';
  if (state === 'PENDING') return 'PROCESSAR';
  // RUNNING
  return leaseVencido ? 'RETOMAR' : 'OCUPADA';
}

/**
 * Índice da PRÓXIMA Ação a executar, dado o total de Ações e os índices JÁ gravados (em qualquer estado).
 * Retorna o menor índice `[0, total)` sem resultado; `null` se todas já têm resultado (nada a fazer). É o que
 * torna a retomada idempotente: uma Ação com resultado — inclusive `BLOCKED_PRIOR_FAILURE` — nunca reexecuta.
 */
export function proximaAcaoPendente(
  total: number,
  indicesGravados: ReadonlySet<number>,
): number | null {
  for (let i = 0; i < total; i++) {
    if (!indicesGravados.has(i)) return i;
  }
  return null;
}

/** Uma Ação cujo resultado ENCERRA a cadeia da Automação (as seguintes ficam `BLOCKED_PRIOR_FAILURE` — D4.2). */
const TERMINADORES_DE_CADEIA: ReadonlySet<ActionResultState> = new Set<ActionResultState>([
  'FAILED',
  'DENIED',
  'BLOCKED_CONFIRMATION',
]);

export function encerraCadeia(state: ActionResultState): boolean {
  return TERMINADORES_DE_CADEIA.has(state);
}
