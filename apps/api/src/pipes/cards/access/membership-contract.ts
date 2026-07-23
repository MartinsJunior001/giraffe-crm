/**
 * Contrato de Membership × Card (Story 2.10, D-OA3) — funções PURAS, sem chamador ainda.
 *
 * A materialização é deliberada e coerente com a AD-11 e com a 2.7 (travas escritas como "contrato futuro"): o
 * Épico 8 (ciclo de Membership) consumirá estas funções quando existir. **NÃO** implementam o ciclo E8 nem tocam
 * o banco — recebem o estado corrente como DADO e devolvem a decisão/plano. Assim são testáveis sem PostgreSQL e
 * a regra vive num único lugar quando E8 chegar.
 *
 * Por que puras e não um serviço: não há consumidor concreto (E8 não existe). Um serviço com queries seria
 * abstração especulativa (Constitution) — e a regra "Card exige Responsável ativo" **não existe** para Card na
 * Fase 1 (D5.2 é de Tarefa/Solicitação, não de Card). Materializamos o CONTRATO (forma + invariantes), não a
 * regra inexistente. NÃO inventar a regra.
 */

/** Estados de Membership que o contrato distingue. Encerrar/suspender desfaz acesso; reativar NÃO restaura. */
export type EstadoMembership = 'ACTIVE' | 'SUSPENDED' | 'REMOVED';

/**
 * Entrada do preflight de encerramento: os Cards em que a Membership é Responsável atual. Existe para a forma do
 * contrato — o dia em que houver a regra "Card exige Responsável ativo", ela decidirá aqui a partir deste dado.
 */
export interface PreflightEntrada {
  responsavelDe: readonly string[];
}

/** Resultado do preflight: os Cards que IMPEDEM o encerramento. Vazio hoje (regra inexistente para Card). */
export interface PreflightResultado {
  bloqueios: readonly string[];
}

/**
 * A regra "Card exige Responsável ativo" **não existe** para Card na Fase 1 (D5.2 é de Tarefa/Solicitação, não de
 * Card — DIV-3). Enquanto for `false`, nenhum Card bloqueia o encerramento. Este é o ÚNICO ponto de ativação:
 * virar `true` (quando a regra existir de fato) já faz o preflight listar os Cards impeditivos. NÃO inventar a
 * regra ligando isto sem a decisão de produto.
 */
const REGRA_CARD_EXIGE_RESPONSAVEL_ATIVO = false;

/**
 * Preflight do encerramento de uma Membership (SC-2106). Hoje **vacuamente verdadeiro**: retorna `bloqueios: []`
 * porque a regra está desligada. Quando ligada, bloquearia com os Cards em que a pessoa é Responsável atual —
 * sem tocar em nenhum outro ponto do sistema.
 */
export function preflightEncerramentoMembership(entrada: PreflightEntrada): PreflightResultado {
  if (!REGRA_CARD_EXIGE_RESPONSAVEL_ATIVO) return { bloqueios: [] };
  return { bloqueios: [...entrada.responsavelDe] };
}

/** Estado corrente da Membership relevante à alteração: suas concessões e atribuições ativas. */
export interface AlteracaoEntrada {
  novoEstado: EstadoMembership;
  /** `CardGrant` ativos da Membership (ids). */
  grantsAtivos: readonly string[];
  /** Cards em que a Membership é Responsável atual (cardIds). */
  responsavelDe: readonly string[];
  /**
   * Tarefas (Story 5.1) em que a Membership é Responsável atual (taskIds). O Responsável da Tarefa é uma
   * referência-por-id a uma Membership ATIVA; suspender/remover a Membership deve ESVAZIAR essa referência
   * (senão restaria uma referência operacional inválida — §1525). Opcional para compatibilidade com chamadores
   * anteriores à 5.1 (default vazio ⇒ nada a esvaziar).
   */
  taskResponsavelDe?: readonly string[];
  /**
   * Solicitações (Story 5.2) em que a Membership é Responsável atual (solicitacaoIds). Análogo à Tarefa: o
   * Responsável é referência-por-id a uma Membership ATIVA; suspender/remover a Membership deve ESVAZIAR essa
   * referência (§1546). Opcional para compatibilidade com chamadores anteriores à 5.2 (default vazio).
   */
  requestResponsavelDe?: readonly string[];
}

/** Plano de reconciliação: o que E8 deve efetivar. NÃO executa — descreve. */
export interface AlteracaoPlano {
  /** `CardGrant` a revogar (`state → REVOKED`). */
  revogarGrants: readonly string[];
  /** Cards cuja atribuição de Responsável deve ser removida (`state → REMOVED`), por cardId. */
  removerResponsavelDe: readonly string[];
  /** Tarefas (Story 5.1) cujo Responsável deve ser esvaziado (`responsavelMembershipId → null`), por taskId. */
  removerTaskResponsavelDe: readonly string[];
  /** Solicitações (Story 5.2) cujo Responsável deve ser esvaziado (`→ null`), por solicitacaoId. */
  removerRequestResponsavelDe: readonly string[];
  /** Cards/Tarefas/Solicitações que ficaram SEM Responsável e precisam de reatribuição — SINALIZAÇÃO, não ação automática. */
  reatribuir: readonly string[];
}

/**
 * Handler pós-alteração de Membership (SC-2107/2108). Encerrar/suspender **revoga** as concessões diretas e
 * **remove** as atribuições de Responsável da pessoa, e sinaliza reatribuição dos Cards que ficaram órfãos.
 * Reativar (`→ ACTIVE`) **não restaura nada**: acesso perdido é reconcedido explicitamente, nunca ressuscitado —
 * do contrário reativar uma Membership devolveria silenciosamente acessos que um Admin revogou de propósito.
 *
 * `creator` é **preservado por construção**: ele não é uma concessão (é o `actorId` do evento `CREATED` da 2.7),
 * então não aparece em `revogarGrants`/`removerResponsavelDe` — a autoria histórica do Card nunca é reescrita.
 */
export function aoAlterarMembership(entrada: AlteracaoEntrada): AlteracaoPlano {
  if (entrada.novoEstado === 'ACTIVE') {
    return {
      revogarGrants: [],
      removerResponsavelDe: [],
      removerTaskResponsavelDe: [],
      removerRequestResponsavelDe: [],
      reatribuir: [],
    };
  }
  const tarefas = entrada.taskResponsavelDe ?? [];
  const solicitacoes = entrada.requestResponsavelDe ?? [];
  return {
    revogarGrants: [...entrada.grantsAtivos],
    removerResponsavelDe: [...entrada.responsavelDe],
    removerTaskResponsavelDe: [...tarefas],
    removerRequestResponsavelDe: [...solicitacoes],
    // Sinalização de reatribuição: Cards, Tarefas E Solicitações órfãos (§1525/§1546 — reatribuir OU esvaziar).
    reatribuir: [...entrada.responsavelDe, ...tarefas, ...solicitacoes],
  };
}
