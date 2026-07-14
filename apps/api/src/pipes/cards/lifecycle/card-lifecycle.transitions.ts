/**
 * Núcleo PURO das transições de ciclo de vida do Card (Story 2.11) — derivado direto dos ACs, sem banco. Três
 * estados canônicos (ATIVO/FINALIZADO/ARQUIVADO); `reaberto`/`restaurado` são TRANSIÇÕES, não estados. O estado
 * anterior ao arquivamento é preservado para restaurar de forma confiável. Ser puro é o que permite provar toda a
 * matriz de transições (válidas, idempotentes, inválidas) em teste de unidade, sem PostgreSQL.
 */

export type EstadoCiclo = 'ATIVO' | 'FINALIZADO' | 'ARQUIVADO';
export type AcaoCiclo = 'finalizar' | 'reabrir' | 'arquivar' | 'restaurar';

/** Uma transição efetiva: novo estado + novo `previous` + o evento/resumo a gravar no Histórico. */
export interface Transicao {
  target: EstadoCiclo;
  /** Novo `previousLifecycleState`: só ARQUIVADO carrega um (o estado de onde veio); os demais o zeram. */
  novoPrevious: EstadoCiclo | null;
  /** Tipo do evento no `CardHistory` (taxonomia da 2.11). */
  evento: 'FINALIZED' | 'REOPENED' | 'ARCHIVED' | 'RESTORED';
  resumo: string;
}

export type PlanoTransicao =
  | { tipo: 'transicao'; transicao: Transicao }
  | { tipo: 'idempotente' } // já está no estado-alvo — no-op, sem evento
  | { tipo: 'invalido'; motivo: string }; // transição não permitida a partir do estado atual

/**
 * Planeja a transição a partir da ação e do estado atual (e do `previous`, para restaurar). Não toca banco;
 * decide APENAS o que deve acontecer. Regras (dos ACs):
 *   • finalizar: ATIVO → FINALIZADO; FINALIZADO já-lá (idempotente); ARQUIVADO inválido (restaure antes).
 *   • reabrir:   FINALIZADO → ATIVO; ATIVO já-lá; ARQUIVADO inválido.
 *   • arquivar:  ATIVO/FINALIZADO → ARQUIVADO guardando o `previous`; ARQUIVADO já-lá.
 *   • restaurar: ARQUIVADO → estado anterior preservado (zerando o `previous`); não-arquivado é inválido.
 */
export function planejarTransicao(
  acao: AcaoCiclo,
  atual: EstadoCiclo,
  previous: EstadoCiclo | null,
): PlanoTransicao {
  switch (acao) {
    case 'finalizar':
      if (atual === 'FINALIZADO') return { tipo: 'idempotente' };
      if (atual === 'ATIVO')
        return {
          tipo: 'transicao',
          transicao: {
            target: 'FINALIZADO',
            novoPrevious: null,
            evento: 'FINALIZED',
            resumo: 'Card finalizado',
          },
        };
      return {
        tipo: 'invalido',
        motivo: 'um Card arquivado precisa ser restaurado antes de finalizar',
      };

    case 'reabrir':
      if (atual === 'ATIVO') return { tipo: 'idempotente' };
      if (atual === 'FINALIZADO')
        return {
          tipo: 'transicao',
          transicao: {
            target: 'ATIVO',
            novoPrevious: null,
            evento: 'REOPENED',
            resumo: 'Card reaberto',
          },
        };
      return {
        tipo: 'invalido',
        motivo: 'um Card arquivado precisa ser restaurado antes de reabrir',
      };

    case 'arquivar':
      if (atual === 'ARQUIVADO') return { tipo: 'idempotente' };
      // Guarda o estado de origem (ATIVO ou FINALIZADO) para a restauração devolver exatamente a ele.
      return {
        tipo: 'transicao',
        transicao: {
          target: 'ARQUIVADO',
          novoPrevious: atual,
          evento: 'ARCHIVED',
          resumo: 'Card arquivado',
        },
      };

    case 'restaurar':
      if (atual !== 'ARQUIVADO')
        return { tipo: 'invalido', motivo: 'nada a restaurar: o Card não está arquivado' };
      // Volta ao estado anterior preservado; defesa: sem `previous` registrado, restaura para ATIVO.
      return {
        tipo: 'transicao',
        transicao: {
          target: previous ?? 'ATIVO',
          novoPrevious: null,
          evento: 'RESTORED',
          resumo: 'Card restaurado',
        },
      };
  }
}
