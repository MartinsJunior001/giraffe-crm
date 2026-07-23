/**
 * Núcleo PURO das transições de ciclo de vida da Solicitação (Story 5.2) — derivado direto dos ACs, sem
 * banco. Twin de `task-lifecycle.transitions.ts` (5.1), com a semântica de Solicitação: DOIS eixos
 * INDEPENDENTES (§1546) — o OPERACIONAL (`ABERTA`/`RESOLVIDA`) e o ARQUIVAMENTO (`ATIVA`/`ARQUIVADA`). NÃO há
 * eixo temporal (sem prazo/atrasada/scheduler — diferença central frente à 5.1). Ser puro é o que permite
 * provar toda a matriz de transições (válidas, idempotentes, bloqueadas por arquivamento) em teste de
 * unidade, sem PostgreSQL.
 */

export type EstadoOperacional = 'ABERTA' | 'RESOLVIDA';
export type EstadoArquivamento = 'ATIVA' | 'ARQUIVADA';
export type AcaoOperacional = 'resolver' | 'reabrir';
export type AcaoArquivamento = 'arquivar' | 'restaurar';

/** Transição do eixo OPERACIONAL. */
export interface TransicaoOperacional {
  target: EstadoOperacional;
  evento: 'RESOLVED' | 'REOPENED';
  resumo: string;
}

/** Transição do eixo de ARQUIVAMENTO. */
export interface TransicaoArquivamento {
  target: EstadoArquivamento;
  evento: 'ARCHIVED' | 'RESTORED';
  resumo: string;
}

export type PlanoOperacional =
  | { tipo: 'transicao'; transicao: TransicaoOperacional }
  | { tipo: 'idempotente' } // já está no estado-alvo — no-op, sem evento
  | { tipo: 'bloqueado_arquivada' }; // arquivada bloqueia toda escrita operacional (§1546)

export type PlanoArquivamento =
  { tipo: 'transicao'; transicao: TransicaoArquivamento } | { tipo: 'idempotente' }; // já está no estado-alvo — no-op, sem evento

/**
 * Planeja uma transição OPERACIONAL. **Arquivada bloqueia** resolver/reabrir (a escrita operacional é
 * proibida sob arquivamento — §1546; o fluxo é restaurar → operar → arquivar). Regras (dos ACs):
 *   • resolver: ABERTA → RESOLVIDA; RESOLVIDA já-lá (idempotente).
 *   • reabrir:  RESOLVIDA → ABERTA; ABERTA já-lá (idempotente).
 */
export function planejarOperacional(
  acao: AcaoOperacional,
  atualOperacional: EstadoOperacional,
  arquivamento: EstadoArquivamento,
): PlanoOperacional {
  if (arquivamento === 'ARQUIVADA') return { tipo: 'bloqueado_arquivada' };
  if (acao === 'resolver') {
    if (atualOperacional === 'RESOLVIDA') return { tipo: 'idempotente' };
    return {
      tipo: 'transicao',
      transicao: { target: 'RESOLVIDA', evento: 'RESOLVED', resumo: 'Solicitação resolvida' },
    };
  }
  // reabrir
  if (atualOperacional === 'ABERTA') return { tipo: 'idempotente' };
  return {
    tipo: 'transicao',
    transicao: { target: 'ABERTA', evento: 'REOPENED', resumo: 'Solicitação reaberta' },
  };
}

/**
 * Planeja uma transição de ARQUIVAMENTO. Este eixo é sempre acessível (arquivar/restaurar NÃO são bloqueados
 * por arquivamento — são justamente as transições desse eixo). O estado operacional é PRESERVADO por
 * construção (arquivar/restaurar não o tocam). Regras:
 *   • arquivar:  ATIVA → ARQUIVADA; ARQUIVADA já-lá (idempotente).
 *   • restaurar: ARQUIVADA → ATIVA; ATIVA já-lá (idempotente).
 */
export function planejarArquivamento(
  acao: AcaoArquivamento,
  atual: EstadoArquivamento,
): PlanoArquivamento {
  if (acao === 'arquivar') {
    if (atual === 'ARQUIVADA') return { tipo: 'idempotente' };
    return {
      tipo: 'transicao',
      transicao: { target: 'ARQUIVADA', evento: 'ARCHIVED', resumo: 'Solicitação arquivada' },
    };
  }
  // restaurar
  if (atual === 'ATIVA') return { tipo: 'idempotente' };
  return {
    tipo: 'transicao',
    transicao: { target: 'ATIVA', evento: 'RESTORED', resumo: 'Solicitação restaurada' },
  };
}

/**
 * Uma Solicitação ARQUIVADA está em somente-leitura integral (§1546): editar/trocar-Responsável/vincular/
 * novos anexos são bloqueados. Núcleo compartilhado pelas escritas não-de-ciclo-de-vida para que a regra viva
 * num único lugar. `arquivar`/`restaurar` NÃO consultam isto (são o eixo de arquivamento).
 */
export function podeEscrever(arquivamento: EstadoArquivamento): boolean {
  return arquivamento === 'ATIVA';
}
