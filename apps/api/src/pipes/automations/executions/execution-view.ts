/**
 * Núcleo PURO da Trilha de Execuções (Story 4.8) — projeção **allowlist** e derivações SEM banco.
 *
 * É aqui que a sanitização (AD-30, NFR-1/8/16) vira código testável: só os campos desta allowlist saem pela
 * API interna. Nada de payload/parâmetros/`valores`/segredo/token/URL assinada/chave de storage/prompt/resposta
 * de IA/stack trace; `orgId` e ids internos ficam fora da fronteira. Ver
 * `_bmad-output/implementation-artifacts/decisions/execution-trail-4-8.md`.
 */

/** Os 8 estados HONESTOS e distintos da Execução (4.6/4.7 — UX-DR6). */
export type ExecutionState =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'FAILED'
  | 'SKIPPED_CONDITIONS'
  | 'BLOCKED_CONFIRMATION'
  | 'HALTED_BY_LIMIT';

/** Estado do resultado de UMA Ação (4.6). */
export type ActionResultState =
  'SUCCEEDED' | 'FAILED' | 'DENIED' | 'BLOCKED_CONFIRMATION' | 'BLOCKED_PRIOR_FAILURE';

/**
 * Agregado da avaliação de Condições (Story 4.8, D6). A avaliação (4.4) é PURA e **não** persistida por-Condição
 * (o motor 4.6 só finaliza como `SKIPPED_CONDITIONS` quando o AND falha) — então derivamos o veredito AGREGADO do
 * estado da Execução. NÃO fabricamos um resultado por-Condição inexistente (`DEB-4-8-CONDICOES-POR-CONDICAO`).
 */
export type AvaliacaoCondicoes = 'SATISFEITA' | 'NAO_SATISFEITA' | 'PENDENTE' | 'NAO_AVALIADA';

export function avaliacaoCondicoes(state: ExecutionState): AvaliacaoCondicoes {
  switch (state) {
    case 'SKIPPED_CONDITIONS':
      return 'NAO_SATISFEITA'; // AND não satisfeito ⇒ nenhuma Ação
    case 'SUCCEEDED':
    case 'PARTIAL':
    case 'FAILED':
    case 'BLOCKED_CONFIRMATION':
      return 'SATISFEITA'; // condições passaram; Ações rodaram/tentaram
    case 'PENDING':
    case 'RUNNING':
      return 'PENDENTE'; // ainda não avaliada / em progresso
    case 'HALTED_BY_LIMIT':
      return 'NAO_AVALIADA'; // barrada por limite de cadeia ANTES de avaliar (4.7)
  }
}

/**
 * Mapa estático código→motivo legível (pt-BR). Os códigos são **enums estruturais** que 4.6/4.7 gravam em
 * `lastErrorCode`/`errorCode` (SANITIZADOS por construção — nunca id/valor/PII/stack). Fonte única do "motivo
 * legível" (§1444). Cobre os códigos conhecidos do motor/executores/revalidação.
 */
const MOTIVOS: Readonly<Record<string, string>> = {
  CONDITION_NOT_MET: 'Condições não satisfeitas',
  DEPTH_EXCEEDED: 'Limite de profundidade de encadeamento atingido',
  CYCLE_DETECTED: 'Ciclo de automação detectado',
  CHAIN_TIMEOUT: 'Tempo máximo da cadeia excedido',
  ACTION_TIMEOUT: 'Tempo máximo da ação excedido',
  EXECUTION_TIMEOUT: 'Tempo máximo da execução excedido',
  MAX_ATTEMPTS_EXCEEDED: 'Número máximo de tentativas excedido',
  PRIOR_ACTION_BLOCKED: 'Ação anterior falhou ou foi bloqueada',
  REQUIRES_CONFIRMATION: 'Ação requer confirmação humana',
  ALVO_INDETERMINADO: 'Alvo da ação indeterminado',
  FORA_DO_ESCOPO: 'Alvo fora do escopo autorizado',
  FORA_DA_ORG: 'Alvo fora da organização',
  ESTADO_INVALIDO: 'Estado inválido para a ação',
  ACAO_DESCONHECIDA: 'Tipo de ação desconhecido',
  EXECUTOR_ERROR: 'Falha ao executar a ação',
  TRANSIENT_CONFLICT: 'Conflito transitório — nova tentativa em andamento',
  NAO_ENCONTRADO: 'Recurso não encontrado',
};

/** Um código só é ECOADO se for um enum estrutural (`^[A-Z_]+$`) — defesa: nunca ecoar texto livre de erro. */
const CODIGO_RE = /^[A-Z][A-Z_]*$/;

/**
 * Motivo legível de um código sanitizado. `null` → sem motivo. Código conhecido → rótulo do mapa. Código válido
 * porém não mapeado → rótulo genérico que **preserva** o código (já sanitizado). Código malformado → sem eco.
 */
export function motivoLegivel(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  if (!CODIGO_RE.test(codigo)) return null; // defesa: não ecoa nada que não seja enum estrutural
  return MOTIVOS[codigo] ?? `Falha (código: ${codigo})`;
}

/** Duração da Execução em ms, quando início e fim estão presentes; senão `null`. */
export function duracaoMs(startedAt: Date | null, finishedAt: Date | null): number | null {
  if (!startedAt || !finishedAt) return null;
  const ms = finishedAt.getTime() - startedAt.getTime();
  return ms >= 0 ? ms : null; // relógio inconsistente ⇒ não inventa duração negativa
}

// ── Projeção allowlist ────────────────────────────────────────────────────────

/** Iniciador PRESERVADO (§1384) — quem começou a mudança original. Nunca fundido com o ATOR (a Automação). */
export interface IniciadorVisao {
  tipo: string; // HUMANO | AUTOMACAO | SISTEMA (vocabulário estável)
  accountId: string | null;
  automationId: string | null;
}

/** Recurso principal do Evento gatilho (do `DomainEvent`). Só tipo + id (nunca `valores`). */
export interface RecursoPrincipalVisao {
  tipo: string; // CARD | RECORD | CARD_RECORD_LINK
  id: string;
}

/** A Automação (ATOR / principal Automação) e a VERSÃO utilizada (§1444 — "versão da Automação"). */
export interface AutomacaoVisao {
  id: string;
  name: string | null; // pode faltar se a Automação foi expurgada (RESTRICT protege, mas defensivo)
  versao: number; // automationVersionId (número da versão congelada avaliada)
  revision: string; // configSnapshotRevision (hash do snapshot)
}

export interface EventoVisao {
  eventId: string;
  tipo: string | null; // eventType do catálogo (do DomainEvent); null se o evento foi expurgado
  origem: string | null; // origin (SUBMISSION/PUBLIC/MOVE/AUTOMATION)
  recursoPrincipal: RecursoPrincipalVisao | null;
}

/** Resumo de uma Execução na lista (projeção allowlist). */
export interface ExecucaoResumoVisao {
  executionId: string;
  automation: AutomacaoVisao;
  evento: EventoVisao;
  state: ExecutionState;
  avaliacaoCondicoes: AvaliacaoCondicoes;
  tentativa: number;
  iniciador: IniciadorVisao;
  origem: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  duracaoMs: number | null;
  correlationId: string;
  executionChainId: string | null;
  chainDepth: number;
  lastErrorCode: string | null;
  motivoLegivel: string | null;
  createdAt: Date;
}

/** Resultado de UMA Ação (detalhe). `referenciaRestrita` = alvo mascarado por falta de acesso (§1447). */
export interface ResultadoAcaoVisao {
  actionIndex: number;
  actionType: string;
  state: ActionResultState;
  errorCode: string | null;
  motivoLegivel: string | null;
  targetResourceId: string | null;
  referenciaRestrita: boolean;
}

/** Encadeamento (4.7) — identidade + causa de interrupção. NÃO expõe a árvore (`DEB-4-8-CHAIN-TREE`). */
export interface CadeiaVisao {
  executionChainId: string | null;
  chainDepth: number;
  interrompidaPorLimite: boolean;
  motivoLegivel: string | null;
}

/** Detalhe = resumo + Ações na ordem configurada + metadados de cadeia. */
export interface ExecucaoDetalheVisao extends ExecucaoResumoVisao {
  acoes: ResultadoAcaoVisao[];
  cadeia: CadeiaVisao;
}

/** As colunas de `AutomationExecution` que a projeção CONSOME (allowlist de leitura — nada além disto). */
export interface ExecucaoBruta {
  id: string;
  eventId: string;
  automationId: string;
  automationVersionId: number;
  configSnapshotRevision: string;
  state: ExecutionState;
  attempt: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  initiatorType: string;
  initiatorAccountId: string | null;
  initiatorAutomationId: string | null;
  correlationId: string;
  executionChainId: string | null;
  chainDepth: number;
  lastErrorCode: string | null;
  createdAt: Date;
}

/** Metadados do Evento gatilho (do `DomainEvent`) que a projeção consome. `null` quando o evento foi expurgado. */
export interface EventoBruto {
  eventType: string;
  origin: string;
  resourceType: string;
  resourceId: string;
}

/** Resultado de Ação bruto que a projeção consome. */
export interface ResultadoAcaoBruto {
  actionIndex: number;
  actionType: string;
  state: ActionResultState;
  errorCode: string | null;
  targetResourceId: string | null;
}

/**
 * Decide se um `targetResourceId` é EXPOSTO ou MASCARADO (§1447 — "referências inacessíveis aparecem restritas,
 * sem revelar existência/conteúdo"). `podeVerAlvo`:
 *   • escopo `gerenciar` (Admin da Org/Pipe) ⇒ sempre `true`;
 *   • escopo Membro ⇒ `true` só se o alvo é um Card do Pipe que ele acessa (o chamador passa o predicado).
 */
export function projetarResultadoAcao(
  r: ResultadoAcaoBruto,
  podeVerAlvo: (targetResourceId: string) => boolean,
): ResultadoAcaoVisao {
  const alvoVisivel = r.targetResourceId !== null && podeVerAlvo(r.targetResourceId);
  return {
    actionIndex: r.actionIndex,
    actionType: r.actionType,
    state: r.state,
    errorCode: r.errorCode,
    motivoLegivel: motivoLegivel(r.errorCode),
    targetResourceId: alvoVisivel ? r.targetResourceId : null,
    referenciaRestrita: r.targetResourceId !== null && !alvoVisivel,
  };
}

/** Projeta o resumo de uma Execução, com os metadados do Evento (quando disponíveis) e o nome da Automação. */
export function projetarExecucao(
  e: ExecucaoBruta,
  evento: EventoBruto | null,
  automationName: string | null,
): ExecucaoResumoVisao {
  return {
    executionId: e.id,
    automation: {
      id: e.automationId,
      name: automationName,
      versao: e.automationVersionId,
      revision: e.configSnapshotRevision,
    },
    evento: {
      eventId: e.eventId,
      tipo: evento?.eventType ?? null,
      origem: evento?.origin ?? null,
      recursoPrincipal: evento ? { tipo: evento.resourceType, id: evento.resourceId } : null,
    },
    state: e.state,
    avaliacaoCondicoes: avaliacaoCondicoes(e.state),
    tentativa: e.attempt,
    iniciador: {
      tipo: e.initiatorType,
      accountId: e.initiatorAccountId,
      automationId: e.initiatorAutomationId,
    },
    origem: evento?.origin ?? null,
    startedAt: e.startedAt,
    finishedAt: e.finishedAt,
    duracaoMs: duracaoMs(e.startedAt, e.finishedAt),
    correlationId: e.correlationId,
    executionChainId: e.executionChainId,
    chainDepth: e.chainDepth,
    lastErrorCode: e.lastErrorCode,
    motivoLegivel: motivoLegivel(e.lastErrorCode),
    createdAt: e.createdAt,
  };
}

/** Monta o bloco de cadeia (4.7) do detalhe. */
export function projetarCadeia(e: ExecucaoBruta): CadeiaVisao {
  return {
    executionChainId: e.executionChainId,
    chainDepth: e.chainDepth,
    interrompidaPorLimite: e.state === 'HALTED_BY_LIMIT',
    motivoLegivel: e.state === 'HALTED_BY_LIMIT' ? motivoLegivel(e.lastErrorCode) : null,
  };
}
