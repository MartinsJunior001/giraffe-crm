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
 * Nesta Story não há dependências externas (banco/cache/fila), então é
 * temporariamente EQUIVALENTE ao liveness — equivalência documentada aqui e no
 * README. Ao surgir a 1ª dependência (Story 1.2+), este payload passa a refletir
 * a checagem real sem breaking change no contrato.
 */
export function readinessPayload(): HealthStatus {
  return { status: 'ok' };
}
