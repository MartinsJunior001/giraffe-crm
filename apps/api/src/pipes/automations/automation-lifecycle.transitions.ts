/**
 * Núcleo PURO das transições de ciclo de vida da Automação (Story 4.2) — derivado direto dos ACs de D4.3,
 * sem banco. Três estados canônicos (`INACTIVE`/`ACTIVE`/`ARCHIVED` — o enum `AutomationState` da 4.1);
 * `ativar`/`desativar`/`arquivar`/`restaurar` são AÇÕES, não estados. Ser puro é o que permite provar toda a
 * matriz de transições (válidas, idempotentes, inválidas) em teste de unidade, sem PostgreSQL — como
 * `card-lifecycle.transitions.ts` (2.11) e `record-lifecycle.transitions.ts` (3.4).
 *
 * **Diferença frente ao Card:** aqui NÃO há `previousLifecycleState`. A spec é categórica — "restaurar
 * sempre retorna inativa" —, então a restauração leva SEMPRE a `INACTIVE`, sem preservar o estado anterior
 * ao arquivamento. Um `previous` seria um dado que o contrato proíbe usar.
 */

export type EstadoAutomacao = 'INACTIVE' | 'ACTIVE' | 'ARCHIVED';
export type AcaoCiclo = 'ativar' | 'desativar' | 'arquivar' | 'restaurar';

/** Uma transição efetiva: novo estado + o evento/resumo a registrar na Auditoria administrativa. */
export interface Transicao {
  target: EstadoAutomacao;
  /** Tipo do evento de auditoria (taxonomia da 4.2). */
  evento: 'ACTIVATED' | 'DEACTIVATED' | 'ARCHIVED' | 'RESTORED';
  resumo: string;
  /** A transição precisa CONGELAR uma versão da config vigente (só `ativar` — D-4.2-B). */
  criaVersao: boolean;
}

export type PlanoTransicao =
  | { tipo: 'transicao'; transicao: Transicao }
  | { tipo: 'idempotente' } // já está no estado-alvo — no-op, sem evento, sem versão
  | { tipo: 'invalido'; motivo: string }; // transição não permitida a partir do estado atual

/**
 * Planeja a transição a partir da ação e do estado atual. Não toca banco; decide APENAS o que deve
 * acontecer. Regras (dos ACs de D4.3):
 *   • ativar:    INACTIVE → ACTIVE (congela versão); ACTIVE já-lá (idempotente); ARCHIVED inválido (restaure antes).
 *   • desativar: ACTIVE → INACTIVE; INACTIVE já-lá (idempotente); ARCHIVED inválido (não se desativa o arquivado).
 *   • arquivar:  INACTIVE/ACTIVE → ARCHIVED (arquivar uma ATIVA "implica desativação automática": o estado vai a
 *                ARCHIVED, que o motor não avalia); ARCHIVED já-lá (idempotente).
 *   • restaurar: ARCHIVED → INACTIVE ("restaurar sempre retorna inativa"); INACTIVE já-lá (idempotente — já é o
 *                alvo da restauração); ACTIVE inválido (nada a restaurar numa ativa).
 */
export function planejarTransicao(acao: AcaoCiclo, atual: EstadoAutomacao): PlanoTransicao {
  switch (acao) {
    case 'ativar':
      if (atual === 'ACTIVE') return { tipo: 'idempotente' };
      if (atual === 'INACTIVE')
        return {
          tipo: 'transicao',
          transicao: {
            target: 'ACTIVE',
            evento: 'ACTIVATED',
            resumo: 'Automação ativada',
            criaVersao: true,
          },
        };
      return {
        tipo: 'invalido',
        motivo: 'uma Automação arquivada precisa ser restaurada antes de ativar',
      };

    case 'desativar':
      if (atual === 'INACTIVE') return { tipo: 'idempotente' };
      if (atual === 'ACTIVE')
        return {
          tipo: 'transicao',
          transicao: {
            target: 'INACTIVE',
            evento: 'DEACTIVATED',
            resumo: 'Automação desativada',
            criaVersao: false,
          },
        };
      return {
        tipo: 'invalido',
        motivo: 'uma Automação arquivada precisa ser restaurada antes de desativar',
      };

    case 'arquivar':
      if (atual === 'ARCHIVED') return { tipo: 'idempotente' };
      // De INACTIVE ou de ACTIVE. Arquivar uma ATIVA a "desativa" por construção: ARCHIVED não é avaliado.
      return {
        tipo: 'transicao',
        transicao: {
          target: 'ARCHIVED',
          evento: 'ARCHIVED',
          resumo: 'Automação arquivada',
          criaVersao: false,
        },
      };

    case 'restaurar':
      if (atual === 'INACTIVE') return { tipo: 'idempotente' }; // já é o alvo da restauração
      if (atual === 'ARCHIVED')
        return {
          tipo: 'transicao',
          transicao: {
            target: 'INACTIVE',
            evento: 'RESTORED',
            resumo: 'Automação restaurada',
            criaVersao: false,
          },
        };
      return { tipo: 'invalido', motivo: 'nada a restaurar: a Automação não está arquivada' };
  }
}
