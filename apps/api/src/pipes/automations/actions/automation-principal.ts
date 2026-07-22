/**
 * Contrato do PRINCIPAL AUTOMAÇÃO (Story 4.5 — RN-101; AD-9, AD-18). Puro, sem framework/banco — o TIPO e as
 * decisões de escopo são testáveis sem PostgreSQL, como os demais núcleos da 4.x.
 *
 * **O ponto de RISCO ALTO desta Story.** A Automação é um **principal interno próprio** — NÃO impersona
 * permanentemente o criador. Este módulo materializa, por DERIVAÇÃO da Architecture Spine (sem inventar
 * autorização nova):
 *
 *  · **AD-9** — "Principais: usuário autenticado, processo/job, **Automação**, serviço de Plataforma — cada um
 *    carrega **Organização, ator/origem e permissões**." A Automação é um principal de primeira classe; carrega a
 *    própria Organização e as próprias permissões, deny-by-default.
 *  · **AD-18** — "Principal Automação tem **capacidades explícitas deny-by-default**; **não herda indefinidamente
 *    as permissões do criador**; a definição é **versionada** e a execução **registra a versão usada**." E: "ao
 *    executar, revalidar no servidor Organização, Automação ativa, versão, **permissões do principal e existência
 *    dos recursos** (não confiar no payload)."
 *  · **AD-13 / Auditoria (AD-16)** — evento/trilha carregam `Organização, ator/origem, correlação`. A mudança
 *    original preserva **quem a iniciou** (Story §1384).
 *
 * **Escopo RESTRITO (não acesso amplo — Story §1384):** o principal alcança APENAS a própria Organização, o Pipe
 * proprietário da Automação e os **recursos configurados** (as referências da configuração + o Pipe). Um recurso
 * fora dessa allowlist é inalcançável — mesmo que o criador, como pessoa, pudesse alcançá-lo. **O escopo é do
 * principal, não do criador**: é isto que impede a "ampliação de poder" (Story §1389; provado em `revalidarAcao`).
 *
 * **Três papéis DISTINTOS na trilha (Story §1384):**
 *  · **ator** — quem EXECUTA a Ação agora: o principal Automação (a mutação é feita pela Automação, não pelo
 *    criador nem pelo ator do Evento).
 *  · **iniciador** — quem INICIOU a mudança ORIGINAL que emitiu o Evento gatilho (tipicamente um humano). É
 *    PRESERVADO ao longo da cadeia — a Automação não apaga "por conta de quem" a reação começou.
 *  · **principal** — a DEFINIÇÃO versionada que disparou: `automationId` + `automationVersionId` (AD-18 — a
 *    execução registra a versão usada). Responde "qual regra agiu".
 *
 * A 4.5 entrega o CONTRATO (tipo + funções puras de escopo/capacidade + montagem da trilha). Quem CONSTRÓI um
 * `PrincipalAutomacao` concreto — a partir da Automação ativa, da sua versão e das referências validadas, sob
 * `withTenantContext` — é o motor (4.6, AD-11). Aqui nada toca banco.
 */

/** Discriminante do principal Automação, distinto dos demais principais (usuário/job/Plataforma) do AD-9. */
export const PRINCIPAL_AUTOMACAO = 'AUTOMACAO' as const;

/**
 * O principal interno da Automação, com escopo RESTRITO e capacidades EXPLÍCITAS (deny-by-default).
 *
 * `recursosAutorizados` e `capacidades` são allowlists FECHADAS: o que não está nelas é negado. Elas são
 * derivadas da DEFINIÇÃO VERSIONADA da Automação (as referências configuradas + os tipos de Ação do `entao`),
 * NÃO das permissões da pessoa que a criou — encapsulando "não herda as permissões do criador" (AD-18).
 */
export interface PrincipalAutomacao {
  readonly tipo: typeof PRINCIPAL_AUTOMACAO;
  /** Organização do principal. A revalidação NUNCA alcança recurso de outra Org (fail-closed). */
  readonly orgId: string;
  /** Pipe proprietário da Automação (RN-100). Ações de Card alcançam apenas Cards deste Pipe. */
  readonly pipeId: string;
  /** Identidade estável da Automação (4.1). */
  readonly automationId: string;
  /** Versão da definição em execução (AD-18 — a execução registra a versão usada). */
  readonly automationVersionId: string;
  /**
   * IDs dos RECURSOS configurados que o principal pode alcançar (allowlist; deny-by-default). Derivado das
   * referências validadas da configuração (`extrairReferencias`, 4.1) + o `pipeId`. Um recurso fora daqui é
   * inalcançável — a fronteira do escopo restrito.
   */
  readonly recursosAutorizados: ReadonlySet<string>;
  /**
   * Tipos de Ação que o principal pode executar (allowlist; deny-by-default — AD-18 "capacidades explícitas").
   * Derivado dos tipos do `entao` da definição versionada. Uma Ação cujo tipo não está aqui é recusada, mesmo
   * que seja um tipo válido do catálogo para outra Automação.
   */
  readonly capacidades: ReadonlySet<string>;
}

/** Quem INICIOU a mudança original que emitiu o Evento gatilho — preservado ao longo da cadeia (Story §1384). */
export interface Iniciador {
  readonly tipo: 'HUMANO' | 'AUTOMACAO' | 'SISTEMA';
  /** Conta que iniciou, quando humano; `null` caso contrário. Nunca vaza para fora da fronteira interna. */
  readonly accountId: string | null;
  /** Automação que iniciou, quando a cadeia foi originada por outra Automação (encadeamento — 4.7); senão `null`. */
  readonly automationId: string | null;
}

/**
 * Contrato de AUDITORIA que distingue os três papéis (Story §1384). O motor (4.6) e a trilha de Execuções (4.8)
 * consomem este objeto — nenhum dos três campos é fundido com os outros: a Automação não vira "o criador", e o
 * iniciador não vira "a Automação".
 */
export interface TrilhaAtoria {
  /** Quem executa a Ação agora: o principal Automação. */
  readonly ator: {
    readonly tipo: typeof PRINCIPAL_AUTOMACAO;
    readonly automationId: string;
  };
  /** Quem iniciou a mudança original que disparou o Evento (preservado). */
  readonly iniciador: Iniciador;
  /** Qual definição versionada agiu (AD-18). */
  readonly principal: {
    readonly automationId: string;
    readonly automationVersionId: string;
  };
}

/**
 * Monta a trilha de autoria a partir do principal e do iniciador preservado do Evento. Pura e total: os três
 * papéis saem SEMPRE distintos e explícitos — `ator` e `principal` vêm da Automação, `iniciador` vem do Evento.
 */
export function montarTrilhaAtoria(
  principal: PrincipalAutomacao,
  iniciador: Iniciador,
): TrilhaAtoria {
  return {
    ator: { tipo: PRINCIPAL_AUTOMACAO, automationId: principal.automationId },
    iniciador,
    principal: {
      automationId: principal.automationId,
      automationVersionId: principal.automationVersionId,
    },
  };
}

/**
 * O principal alcança um recurso? Deny-by-default: só se o id estiver na allowlist de recursos configurados. É a
 * fronteira do escopo RESTRITO — não consulta permissões do criador, apenas a definição versionada.
 */
export function escopoAlcancaRecurso(principal: PrincipalAutomacao, recursoId: string): boolean {
  return principal.recursosAutorizados.has(recursoId);
}

/**
 * O principal tem capacidade EXPLÍCITA para o tipo de Ação? Deny-by-default (AD-18). Uma Ação de tipo não
 * autorizado é recusada mesmo sendo um tipo válido do catálogo.
 */
export function temCapacidade(principal: PrincipalAutomacao, tipoAcao: string): boolean {
  return principal.capacidades.has(tipoAcao);
}
