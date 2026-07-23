/**
 * Núcleo PURO das transições de ciclo de vida da Tarefa (Story 5.1) — derivado direto dos ACs, sem banco.
 * Espelha `card-lifecycle.transitions.ts` (2.11), mas com a semântica de Tarefa: DOIS eixos INDEPENDENTES
 * (§1526) — o OPERACIONAL (`ABERTA`/`CONCLUIDA`) e o ARQUIVAMENTO (`ATIVA`/`ARQUIVADA`). `atrasada` NÃO é
 * estado: é derivado na leitura (`task-overdue.core.ts`). Ser puro é o que permite provar toda a matriz de
 * transições (válidas, idempotentes, inválidas, bloqueadas por arquivamento) em teste de unidade, sem PostgreSQL.
 */

export type EstadoOperacional = 'ABERTA' | 'CONCLUIDA';
export type EstadoArquivamento = 'ATIVA' | 'ARQUIVADA';
export type AcaoOperacional = 'concluir' | 'reabrir';
export type AcaoArquivamento = 'arquivar' | 'restaurar';

/** Transição do eixo OPERACIONAL. */
export interface TransicaoOperacional {
  target: EstadoOperacional;
  evento: 'COMPLETED' | 'REOPENED';
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
  | { tipo: 'bloqueado_arquivada' }; // arquivada bloqueia toda escrita operacional (§1526)

export type PlanoArquivamento =
  { tipo: 'transicao'; transicao: TransicaoArquivamento } | { tipo: 'idempotente' }; // já está no estado-alvo — no-op, sem evento

/**
 * Planeja uma transição OPERACIONAL. **Arquivada bloqueia** concluir/reabrir (a escrita operacional é
 * proibida sob arquivamento — §1526; o fluxo é restaurar → operar → arquivar). Regras (dos ACs):
 *   • concluir: ABERTA → CONCLUIDA; CONCLUIDA já-lá (idempotente).
 *   • reabrir:  CONCLUIDA → ABERTA; ABERTA já-lá (idempotente).
 */
export function planejarOperacional(
  acao: AcaoOperacional,
  atualOperacional: EstadoOperacional,
  arquivamento: EstadoArquivamento,
): PlanoOperacional {
  if (arquivamento === 'ARQUIVADA') return { tipo: 'bloqueado_arquivada' };
  if (acao === 'concluir') {
    if (atualOperacional === 'CONCLUIDA') return { tipo: 'idempotente' };
    return {
      tipo: 'transicao',
      transicao: { target: 'CONCLUIDA', evento: 'COMPLETED', resumo: 'Tarefa concluída' },
    };
  }
  // reabrir
  if (atualOperacional === 'ABERTA') return { tipo: 'idempotente' };
  return {
    tipo: 'transicao',
    transicao: { target: 'ABERTA', evento: 'REOPENED', resumo: 'Tarefa reaberta' },
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
      transicao: { target: 'ARQUIVADA', evento: 'ARCHIVED', resumo: 'Tarefa arquivada' },
    };
  }
  // restaurar
  if (atual === 'ATIVA') return { tipo: 'idempotente' };
  return {
    tipo: 'transicao',
    transicao: { target: 'ATIVA', evento: 'RESTORED', resumo: 'Tarefa restaurada' },
  };
}

/**
 * Uma Tarefa ARQUIVADA está em somente-leitura integral (§1526): editar/trocar-Responsável/vincular/novos
 * anexos são bloqueados. Núcleo compartilhado pelas escritas não-de-ciclo-de-vida (editar/Responsável/vínculo)
 * para que a regra viva num único lugar. `arquivar`/`restaurar` NÃO consultam isto (são o eixo de arquivamento).
 */
export function podeEscrever(arquivamento: EstadoArquivamento): boolean {
  return arquivamento === 'ATIVA';
}
