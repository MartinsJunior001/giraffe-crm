import type { MotivoRecusa } from '../actions/action-revalidation.core';

/**
 * Tipos do MOTOR de disparo (Story 4.6). Espelham os enums do schema (`AutomationExecutionState`/
 * `AutomationActionResultState`) em TEXTO, para que os núcleos puros do motor sejam testáveis sem Prisma —
 * o mesmo desenho de `card-lifecycle.transitions.ts` (2.11), que decide a transição em memória e o serviço
 * a aplica. Nenhum destes tipos toca banco.
 *
 * **Estados HONESTOS (§1411, UX-DR6):** cada estado nomeia um desfecho distinto que a trilha da 4.8 lerá —
 * não há um estado "erro genérico" que esconda por quê. `errorCode` é SEMPRE um enum estrutural sanitizado
 * (AD-30): nunca um id, um `valor` (possível PII) ou uma stack.
 */

/** Estado da Execução lógica (espelha `AutomationExecutionState`). */
export type ExecutionState =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED_CONDITIONS'
  | 'BLOCKED_CONFIRMATION'
  // Story 4.7 — Execução BARRADA por um limite de encadeamento (profundidade/ciclo/timeout da cadeia). Estado
  // TERMINAL e HONESTO (§1432, UX-DR6 — "interrompida por limite"): dead-letter auditável, não reivindicável,
  // sem loop silencioso. O `lastErrorCode` distingue o motivo (DEPTH_EXCEEDED/CYCLE_DETECTED/CHAIN_TIMEOUT).
  | 'HALTED_BY_LIMIT';

/** Estado do resultado de UMA Ação (espelha `AutomationActionResultState`). */
export type ActionResultState =
  'SUCCEEDED' | 'FAILED' | 'DENIED' | 'BLOCKED_CONFIRMATION' | 'BLOCKED_PRIOR_FAILURE';

/**
 * Códigos de erro/recusa SANITIZADOS (AD-30). Reusa os motivos de recusa da revalidação (4.5) e acrescenta os
 * do motor. NUNCA carrega id/valor/stack — é o que a Execução grava em `lastErrorCode`/`errorCode` e o que a
 * 4.8 exibe. `TRANSIENT_CONFLICT`/`EXECUTOR_ERROR` são falhas de EXECUÇÃO (podem sofrer retry); os demais são
 * recusas de domínio (terminais para a Ação).
 */
export type ErrorCode =
  | MotivoRecusa
  | 'CONDITION_NOT_MET'
  | 'TRANSIENT_CONFLICT'
  | 'EXECUTOR_ERROR'
  | 'MAX_ATTEMPTS_EXCEEDED'
  | 'REQUIRES_CONFIRMATION'
  | 'PRIOR_ACTION_BLOCKED'
  // Story 4.7 — motivos SANITIZADOS de BARREIRA de encadeamento (prevenção de ciclos/estouro — NFR-7/AD-18).
  | 'DEPTH_EXCEEDED'
  | 'CYCLE_DETECTED'
  | 'CHAIN_TIMEOUT'
  | 'ACTION_TIMEOUT'
  | 'EXECUTION_TIMEOUT';
