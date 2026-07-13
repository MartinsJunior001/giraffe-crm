/**
 * CONTRATO de propagação do contexto de Organização para fora do caminho síncrono HTTP→banco
 * (AD-8). Isto é um **tipo e uma regra** — não há fila, worker, cache ou barramento nesta Story,
 * e não pode haver: a Constitution proíbe abstração especulativa sem consumidor concreto, e o
 * épico é explícito de que "só o contrato" pertence à Story 1.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * A REGRA (vale a partir do primeiro canal assíncrono que existir):
 *
 *   1. Nenhum trabalho é ENFILEIRADO sem um `TenantEnvelope`.
 *   2. Nenhum worker EXECUTA sem reidratar o envelope num escopo de contexto
 *      (`RequestContext.executarNoEscopo` + `definir`), exatamente como o guard faz no HTTP.
 *   3. O envelope é resolvido no SERVIDOR, no momento em que o trabalho é criado, a partir do
 *      contexto já validado. Ele nunca é montado a partir de dado que veio do cliente.
 *   4. Um envelope ausente ou inválido faz o trabalho **falhar** — nunca rodar "sem contexto".
 *      Job sem contexto é job que, no melhor caso, não vê nada, e no pior vê tudo.
 *
 * POR QUE ISTO EXISTE ANTES DE EXISTIR UMA FILA: porque o vazamento de tenant fora do caminho
 * síncrono é justamente o que o AD-8 previne, e a hora de decidir o formato é antes de haver
 * cinco produtores de mensagem, cada um inventando o seu. A RLS não protege um worker que roda
 * sem contexto: ela nega tudo — e a reação natural de quem está com pressa é rodar o worker com
 * um papel privilegiado. É assim que o isolamento morre.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export interface TenantEnvelope {
  /** Organização do trabalho. Resolvida no servidor, nunca recebida do cliente. */
  readonly orgId: string;

  /** Conta que originou o trabalho. `null` quando a origem é a própria plataforma (ex.: rotina). */
  readonly accountId: string | null;

  /**
   * Correlaciona o trabalho assíncrono com a requisição que o originou. Sem isto, um job que
   * falha três saltos adiante é impossível de ligar à causa — e a investigação de um incidente
   * de isolamento vira arqueologia.
   */
  readonly correlationId: string;
}
