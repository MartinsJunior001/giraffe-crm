/**
 * Payloads de health/readiness — funções puras (testáveis sem DI/decorators).
 *
 * Contrato mínimo: exponha SOMENTE `{ status: 'ok' }`. Nada de versão completa,
 * variáveis, paths internos, hostname, segredo ou stack trace (AC2/AD-29).
 */
export type HealthStatus = { status: 'ok' };

/** Liveness: o processo está vivo. */
export function livenessPayload(): HealthStatus {
  return { status: 'ok' };
}

/**
 * Readiness: apto a receber tráfego. Semanticamente DISTINTO do liveness.
 *
 * A partir da Story 1.2 o readiness reflete a PRIMEIRA dependência externa real —
 * o banco. Quando o banco não responde, a API não está apta e o endpoint devolve
 * **503**, não 200: esconder indisponibilidade seria mentir sobre o estado.
 *
 * O contrato de PAYLOAD não mudou: continua sendo apenas `{ status: 'ok' }`, sem
 * campo extra. O erro do banco (que carrega host, porta e usuário) nunca aparece
 * na resposta — a indisponibilidade é comunicada pelo STATUS HTTP.
 */
export function readinessPayload(): HealthStatus {
  return { status: 'ok' };
}
