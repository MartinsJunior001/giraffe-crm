import type { Acao } from '../automation-config';
import { type AcaoDominio, obterAcaoCatalogo } from './action-catalog';
import {
  escopoAlcancaRecurso,
  type PrincipalAutomacao,
  temCapacidade,
} from './automation-principal';

/**
 * Núcleo PURO da REVALIDAÇÃO de Ação sob o principal Automação (Story 4.5 — RN-101; AD-9/AD-18). Combina a
 * RESOLUÇÃO do alvo determinístico (§1381) com a REVALIDAÇÃO de escopo/estado/existência (§1389), de forma
 * **determinística** e **fail-closed**. Sem I/O, sem Nest, sem Prisma — o mesmo desenho de `condition-eval.core.ts`
 * (4.4): os invariantes de segurança vivem aqui e são provados em unidade. O motor (4.6, AD-11) MONTA os
 * snapshots sob `withTenantContext` (RLS) e CONSOME estas funções; nada aqui toca banco.
 *
 * **Duas garantias que este módulo NUNCA quebra:**
 *  1. **Determinismo do alvo** — mesmo Evento (contexto) + mesma configuração ⇒ MESMO alvo. Sem busca aberta,
 *     sem ambiguidade: um alvo derivado do Evento que não seja INEQUÍVOCO (ex.: modo `VINCULO` com 0 ou >1
 *     Registros vinculados) resolve para **nenhum alvo** (fail-closed) — jamais "escolhe um".
 *  2. **Fail-closed sob o principal** — a Ação só é permitida se o alvo EXISTE, é da MESMA Organização, está no
 *     Pipe/recurso do ESCOPO RESTRITO do principal, está em ESTADO válido e o principal tem a CAPACIDADE
 *     explícita. Qualquer falha ⇒ recusa (nunca executa). **O escopo é do principal, não do criador**: um
 *     recurso que o criador alcançaria mas que não está na allowlist do principal é recusado (não-ampliação).
 */

// ── Contexto do Evento (para resolver o alvo) ─────────────────────────────────────────────────────────

/**
 * O que o Evento gatilho oferece para RESOLVER o alvo determinístico. Montado pelo motor (4.6) a partir do
 * envelope canônico (4.3) sob RLS: uma referência cross-tenant simplesmente NÃO aparece aqui (a policy a
 * esconde), e o alvo correspondente resolve para nulo (fail-closed).
 */
export interface ContextoEvento {
  /** Card de contexto do Evento (Eventos de Card/vínculo), ou `null` (Evento puro de Registro). */
  readonly cardId: string | null;
  /** Registro que ORIGINOU o Evento (Eventos de Registro), ou `null`. */
  readonly recordId: string | null;
  /** IDs dos Registros com vínculo ATIVO ao Card de contexto no instante do Evento (3.9). Vazio = sem vínculo. */
  readonly linkedRecordIds: readonly string[];
}

/** O alvo resolvido: o id do recurso primário sobre o qual a Ação atua (Card, Registro ou Database de destino). */
export interface AlvoResolvido {
  readonly recursoId: string;
}

// ── Snapshot do alvo (montado pelo motor sob RLS) ─────────────────────────────────────────────────────

/**
 * Fotografia do ALVO resolvido, lida pelo motor (4.6) sob `withTenantContext`. `encontrado=false` quando a
 * releitura sob RLS não achou o recurso (inexistente OU de outra Organização — a policy não distingue, e o
 * avaliador trata ambos como recusa). `orgId`/`pipeId`/`databaseId` são carimbos de defesa em profundidade; a
 * revalidação os confronta com o principal.
 */
export interface AlvoAcaoSnapshot {
  readonly encontrado: boolean;
  /** Organização do alvo (defesa em profundidade). Confrontada com `principal.orgId`. */
  readonly orgId: string | null;
  /** Pipe do alvo, quando Card (2.14). Confrontado com `principal.pipeId`. `null` para alvo de Registro. */
  readonly pipeId: string | null;
  /** Database do alvo, quando Registro/criação (3.4). `null` para alvo de Card. */
  readonly databaseId: string | null;
  /** Ciclo de vida do alvo (Card 2.11 / Registro 3.4 / Database 3.1). `null` = sem estado aplicável. */
  readonly lifecycleState: string | null;
}

// ── Resultado ─────────────────────────────────────────────────────────────────────────────────────────

/** Motivo SANITIZADO da recusa — enum estrutural, NUNCA um id ou valor (possível PII). */
export type MotivoRecusa =
  | 'ACAO_DESCONHECIDA'
  | 'ALVO_INDETERMINADO'
  | 'SEM_CAPACIDADE'
  | 'NAO_ENCONTRADO'
  | 'FORA_DA_ORG'
  | 'FORA_DO_ESCOPO'
  | 'ESTADO_INVALIDO';

/** Veredito da revalidação. `permitido=false` ⇒ o motor (4.6) NÃO executa a Ação. */
export interface ResultadoRevalidacao {
  readonly permitido: boolean;
  /** Motivo sanitizado quando `permitido=false`; `null` quando permitido. */
  readonly motivo: MotivoRecusa | null;
  /**
   * A Ação exige confirmação humana (§1383)? Carregado do catálogo para o motor decidir entrar em `aguardando
   * confirmação` em vez de executar. `false` para Ação desconhecida (a recusa já barra). NÃO é um erro técnico.
   */
  readonly exigeConfirmacaoHumana: boolean;
}

// ── Resolução do alvo determinístico (§1381) ──────────────────────────────────────────────────────────

/**
 * Resolve o ALVO determinístico de uma Ação a partir do contexto do Evento e da configuração. Puro e
 * determinístico: mesmo `(acao, contexto)` ⇒ mesmo resultado. Devolve `null` (fail-closed) quando o alvo NÃO é
 * inequívoco — jamais "escolhe" entre candidatos.
 *
 *  · Ações de **Card** (`CARD_*`) atuam sobre o Card de CONTEXTO do Evento ⇒ alvo = `contexto.cardId` (ausente ⇒
 *    nulo).
 *  · `RECORD_CREATE` / `RECORD_CREATE_RELATED` criam um Registro NOVO ⇒ o "alvo" é o Database configurado
 *    (referência única); `RECORD_CREATE_RELATED` exige ainda um Card de contexto para o vínculo (ausente ⇒ nulo).
 *  · `RECORD_EDIT` resolve por MODO: `EVENTO` = o Registro que originou o Evento; `VINCULO` = o ÚNICO Registro
 *    vinculado ao Card de contexto (0 ou >1 ⇒ ambíguo ⇒ nulo); `EXPLICITO` = a referência de Registro configurada.
 */
export function resolverAlvoDeterministico(
  acao: Acao,
  contexto: ContextoEvento,
): AlvoResolvido | null {
  const meta = obterAcaoCatalogo(acao.tipo);
  if (!meta) return null; // tipo fora do catálogo ⇒ sem alvo (o config-time já rejeita; defesa em profundidade)

  switch (acao.tipo) {
    case 'CARD_MOVE':
    case 'CARD_ASSIGN_RESPONSIBLE':
    case 'CARD_SET_FIELD_VALUE':
    case 'CARD_FINALIZE':
    case 'CARD_ARCHIVE':
      return contexto.cardId === null ? null : { recursoId: contexto.cardId };

    case 'RECORD_CREATE':
      return alvoDeReferencia(acao, 'DATABASE');

    case 'RECORD_CREATE_RELATED':
      // Precisa do Database (onde criar) E do Card de contexto (a quem vincular). Sem o Card ⇒ fail-closed.
      return contexto.cardId === null ? null : alvoDeReferencia(acao, 'DATABASE');

    case 'RECORD_EDIT':
      return resolverAlvoRegistroEdit(acao, contexto);

    default:
      return null;
  }
}

/** O id da referência ÚNICA de um tipo (garantida pelo catálogo). `null` se ausente — defesa em profundidade. */
function alvoDeReferencia(acao: Acao, tipo: string): AlvoResolvido | null {
  const refs = acao.refs.filter((r) => r.tipo === tipo);
  return refs.length === 1 ? { recursoId: refs[0]!.id } : null;
}

/** Resolve o alvo de `RECORD_EDIT` por modo (§1381). Ambiguidade ⇒ `null` (fail-closed). */
function resolverAlvoRegistroEdit(acao: Acao, contexto: ContextoEvento): AlvoResolvido | null {
  const alvo = acao.parametros.alvo;
  if (typeof alvo !== 'object' || alvo === null) return null;
  const modo = (alvo as { modo?: unknown }).modo;

  switch (modo) {
    case 'EVENTO':
      return contexto.recordId === null ? null : { recursoId: contexto.recordId };
    case 'VINCULO':
      // "Regra inequívoca": exatamente UM Registro vinculado. 0 ou >1 ⇒ ambíguo ⇒ nenhum alvo (§1381).
      return contexto.linkedRecordIds.length === 1
        ? { recursoId: contexto.linkedRecordIds[0]! }
        : null;
    case 'EXPLICITO':
      return alvoDeReferencia(acao, 'RECORD');
    default:
      return null;
  }
}

// ── Revalidação sob o principal (§1389) ───────────────────────────────────────────────────────────────

/**
 * Revalida uma Ação sob o principal Automação, contra o snapshot do alvo (montado pelo motor sob RLS). Ordem
 * das checagens — todas fail-closed, cada falha com motivo sanitizado:
 *
 *   1. **tipo conhecido** — Ação fora do catálogo ⇒ `ACAO_DESCONHECIDA`;
 *   2. **capacidade explícita** — o principal precisa da capacidade do tipo (deny-by-default, AD-18) ⇒
 *      `SEM_CAPACIDADE`. **Não-ampliação**: mesmo que o criador pudesse a Ação, o principal só age se tiver a
 *      capacidade em sua definição versionada;
 *   3. **existência** — alvo não encontrado sob RLS (inexistente ou de outra Org) ⇒ `NAO_ENCONTRADO`;
 *   4. **Organização** — `alvo.orgId` deve ser o do principal ⇒ `FORA_DA_ORG` (isolamento cross-tenant);
 *   5. **escopo restrito** — Card: `alvo.pipeId` deve ser o Pipe do principal (RN-100); Registro/Database: o
 *      recurso deve estar na allowlist `recursosAutorizados` ⇒ `FORA_DO_ESCOPO`. **O escopo é do principal**;
 *   6. **estado** — o ciclo de vida do alvo deve ser admissível para a Ação (invariante "ARQUIVADO =
 *      somente-leitura") ⇒ `ESTADO_INVALIDO`. Defesa em profundidade — o serviço de domínio é a autoridade final.
 *
 * `alvoResolvido` é o resultado de `resolverAlvoDeterministico`; `null` ⇒ `ALVO_INDETERMINADO` (sem executar).
 */
export function revalidarAcao(
  acao: Acao,
  alvoResolvido: AlvoResolvido | null,
  alvo: AlvoAcaoSnapshot,
  principal: PrincipalAutomacao,
): ResultadoRevalidacao {
  const meta = obterAcaoCatalogo(acao.tipo);
  if (!meta) return recusa('ACAO_DESCONHECIDA', false);

  const exigeConfirmacao = meta.exigeConfirmacaoHumana;

  if (alvoResolvido === null) return recusa('ALVO_INDETERMINADO', exigeConfirmacao);

  // Capacidade EXPLÍCITA do principal (deny-by-default) — antes de olhar o alvo: não-ampliação de poder.
  if (!temCapacidade(principal, acao.tipo)) return recusa('SEM_CAPACIDADE', exigeConfirmacao);

  if (!alvo.encontrado) return recusa('NAO_ENCONTRADO', exigeConfirmacao);

  // Isolamento cross-tenant: o alvo tem de ser da mesma Organização do principal (defesa em profundidade —
  // a montagem já foi sob RLS, mas a revalidação não confia no payload; AD-18).
  if (alvo.orgId !== principal.orgId) return recusa('FORA_DA_ORG', exigeConfirmacao);

  if (!dentroDoEscopo(acao, meta.dominio, alvoResolvido, alvo, principal)) {
    return recusa('FORA_DO_ESCOPO', exigeConfirmacao);
  }

  if (meta.estadosAlvoValidos !== null) {
    if (alvo.lifecycleState === null || !meta.estadosAlvoValidos.has(alvo.lifecycleState)) {
      return recusa('ESTADO_INVALIDO', exigeConfirmacao);
    }
  }

  return { permitido: true, motivo: null, exigeConfirmacaoHumana: exigeConfirmacao };
}

/**
 * O alvo está no ESCOPO RESTRITO do principal?
 *
 *  · **Card** ⇒ deve ser do Pipe proprietário (RN-100 — Ações de Card alcançam apenas Cards do Pipe da Automação).
 *    Este é o restrito: um Card de outro Pipe (mesmo da mesma Org) é `FORA_DO_ESCOPO`.
 *  · **Registro/Database com alvo CONFIGURADO** (referência na definição: `RECORD_CREATE`/`RECORD_CREATE_RELATED`
 *    pela Database; `RECORD_EDIT` modo `EXPLICITO` pela Record) ⇒ o recurso precisa estar na allowlist
 *    `recursosAutorizados` (deny-by-default). Um Database/Registro fora da definição é inalcançável.
 *  · **Registro com alvo DERIVADO do Evento** (`RECORD_EDIT` modo `EVENTO`/`VINCULO`) ⇒ o alvo NÃO é uma
 *    referência configurada: é o próprio sujeito do Evento que disparou a Automação. Seu escopo é a MESMA
 *    Organização (já verificada) + a entrega do Evento — que, por 4.1 (§1284), só ocorre para Registros vinculados
 *    a um Card do Pipe proprietário. O motor (4.6) monta o snapshot sob RLS (o alvo não existe se for de outra
 *    Org). Não há referência configurada a exigir aqui; exigir uma rejeitaria a edição legítima do sujeito do
 *    Evento. O isolamento é garantido por Organização + `encontrado` sob RLS.
 */
function dentroDoEscopo(
  acao: Acao,
  dominio: AcaoDominio,
  alvoResolvido: AlvoResolvido,
  alvo: AlvoAcaoSnapshot,
  principal: PrincipalAutomacao,
): boolean {
  if (dominio === 'CARD') {
    return alvo.pipeId === principal.pipeId;
  }
  // Domínio Registro: alvo CONFIGURADO exige allowlist; alvo DERIVADO do Evento é escopado por Org + entrega.
  if (alvoEhConfigurado(acao)) {
    return escopoAlcancaRecurso(principal, alvoResolvido.recursoId);
  }
  return true; // derivado do Evento: mesma Org (já verificada) + RLS na montagem do snapshot são o escopo.
}

/** O alvo primário da Ação vem de uma REFERÊNCIA configurada (vs. derivado do contexto do Evento)? */
function alvoEhConfigurado(acao: Acao): boolean {
  if (acao.tipo === 'RECORD_CREATE' || acao.tipo === 'RECORD_CREATE_RELATED') return true;
  if (acao.tipo === 'RECORD_EDIT') {
    const alvo = acao.parametros.alvo;
    return (
      typeof alvo === 'object' && alvo !== null && (alvo as { modo?: unknown }).modo === 'EXPLICITO'
    );
  }
  return false;
}

function recusa(motivo: MotivoRecusa, exigeConfirmacaoHumana: boolean): ResultadoRevalidacao {
  return { permitido: false, motivo, exigeConfirmacaoHumana };
}
