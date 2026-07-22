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
  | 'BLOCKED_CONFIRMATION';

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
  | 'PRIOR_ACTION_BLOCKED';
