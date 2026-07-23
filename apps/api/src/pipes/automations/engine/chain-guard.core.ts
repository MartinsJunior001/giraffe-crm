import { createHash } from 'node:crypto';
import { MAX_ATTEMPTS } from './retry-policy.core';

/**
 * Núcleo PURO da PREVENÇÃO DE CICLOS e dos LIMITES de encadeamento (Story 4.7 — NFR-7, AD-18). Sem I/O, sem
 * Nest, sem Prisma — testável sem PostgreSQL, como `retry-policy.core.ts` (4.6) e os demais núcleos da 4.x. O
 * motor (`automation-engine.service.ts`) CONSOME estas funções antes de enfileirar/processar uma Execução-filha;
 * a decisão em si é uma função pura da profundidade, do relógio recebido e da assinatura de visita (nunca
 * `Date.now()` embutido — determinismo/testabilidade).
 *
 * **Fail-closed (o coração de segurança — §1428):** um loop que ESCAPA é pior que um encadeamento legítimo
 * barrado. Na dúvida (profundidade não-computável, cadeia sem início conhecido), BARRA — nunca executa. A
 * detecção de CICLO em si (assinatura já visitada na cadeia) é imposta pelo BANCO (índice único parcial de
 * `AutomationChainVisit`), race-safe por construção; este núcleo cuida da profundidade e das durações.
 *
 * **Consolidação do gate de Arquitetura (§1435)** — os NÚMEROS, derivados do precedente 4.6 e de defaults
 * conservadores de Fase 1 (ver `_bmad-output/implementation-artifacts/decisions/automation-chaining-4-7.md`):
 *  · profundidade máxima da cadeia: `MAX_CHAIN_DEPTH`;
 *  · tentativas máximas: `MAX_ATTEMPTS` (reusado da 4.6 — sem número novo);
 *  · timeout por Ação: `MAX_ACTION_DURATION_MS`;
 *  · timeout por Execução: `MAX_EXECUTION_DURATION_MS` (alinhado ao `LEASE_MS` da 4.6);
 *  · timeout/duração máxima da cadeia: `MAX_CHAIN_DURATION_MS`.
 */

/** Motivo SANITIZADO da barreira de cadeia (AD-30) — vira `lastErrorCode` da Execução barrada e o que a 4.8 lê. */
export type MotivoBarreiraCadeia =
  'DEPTH_EXCEEDED' | 'CYCLE_DETECTED' | 'CHAIN_TIMEOUT' | 'ACTION_TIMEOUT' | 'EXECUTION_TIMEOUT';

/**
 * Profundidade MÁXIMA da cadeia (número de níveis de encadeamento). A raiz (Evento externo, fora do motor) é
 * profundidade 0; cada Evento gerado por uma Ação incrementa em 1. Uma Execução com `chainDepth > MAX_CHAIN_DEPTH`
 * é BARRADA (`DEPTH_EXCEEDED`) — é o que impede a "tempestade de execuções" de uma cadeia que cria recursos
 * SEMPRE NOVOS (assinatura distinta a cada nível, não pega pela detecção de ciclo). Conservador para Fase 1: uma
 * Automação legítima raramente encadeia além de poucos níveis; 10 dá folga sem permitir estouro.
 */
export const MAX_CHAIN_DEPTH = 10;

/**
 * Duração MÁXIMA de uma cadeia (ms), do 1º Evento à tentativa de enfileirar um novo filho. Além disto, novos
 * filhos são BARRADOS (`CHAIN_TIMEOUT`) — uma cadeia não pode ficar "viva" indefinidamente. Alinhado ao teto de
 * backoff da 4.6 (`BACKOFF_CAP_MS` = 5 min): a mesma ordem de grandeza do maior adiamento legítimo.
 */
export const MAX_CHAIN_DURATION_MS = 5 * 60_000;

/**
 * Timeout por EXECUÇÃO (ms) — orçamento de parede de UMA Execução processando suas Ações. Alinhado ao `LEASE_MS`
 * da 4.6 (60 s): o lease já é o mecanismo físico de retomada (um `RUNNING` além do lease é reivindicado); este
 * limite é o guarda LÓGICO consultado entre Ações para não estourar o lease.
 */
export const MAX_EXECUTION_DURATION_MS = 60_000;

/** Timeout por AÇÃO (ms) — orçamento de parede de UMA Ação. Uma mutação de domínio (tx) deve ser rápida. */
export const MAX_ACTION_DURATION_MS = 30_000;

export { MAX_ATTEMPTS };

/**
 * Assinatura DETERMINÍSTICA de visita (§1425/§1431): identifica "esta Automação, nesta versão, processando este
 * tipo de Evento sobre este recurso alvo". Baseada, no mínimo, em **Automação + Evento + recurso alvo** — o
 * `eventType` codifica a Ação que produziu o Evento (RECORD_CREATE ⇒ RECORD_CREATED, etc.) e o `resourceId` é o
 * alvo. A MESMA assinatura na MESMA cadeia é uma RE-VISITA (ciclo direto A→A ou indireto A→B→A); assinaturas
 * distintas (outra Automação, outro tipo de Evento, outro recurso) são encadeamento LEGÍTIMO.
 *
 * SHA-256 hex de uma string canônica com separador que não pode aparecer nos componentes (`:` não ocorre em
 * UUID nem nos tipos canônicos EN). Determinística: os mesmos componentes produzem SEMPRE a mesma assinatura.
 */
export function derivarAssinaturaVisita(
  automationId: string,
  automationVersionId: number,
  eventType: string,
  resourceId: string,
): string {
  const canonico = `${automationId}:${automationVersionId}:${eventType}:${resourceId}`;
  return createHash('sha256').update(canonico, 'utf8').digest('hex');
}

/** A profundidade EXCEDE o máximo? (`chainDepth > MAX_CHAIN_DEPTH`). */
export function excedeuProfundidade(chainDepth: number): boolean {
  // Fail-closed: profundidade não-numérica/negativa é tratada como excedida (não deveria ocorrer).
  if (!Number.isFinite(chainDepth) || chainDepth < 0) return true;
  return chainDepth > MAX_CHAIN_DEPTH;
}

/**
 * A cadeia EXCEDEU a duração máxima? `chainStartedAt` é o instante do início da cadeia (o mais antigo registro
 * de visita). `null` = cadeia sem início conhecido: para a RAIZ (profundidade 0) isso é normal (ela ESTÁ
 * começando agora) e o chamador não deve barrar; para um filho, o chamador trata `null` como fail-closed. Aqui,
 * `null` ⇒ `false` (não excede) — a decisão de fail-closed para filho fica no `avaliarBarreira`, que só chama
 * esta função quando há início conhecido.
 */
export function excedeuDuracaoCadeia(chainStartedAt: Date | null, agora: Date): boolean {
  if (chainStartedAt === null) return false;
  return agora.getTime() - chainStartedAt.getTime() > MAX_CHAIN_DURATION_MS;
}

/** A Execução EXCEDEU seu orçamento de parede? (guarda lógico entre Ações). */
export function excedeuDuracaoExecucao(startedAt: Date | null, agora: Date): boolean {
  if (startedAt === null) return false;
  return agora.getTime() - startedAt.getTime() > MAX_EXECUTION_DURATION_MS;
}

/** A Ação EXCEDEU seu orçamento de parede? */
export function excedeuDuracaoAcao(iniciadaEm: Date, agora: Date): boolean {
  return agora.getTime() - iniciadaEm.getTime() > MAX_ACTION_DURATION_MS;
}

/** Entrada da avaliação de barreira PRÉ-enfileiramento de uma Execução-filha. */
export interface EntradaBarreira {
  /** Profundidade que a Execução-filha teria (herdada do Evento gerador). */
  readonly chainDepth: number;
  /** Início da cadeia (instante do 1º registro de visita), ou `null` se a cadeia ainda não tem visita. */
  readonly chainStartedAt: Date | null;
  /** É a RAIZ da cadeia (profundidade 0, Evento externo)? A raiz nunca é barrada por duração (começa agora). */
  readonly ehRaiz: boolean;
  readonly agora: Date;
}

/** Veredito da barreira: barrado (com motivo sanitizado) ou liberado para prosseguir ao registro de visita. */
export interface VereditoBarreira {
  readonly barrado: boolean;
  readonly motivo: MotivoBarreiraCadeia | null;
}

const LIBERADO: VereditoBarreira = { barrado: false, motivo: null };

/**
 * Avalia a barreira PURA de uma Execução-filha ANTES de registrar a visita (a detecção de CICLO por assinatura é
 * do banco, no passo seguinte). Precedência: profundidade › duração da cadeia. Fail-closed: um filho (não-raiz)
 * SEM início de cadeia conhecido é BARRADO por `CHAIN_TIMEOUT` — não se executa uma cadeia cuja idade não se
 * consegue provar (§1428).
 */
export function avaliarBarreira(entrada: EntradaBarreira): VereditoBarreira {
  if (excedeuProfundidade(entrada.chainDepth)) {
    return { barrado: true, motivo: 'DEPTH_EXCEEDED' };
  }
  if (!entrada.ehRaiz) {
    if (entrada.chainStartedAt === null) {
      // Fail-closed: filho de cadeia sem idade computável ⇒ barra (não executa um loop cuja origem não se prova).
      return { barrado: true, motivo: 'CHAIN_TIMEOUT' };
    }
    if (excedeuDuracaoCadeia(entrada.chainStartedAt, entrada.agora)) {
      return { barrado: true, motivo: 'CHAIN_TIMEOUT' };
    }
  }
  return LIBERADO;
}
