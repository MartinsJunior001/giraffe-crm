import { SCHEMA_VERSION_CONFIG, type Acao } from '../automation-config';
import { ACOES_CATALOGO, type AcaoDominio, type AcaoTipo } from './action-catalog';
import {
  type AlvoAcaoSnapshot,
  type AlvoResolvido,
  type ContextoEvento,
  type ResultadoRevalidacao,
  resolverAlvoDeterministico,
  revalidarAcao,
} from './action-revalidation.core';
import type { PrincipalAutomacao } from './automation-principal';

/**
 * Contrato de EXTENSÃO tipado e versionado de handlers de Ação (Story 4.9 — FR-21, RN-104, D4.1/D4.4; AD-18/20/28).
 * ÚLTIMA Story do Épico 4. Puro, sem framework/banco — testável sem PostgreSQL, como `event-catalog.ts` (4.3),
 * `action-catalog.ts` (4.5) e `condition-catalog.ts` (4.4).
 *
 * **O que este contrato É.** Ele FORMALIZA — não inventa — o contrato a que os handlers de Ação CORE que 4.5/4.6
 * implementam se conformam. Cada faceta declarada aqui aponta para um comportamento que existe no substrato.
 * **Story 5.7:** os handlers de E5 (Criar Tarefa/Solicitação, Enviar Notificação) foram PROMOVIDOS de slots de
 * extensão a handlers CORE — vivem em `ACOES_CATALOGO` (4.5) + `AUMENTO_NUCLEO` e são EXECUTADOS pelo motor 4.6
 * (`action-executors.ts`), sob o mesmo `PrincipalAutomacao`, trilha e encadeamento — **sem motor paralelo**. Só
 * E6 (E-mail/IA — `EMAIL_SEND`/`AI_ACTION`) permanece DECLARADO como ponto de extensão (`origem: 'EXTENSION'`),
 * NÃO executável na Fase 1, exatamente como a 4.3 declarou os Eventos de extensão remanescentes. O CLAUDE.md/
 * `kernel/README.md` proíbem abstração especulativa sem consumidor concreto; o consumidor concreto AQUI são os
 * handlers núcleo (E4 + E5) + o motor 4.6.
 *
 * **Sem motor paralelo, sem reimplementar (§1463).** O dispatch do motor (4.6, `executarAcao`) permanece intocado.
 * Este contrato é a formalização DECLARATIVA do que aquele motor já faz. A conformação é garantida por CONSTRUÇÃO
 * onde possível (o executor 4.6 IMPORTA daqui os identificadores dos Eventos que gera — declarado = usado, sem
 * drift) e por TESTE onde não (bijeção catálogo↔registro; proibições impossíveis por construção).
 *
 * **Proibições da Fase 1 impossíveis POR CONSTRUÇÃO (§1459):** plugins arbitrários, código do usuário, scripts,
 * handlers externos, execução HTTP. O registro é um `Map` FECHADO montado no load a partir de arrays FIXOS; NÃO há
 * função pública de registro dinâmico; o tipo `HandlerDeAcao` NÃO tem faceta de "endpoint/URL/comando/script";
 * `ExecutorKind` é um enum FECHADO — um handler nunca carrega uma referência de função vinda de fora.
 */

// ── As 11 facetas do §1459 ────────────────────────────────────────────────────────────────────────────

/** Origem do handler: `CORE` = executável na Fase 1; `EXTENSION` = ponto de extensão E5/E6, contrato NÃO executável. */
export type OrigemAcao = 'CORE' | 'EXTENSION';

/**
 * Gates de disponibilidade (faceta §1459.5) que o motor confere antes/ao executar. `ESTADO_ALVO` = ciclo de vida do
 * alvo admissível (invariante "ARQUIVADO = somente-leitura", já em `estadosAlvoValidos`); `FORMVERSION_PUBLICADA` =
 * o Database de destino tem uma `FormVersion` publicada (conferido no executor `criarRegistro`, 4.6). O gate de
 * Campo Arquivo (AD-28) é enforçado a MONTANTE (publicação/submissão), não por Ação núcleo — as Ações de E-mail/IA
 * de E6 é que declararão seus próprios gates AD-28 quando existirem.
 */
export type GateDisponibilidade = 'ESTADO_ALVO' | 'FORMVERSION_PUBLICADA';

/**
 * Executor idempotente (faceta §1459.8) — descritor FECHADO do caminho de execução no motor 4.6. NUNCA uma
 * referência de função arbitrária: é o que torna "handlers externos/plugins/scripts/HTTP" impossíveis por
 * construção. `CONFIRMACAO_HUMANA` = Ação sensível (§1383) que na Fase 1 vira `BLOCKED_CONFIRMATION` (o executor
 * concreto é contrato futuro, ligado ao fluxo de confirmação). `EXTENSAO` = sem executor na Fase 1 (E5/E6).
 */
export type ExecutorKind =
  | 'ATRIBUIR_RESPONSAVEL'
  | 'CRIAR_REGISTRO'
  | 'CRIAR_TAREFA' // E5 (Story 5.7) — Criar Tarefa (reusa o padrão de 5.1)
  | 'CRIAR_SOLICITACAO' // E5 (Story 5.7) — Criar Solicitação (reusa o padrão de 5.2)
  | 'ENVIAR_NOTIFICACAO' // E5 (Story 5.7) — Enviar Notificação in-app (reusa a distribuição 5.6)
  | 'CONFIRMACAO_HUMANA'
  | 'EXTENSAO';

/**
 * Eventos canônicos (catálogo 4.3) que os executores da Fase 1 GERAM (faceta §1459.10). **Fonte única:** o executor
 * 4.6 IMPORTA destes identificadores para o `eventType` do envelope — logo o que o contrato DECLARA é o que o motor
 * USA, sem possibilidade de divergência. As Ações sensíveis (confirmação humana) NÃO geram Evento na Fase 1 (não
 * executam) — declaram `[]`; o Evento que produzirão quando a confirmação for materializada é contrato futuro.
 */
export const EVENTO_GERADO_ASSIGN_RESPONSIBLE = 'CARD_RESPONSIBLE_CHANGED';
export const EVENTO_GERADO_RECORD_CREATE = 'RECORD_CREATED';
/** E5 (Story 5.7): criar Tarefa/Solicitação por Automação GERA o Evento canônico do fato (encadeável — 4.7). */
export const EVENTO_GERADO_TASK_CREATE = 'TASK_CREATED';
export const EVENTO_GERADO_REQUEST_CREATE = 'REQUEST_CREATED';

/**
 * Dados permitidos na trilha (faceta §1459.11) — allowlist UNIFORME. Os executores 4.6 gravam em
 * `CardHistory`/`RecordHistory` APENAS estas chaves: nunca `valores` (possível PII), `bucketKey`, id de objeto ou
 * URL temporária (AD-15/AD-30). A política de SANITIZAÇÃO (faceta §1459.9) é o corolário: motivos de recusa/erro são
 * enums ESTRUTURAIS (`MotivoRecusa`/`ErrorCode`), nunca id/valor/stack.
 */
export const DADOS_DE_TRILHA_PERMITIDOS = ['type', 'summary', 'actorId'] as const;

/**
 * Superfície UNIFORME dos handlers (facetas §1459.6/.7/.9/.11) — igual para TODOS os handlers núcleo, exposta uma
 * única vez (não repetida por tipo): o resolvedor determinístico de alvo, a revalidação de autorização fail-closed,
 * a política de sanitização e a allowlist da trilha. Um handler de E5/E6 reusará ESTA superfície (o motor único).
 */
export const SUPERFICIE_HANDLER = {
  /** Faceta §1459.6 — resolvedor determinístico de alvo (4.5). Total sobre o catálogo; ambiguidade ⇒ `null`. */
  resolverAlvo: resolverAlvoDeterministico as (
    acao: Acao,
    contexto: ContextoEvento,
  ) => AlvoResolvido | null,
  /** Faceta §1459.7 — revalidação de autorização sob o principal (4.5), fail-closed, não-ampliação. */
  revalidar: revalidarAcao as (
    acao: Acao,
    alvoResolvido: AlvoResolvido | null,
    alvo: AlvoAcaoSnapshot,
    principal: PrincipalAutomacao,
  ) => ResultadoRevalidacao,
  /** Faceta §1459.9 — sanitização: motivos/erros são enums estruturais (AD-30). Marcador da política uniforme. */
  sanitizacao: 'ENUM_ESTRUTURAL_AD30' as const,
  /** Faceta §1459.11 — dados permitidos na trilha (allowlist uniforme). */
  dadosDeTrilha: DADOS_DE_TRILHA_PERMITIDOS,
} as const;

/** O contrato tipado de UM handler de Ação (as facetas que VARIAM por tipo; as uniformes vivem em `SUPERFICIE_HANDLER`). */
export interface HandlerDeAcao {
  /** Faceta §1459.1 — identificador estável do tipo. */
  readonly tipo: string;
  /** `CORE` (executável na Fase 1) ou `EXTENSION` (E5/E6, contrato NÃO executável). */
  readonly origem: OrigemAcao;
  /** Faceta §1459.2 — versão do schema de configuração a que o handler valida (baseline `SCHEMA_VERSION_CONFIG`). */
  readonly schemaVersion: number;
  /** Domínio do alvo (`CARD`/`RECORD`) para handlers núcleo; `null` para extensão (o domínio é de E5/E6). */
  readonly dominio: AcaoDominio | null;
  /** A Ação é sensível e vira `BLOCKED_CONFIRMATION` na Fase 1 (§1383)? */
  readonly exigeConfirmacaoHumana: boolean;
  /** Faceta §1459.5 — gates de disponibilidade conferidos ao executar (vazio = nenhum nesta camada). */
  readonly gatesDisponibilidade: readonly GateDisponibilidade[];
  /** Faceta §1459.8 — descritor FECHADO do executor idempotente (nunca função externa). */
  readonly executor: ExecutorKind;
  /** Faceta §1459.10 — Eventos canônicos que o handler GERA na Fase 1 (vazio para sensíveis/extensão). */
  readonly eventosProduzidos: readonly string[];
  /**
   * Facetas §1459.3/.4 — schema/validador de configuração. Para handler núcleo delega ao `validar` do catálogo
   * (4.5). Para extensão é um REJEITADOR fail-closed: configurar uma Ação de extensão na Fase 1 é recusado.
   */
  readonly validarConfig: (a: Acao, onde: string) => void;
}

/** Erro de Ação de EXTENSÃO ainda indisponível (E5/E6). O serviço o traduz em 400, sanitizado, sem eco do payload. */
export class AcaoDeExtensaoIndisponivelError extends Error {
  constructor(readonly tipo: string) {
    super('tipo de Ação de extensão ainda não disponível');
    this.name = 'AcaoDeExtensaoIndisponivelError';
  }
}

/** Erro de tipo de Ação desconhecido (fora do catálogo E4 e dos pontos de extensão declarados). */
export class AcaoDesconhecidaError extends Error {
  constructor(readonly tipo: string) {
    super('tipo de Ação desconhecido');
    this.name = 'AcaoDesconhecidaError';
  }
}

// ── Aumento por tipo NÚCLEO (as facetas que o catálogo 4.5 ainda não declarava explicitamente) ─────────

interface AumentoNucleo {
  readonly gatesDisponibilidade: readonly GateDisponibilidade[];
  readonly executor: ExecutorKind;
  readonly eventosProduzidos: readonly string[];
}

/**
 * As facetas por tipo que EXISTEM implicitamente no substrato 4.5/4.6 e que a 4.9 torna explícitas. NENHUMA é
 * inventada: `executor`/`eventosProduzidos` refletem exatamente `action-executors.ts` (4.6); `gatesDisponibilidade`
 * reflete `estadosAlvoValidos` (4.5) + o gate de `FormVersion` publicada do `criarRegistro` (4.6). As Ações
 * sensíveis (confirmação humana) não têm executor na Fase 1 (viram `BLOCKED_CONFIRMATION`) ⇒ `eventosProduzidos: []`.
 */
const AUMENTO_NUCLEO: Record<AcaoTipo, AumentoNucleo> = {
  CARD_MOVE: {
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'CONFIRMACAO_HUMANA',
    eventosProduzidos: [],
  },
  CARD_ASSIGN_RESPONSIBLE: {
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'ATRIBUIR_RESPONSAVEL',
    eventosProduzidos: [EVENTO_GERADO_ASSIGN_RESPONSIBLE],
  },
  CARD_SET_FIELD_VALUE: {
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'CONFIRMACAO_HUMANA',
    eventosProduzidos: [],
  },
  CARD_FINALIZE: {
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'CONFIRMACAO_HUMANA',
    eventosProduzidos: [],
  },
  CARD_ARCHIVE: {
    // `estadosAlvoValidos: null` no catálogo (arquivar é idempotente em qualquer estado) ⇒ sem gate de estado.
    gatesDisponibilidade: [],
    executor: 'CONFIRMACAO_HUMANA',
    eventosProduzidos: [],
  },
  RECORD_CREATE: {
    gatesDisponibilidade: ['ESTADO_ALVO', 'FORMVERSION_PUBLICADA'],
    executor: 'CRIAR_REGISTRO',
    eventosProduzidos: [EVENTO_GERADO_RECORD_CREATE],
  },
  RECORD_CREATE_RELATED: {
    gatesDisponibilidade: ['ESTADO_ALVO', 'FORMVERSION_PUBLICADA'],
    executor: 'CRIAR_REGISTRO',
    eventosProduzidos: [EVENTO_GERADO_RECORD_CREATE],
  },
  RECORD_EDIT: {
    // Sensível ⇒ `BLOCKED_CONFIRMATION` na Fase 1; o gate de `FormVersion` do próprio Registro é do executor futuro.
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'CONFIRMACAO_HUMANA',
    eventosProduzidos: [],
  },
  // ── E5 (Story 5.7): handlers CORE promovidos dos slots de extensão — executados pelo motor 4.6 ──────
  TASK_CREATE: {
    // Alvo = Pipe alvo; gate de estado `PIPE_ATIVO` (`ESTADO_ALVO`). Cria a Tarefa e GERA `TASK_CREATED`.
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'CRIAR_TAREFA',
    eventosProduzidos: [EVENTO_GERADO_TASK_CREATE],
  },
  REQUEST_CREATE: {
    gatesDisponibilidade: ['ESTADO_ALVO'],
    executor: 'CRIAR_SOLICITACAO',
    eventosProduzidos: [EVENTO_GERADO_REQUEST_CREATE],
  },
  NOTIFICATION_SEND: {
    // Sem gate de estado (a distribuição 5.6 decide acesso/preferência). NÃO gera Evento de domínio (a
    // Notificação não é um gatilho): `eventosProduzidos: []`. Idempotente por `sourceEventId` (5.6 dedupe).
    gatesDisponibilidade: [],
    executor: 'ENVIAR_NOTIFICACAO',
    eventosProduzidos: [],
  },
};

// ── Registro FECHADO dos handlers núcleo (derivado do catálogo 4.5 — fonte única) ──────────────────────

/**
 * Os 8 handlers NÚCLEO, derivados de `ACOES_CATALOGO` (4.5) — fonte ÚNICA de `dominio`/`exigeConfirmacaoHumana`/
 * `validar`. Nenhuma duplicação: a 4.9 só ANEXA as facetas de `AUMENTO_NUCLEO`. A bijeção catálogo↔registro é
 * provada por teste.
 */
export const REGISTRO_ACOES_NUCLEO: readonly HandlerDeAcao[] = ACOES_CATALOGO.map((cat) => {
  const aumento = AUMENTO_NUCLEO[cat.tipo];
  return {
    tipo: cat.tipo,
    origem: 'CORE' as const,
    schemaVersion: SCHEMA_VERSION_CONFIG,
    dominio: cat.dominio,
    exigeConfirmacaoHumana: cat.exigeConfirmacaoHumana,
    gatesDisponibilidade: aumento.gatesDisponibilidade,
    executor: aumento.executor,
    eventosProduzidos: aumento.eventosProduzidos,
    validarConfig: cat.validar,
  } satisfies HandlerDeAcao;
});

// ── Pontos de EXTENSÃO E5/E6 (contrato declarado, NÃO executável — espelho de `EVENTOS_EXTENSAO`, 4.3) ──

/**
 * Tipos de Ação que E6 registrará NO MESMO motor (sem motores paralelos — §1463). Declarados como CONTRATO,
 * NÃO executáveis na Fase 1 (`origem: 'EXTENSION'`, `executor: 'EXTENSAO'`, `validarConfig` rejeita). Os de E5
 * (Criar Tarefa/Solicitação, Enviar Notificação) foram PROMOVIDOS a handlers CORE pela Story 5.7 — agora vivem
 * em `ACOES_CATALOGO` (4.5) e `AUMENTO_NUCLEO`, executados pelo motor 4.6. Sobram os de E6, que a Story da
 * extensão confirmará. Ficam aqui para o catálogo ser explícito sobre o que é PROIBIDO — não para habilitá-los.
 */
export const TIPOS_ACAO_EXTENSAO = [
  'EMAIL_SEND', // E6 — Enviar E-mail (gated AD-28)
  'AI_ACTION', // E6 — IA como Ação (AD-20: comando proposto sob aprovação humana; nunca efeito automático)
] as const;

export type TipoAcaoExtensao = (typeof TIPOS_ACAO_EXTENSAO)[number];

/** Handler de extensão: contrato declarado, sem executor. `validarConfig` rejeita fail-closed na Fase 1. */
function handlerDeExtensao(tipo: string): HandlerDeAcao {
  return {
    tipo,
    origem: 'EXTENSION',
    schemaVersion: SCHEMA_VERSION_CONFIG,
    dominio: null,
    exigeConfirmacaoHumana: false,
    gatesDisponibilidade: [],
    executor: 'EXTENSAO',
    eventosProduzidos: [],
    validarConfig: () => {
      throw new AcaoDeExtensaoIndisponivelError(tipo);
    },
  };
}

export const REGISTRO_ACOES_EXTENSAO: readonly HandlerDeAcao[] =
  TIPOS_ACAO_EXTENSAO.map(handlerDeExtensao);

// ── Índice e acessores fail-closed ─────────────────────────────────────────────────────────────────────

/** Registro FECHADO (núcleo + extensão), por tipo, para lookup O(1). Construído no load — não há registro dinâmico. */
const POR_TIPO: ReadonlyMap<string, HandlerDeAcao> = new Map<string, HandlerDeAcao>(
  [...REGISTRO_ACOES_NUCLEO, ...REGISTRO_ACOES_EXTENSAO].map((h): [string, HandlerDeAcao] => [
    h.tipo,
    h,
  ]),
);

/** O handler de um tipo, ou `undefined` se desconhecido. */
export function obterHandler(tipo: string): HandlerDeAcao | undefined {
  return POR_TIPO.get(tipo);
}

/** O tipo é um handler NÚCLEO executável na Fase 1? (extensão e desconhecidos ⇒ `false`). */
export function handlerEhExecutavelNaFase1(tipo: string): boolean {
  return POR_TIPO.get(tipo)?.origem === 'CORE';
}

/**
 * Fail-closed: exige que `tipo` seja um handler NÚCLEO disponível na Fase 1. Desconhecido ⇒ `AcaoDesconhecidaError`;
 * ponto de extensão E5/E6 ⇒ `AcaoDeExtensaoIndisponivelError` (motivo DISTINTO, sanitizado). Espelha
 * `exigirEventoNoCatalogo` (4.3). Chamado pelo serviço de Automação por Ação, ANTES do enforcement estrutural do
 * catálogo (4.5), para dar uma recusa honesta em vez de um "desconhecido" genérico para um tipo que É contrato.
 */
export function exigirAcaoDisponivel(tipo: string): void {
  const handler = POR_TIPO.get(tipo);
  if (!handler) throw new AcaoDesconhecidaError(tipo);
  if (handler.origem === 'EXTENSION') throw new AcaoDeExtensaoIndisponivelError(tipo);
}

/**
 * Recusa fail-closed as Ações de EXTENSÃO de uma configuração, com motivo DISTINTO — chamada pelo serviço ANTES do
 * enforcement estrutural do catálogo (4.5). Diferente de `exigirAcaoDisponivel`, NÃO reclama de tipo desconhecido:
 * o desconhecido segue para `exigirAcoesNoCatalogo` (→ `ACAO_FORA_DO_CATALOGO`), preservando a regressão da 4.5.
 * Só o que É contrato de extensão (E5/E6) recebe o motivo honesto `ACAO_DE_EXTENSAO_INDISPONIVEL`.
 */
export function rejeitarAcoesDeExtensao(acoes: readonly Acao[]): void {
  for (const acao of acoes) {
    if (POR_TIPO.get(acao.tipo)?.origem === 'EXTENSION') {
      throw new AcaoDeExtensaoIndisponivelError(acao.tipo);
    }
  }
}
