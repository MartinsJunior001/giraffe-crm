/**
 * Núcleo PURO das transições de ciclo de vida do Registro (Story 3.4) — derivado direto dos ACs, sem banco.
 * **Dois** estados canônicos (ATIVO/ARQUIVADO) — sem `FINALIZADO` (é do Card): restaurar volta sempre a ATIVO,
 * então NÃO há `previousLifecycleState`. Espelho reduzido de `card-lifecycle.transitions.ts` (2.11). Ser puro é o
 * que permite provar toda a matriz de transições (válidas, idempotentes) em teste de unidade, sem PostgreSQL.
 */

export type EstadoCiclo = 'ATIVO' | 'ARQUIVADO';
export type AcaoCiclo = 'arquivar' | 'restaurar';

/** Uma transição efetiva: novo estado + o evento/resumo a gravar no Histórico (write-side). */
export interface Transicao {
  target: EstadoCiclo;
  /** Tipo do evento no `RecordHistory` (taxonomia da 3.4). */
  evento: 'ARCHIVED' | 'RESTORED';
  resumo: string;
}

export type PlanoTransicao = { tipo: 'transicao'; transicao: Transicao } | { tipo: 'idempotente' }; // já está no estado-alvo — no-op, sem evento

/**
 * Planeja a transição a partir da ação e do estado atual. Não toca banco; decide APENAS o que deve acontecer.
 * Com 2 estados, ambas as ações são **idempotentes** e nunca inválidas:
 *   • arquivar:  ATIVO → ARQUIVADO; ARQUIVADO já-lá (idempotente, no-op).
 *   • restaurar: ARQUIVADO → ATIVO; ATIVO já-lá (idempotente, no-op).
 */
export function planejarTransicao(acao: AcaoCiclo, atual: EstadoCiclo): PlanoTransicao {
  switch (acao) {
    case 'arquivar':
      if (atual === 'ARQUIVADO') return { tipo: 'idempotente' };
      return {
        tipo: 'transicao',
        transicao: { target: 'ARQUIVADO', evento: 'ARCHIVED', resumo: 'Registro arquivado' },
      };

    case 'restaurar':
      if (atual === 'ATIVO') return { tipo: 'idempotente' };
      return {
        tipo: 'transicao',
        transicao: { target: 'ATIVO', evento: 'RESTORED', resumo: 'Registro restaurado' },
      };
  }
}
