/**
 * Núcleo PURO da máquina de estados do FileObject (Story 3.7) — derivado direto dos ACs, sem banco.
 * Ser puro é o que permite provar toda a matriz de transições (válidas, idempotentes, inválidas) em teste de
 * unidade, sem PostgreSQL. Espelha `record-lifecycle.transitions.ts` (3.4) no formato, mas o grafo é maior e
 * NÃO há tabela de histórico própria: os eventos de arquivo pertencem ao Histórico do recurso consumidor (3.8).
 *
 * Grafo canônico (fail-closed — nasce indisponível):
 *
 *   QUARENTENA ──promover(CLEAN)──▶ DISPONIVEL ──remover──▶ REMOVIDO_LOGICO ──expurgar──▶ EXPURGADO
 *       │
 *       └──bloquear(BLOCKED)──▶ BLOCKED  (terminal; nunca baixável/associável)
 */

export type EstadoFile = 'QUARENTENA' | 'DISPONIVEL' | 'REMOVIDO_LOGICO' | 'EXPURGADO' | 'BLOCKED';

export type AcaoFile = 'promover' | 'bloquear' | 'remover' | 'expurgar';

export type PlanoTransicao =
  | { tipo: 'transicao'; target: EstadoFile }
  | { tipo: 'idempotente' } // já está no estado-alvo — no-op, sem UPDATE (não falseia a auditoria)
  | { tipo: 'invalido'; motivo: string }; // transição impossível a partir do estado atual → 409

/** Origem exigida por ação (o estado a partir do qual a transição é válida). */
const ORIGEM: Record<AcaoFile, EstadoFile> = {
  promover: 'QUARENTENA',
  bloquear: 'QUARENTENA',
  remover: 'DISPONIVEL',
  expurgar: 'REMOVIDO_LOGICO',
};

/** Alvo de cada ação. */
const ALVO: Record<AcaoFile, EstadoFile> = {
  promover: 'DISPONIVEL',
  bloquear: 'BLOCKED',
  remover: 'REMOVIDO_LOGICO',
  expurgar: 'EXPURGADO',
};

/**
 * Planeja a transição a partir da ação e do estado atual. Não toca banco; decide APENAS o que deve acontecer.
 *
 *   • se já está no ALVO ⇒ idempotente (no-op, sem UPDATE);
 *   • se está na ORIGEM válida ⇒ transição para o alvo;
 *   • senão ⇒ inválido (409). BLOCKED e EXPURGADO são terminais: nada sai deles.
 *
 * `bloquear` a partir de `DISPONIVEL` é INVÁLIDO de propósito: um arquivo já promovido (CLEAN) não é
 * "rebloqueado" por este caminho — o veredito é decidido UMA vez, na promoção. Reavaliar é outra história (3.8+).
 */
export function planejarTransicao(acao: AcaoFile, atual: EstadoFile): PlanoTransicao {
  if (atual === ALVO[acao]) return { tipo: 'idempotente' };
  if (atual === ORIGEM[acao]) return { tipo: 'transicao', target: ALVO[acao] };
  return {
    tipo: 'invalido',
    motivo: `transição '${acao}' inválida a partir de '${atual}' (exige '${ORIGEM[acao]}')`,
  };
}

/** Um arquivo é baixável/associável APENAS quando DISPONIVEL. Qualquer outro estado ⇒ indisponível (fail-closed). */
export function estaDisponivel(estado: EstadoFile): boolean {
  return estado === 'DISPONIVEL';
}
