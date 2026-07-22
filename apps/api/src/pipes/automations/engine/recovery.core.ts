import type { ExecutionState } from './engine-types';

/**
 * Núcleo PURO da RECUPERAÇÃO de jobs interrompidos (Story 4.6 — §1406, gate "recuperação de jobs
 * interrompidos"). Decide, sem I/O, se uma Execução é REIVINDICÁVEL pelo drain agora. O serviço aplica a
 * reivindicação com `FOR UPDATE SKIP LOCKED` + guarda otimista (`updateMany where leaseExpiresAt=<lido>`),
 * mas a DECISÃO é pura e testável sem banco.
 *
 * **O invariante que fecha "sem efeito duplo":** reivindicar uma Execução `RUNNING` de lease VENCIDO é seguro
 * porque o progresso vive por-Ação (`AutomationActionResult`, dedup por índice): a retomada pula as Ações já
 * concluídas. Um lease VIVO pertence a outro worker — não se toca (é o que impede dois workers no mesmo job).
 */

/** Lease vencido? Sem lease (`null`) conta como vencido — uma Execução PENDING não tem lease e é elegível. */
export function leaseVencido(agora: Date, leaseExpiresAt: Date | null): boolean {
  if (leaseExpiresAt === null) return true;
  return leaseExpiresAt.getTime() <= agora.getTime();
}

/** A próxima tentativa já é devida? Sem agendamento (`null`) conta como devida (1ª tentativa imediata). */
export function tentativaDevida(agora: Date, nextAttemptAt: Date | null): boolean {
  if (nextAttemptAt === null) return true;
  return nextAttemptAt.getTime() <= agora.getTime();
}

/**
 * Uma Execução é REIVINDICÁVEL pelo drain agora?
 *  · `PENDING` ⇒ sim, se a próxima tentativa já é devida (respeita o backoff).
 *  · `RUNNING` ⇒ sim, SÓ se o lease venceu (recuperação de crash); lease vivo = outro worker, não toca.
 *  · terminais (`SUCCEEDED`/`PARTIAL`/`FAILED`/`SKIPPED_CONDITIONS`/`BLOCKED_CONFIRMATION`) ⇒ não (decidido).
 */
export function ehReivindicavel(
  state: ExecutionState,
  agora: Date,
  nextAttemptAt: Date | null,
  leaseExpiresAt: Date | null,
): boolean {
  if (state === 'PENDING') return tentativaDevida(agora, nextAttemptAt);
  if (state === 'RUNNING') return leaseVencido(agora, leaseExpiresAt);
  return false;
}
