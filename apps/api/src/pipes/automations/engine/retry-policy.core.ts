/**
 * Núcleo PURO da política de RETRY/BACKOFF/TIMEOUT do motor (Story 4.6 — §1405/§1406). Sem I/O, sem Nest,
 * sem Prisma — testável sem banco, como os demais núcleos da 4.x. O serviço (`automation-engine.service.ts`)
 * o CONSOME para agendar a próxima tentativa e o prazo do lease; a política em si é uma função pura do número
 * da tentativa e do relógio recebido (nunca `Date.now()` embutido — determinismo/testabilidade).
 *
 * **Derivado do precedente, não inventado:** backoff exponencial com teto é o padrão canônico; os números
 * são conservadores e explícitos aqui (nada de mágica escondida). A 4.7 poderá revisá-los ("tentativas
 * máximas; timeout por Ação/Execução/cadeia" são gate DELA — §1435); a 4.6 fixa uma baseline segura.
 */

/** Máximo de tentativas de EXECUÇÃO antes do estado final explícito `FAILED`/`MAX_ATTEMPTS_EXCEEDED` (§1405). */
export const MAX_ATTEMPTS = 5;

/** Backoff base (ms) da 1ª retentativa. Cresce exponencialmente por tentativa até o teto. */
export const BASE_BACKOFF_MS = 1_000;

/** Teto do backoff (ms) — uma retentativa nunca é adiada além disto (evita fila parada por espera longa). */
export const BACKOFF_CAP_MS = 5 * 60_000;

/**
 * Duração do LEASE de processamento (ms). Enquanto uma Execução está `RUNNING`, seu `leaseExpiresAt` fica a
 * `LEASE_MS` no futuro; um crash deixa o lease vencer e o próximo drain reivindica (recuperação — §1406). É
 * o "timeout" da Execução: generoso o bastante para uma Ação lenta, curto o bastante para retomar rápido.
 */
export const LEASE_MS = 60_000;

/** Backoff (ms) da tentativa `attempt` (1-based): `BASE * 2^(attempt-1)`, com teto. `attempt<=0` ⇒ base. */
export function backoffMs(attempt: number): number {
  if (attempt <= 1) return BASE_BACKOFF_MS;
  const bruto = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return Math.min(bruto, BACKOFF_CAP_MS);
}

/** Instante da próxima tentativa a partir de um relógio recebido (puro — sem `Date.now()`). */
export function proximaTentativaEm(agora: Date, attempt: number): Date {
  return new Date(agora.getTime() + backoffMs(attempt));
}

/** Prazo do lease a partir de um relógio recebido. */
export function leaseAte(agora: Date): Date {
  return new Date(agora.getTime() + LEASE_MS);
}

/** A tentativa atual esgotou o limite? (`attempt >= MAX_ATTEMPTS`) — vira estado final explícito (§1405). */
export function esgotou(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}

/**
 * Classifica um erro de EXECUÇÃO como transitório (vale retry) ou final. Transitório = contenção de banco:
 * P2028 (timeout de transação interativa), P2034 (write conflict/deadlock), P1001/P1002 (conexão). Tudo o mais
 * é FINAL — uma recusa de domínio nunca chega aqui (ela é resultado de Ação `DENIED`, não exceção). Fail-closed:
 * na dúvida, FINAL (não insistir num erro que não vai passar sozinho é mais seguro que um loop de retry).
 */
const CODIGOS_TRANSITORIOS: ReadonlySet<string> = new Set([
  'P2028',
  'P2034',
  'P1001',
  'P1002',
  'P2024',
]);

export function ehErroTransitorio(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' && CODIGOS_TRANSITORIOS.has(code);
}
