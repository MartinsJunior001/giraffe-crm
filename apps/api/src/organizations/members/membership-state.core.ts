import type { MembershipRole, MembershipState } from './membership-role.core';

/**
 * Núcleo PURO da transição de ESTADO da Membership (Story 8.5) — suspender/reativar. Espelha o
 * `membership-role.core.ts` (8.4), mas no eixo de estado (`ACTIVE ↔ SUSPENDED`), não de papel.
 * Sem framework, sem banco: recebe o estado corrente como DADO e devolve a DECISÃO. Ser puro é o que
 * permite provar em unidade — sem PostgreSQL — cada invariante (step-up exigido, autossuspensão
 * vedada, proteção atômica do último Admin, no-op idempotente, transição inválida). A decisão
 * AUTORITATIVA do último Admin é reavaliada DENTRO da transação com `SELECT … FOR UPDATE` (D-2);
 * este núcleo é reusado lá e no pré-cheque, com a MESMA função.
 */

/** A transição pedida pela rota. */
export type TransicaoEstado = 'SUSPENDER' | 'REATIVAR';

/** Estado corrente lido antes/durante a transição — a ENTRADA da decisão. */
export interface EntradaDecisaoEstado {
  readonly estadoAtual: MembershipState;
  readonly transicao: TransicaoEstado;
  /** O ator é o PRÓPRIO alvo? (autossuspensão é vedada — saída própria é a 8.6). */
  readonly ehProprio: boolean;
  /** Admins ATIVOS na Organização, INCLUINDO o alvo se ele for Admin. */
  readonly adminsAtivos: number;
  /** Papel efetivo do alvo (não muda na transição de estado; alimenta a proteção do último Admin). */
  readonly papelAlvo: MembershipRole;
  /** Há step-up recente válido para a sessão do ator? (D-1: suspender E reativar exigem). */
  readonly stepUpValido: boolean;
}

/**
 * A decisão. `APLICAR` autoriza a escrita; os demais são recusas tipadas que o serviço traduz em HTTP:
 *  - `ESTADO_INVALIDO` → 409 (transição impossível a partir do estado atual — ex.: reativar `REMOVED`,
 *    que exige novo Convite/aceite; encerramento não é reativação simples);
 *  - `NOOP`            → 200 idempotente, SEM escrita/evento (não emite `updateMany` → sem falso `denied`);
 *  - `AUTOSSUSPENSAO`  → 403 AUTOSSUSPENSAO_PROIBIDA (o usuário não se suspende);
 *  - `STEP_UP`         → 403 STEP_UP_REQUIRED;
 *  - `ULTIMO_ADMIN`    → 409 LAST_ADMIN_PROTECTED (INV-ADMIN-01).
 */
export type DecisaoEstado =
  | { tipo: 'APLICAR' }
  | { tipo: 'ESTADO_INVALIDO' }
  | { tipo: 'NOOP' }
  | { tipo: 'AUTOSSUSPENSAO' }
  | { tipo: 'STEP_UP' }
  | { tipo: 'ULTIMO_ADMIN' };

/** Suspender REDUZ a quantidade de Admins ativos? Só quando o alvo é Admin ativo. Gatilho da D-2. */
export function suspensaoReduzAdmin(
  estadoAtual: MembershipState,
  papelAlvo: MembershipRole,
): boolean {
  return estadoAtual === 'ACTIVE' && papelAlvo === 'ADMIN';
}

/**
 * Decide a transição, FAIL-CLOSED e em ordem determinística.
 *
 * **SUSPENDER:**
 *  1. alvo `REMOVED` → `ESTADO_INVALIDO` (não se suspende uma Membership encerrada);
 *  2. já `SUSPENDED` → `NOOP` (idempotência sem escrita);
 *  3. autossuspensão (`ehProprio`) → `AUTOSSUSPENSAO` — vedada ANTES do step-up (não vaza o requisito
 *     de step-up para uma ação que jamais seria permitida);
 *  4. exige step-up e não há janela válida → `STEP_UP`;
 *  5. suspende o ÚLTIMO Admin ativo (`adminsAtivos <= 1`) → `ULTIMO_ADMIN` (INV-ADMIN-01);
 *  6. `APLICAR`.
 *
 * **REATIVAR:**
 *  1. alvo `REMOVED` → `ESTADO_INVALIDO` (encerramento não é reativação simples — exige novo aceite, 8.6);
 *  2. já `ACTIVE` → `NOOP`;
 *  3. exige step-up e não há janela válida → `STEP_UP`;
 *  4. `APLICAR` — reativar ADICIONA acesso (não há trava de último Admin), NÃO é autossuspensão e NÃO
 *     restaura concessões/atribuições (o serviço não repõe nada — plano de reconciliação vazio).
 *
 * O passo do último Admin (SUSPENDER) é reavaliado DENTRO da transação com a contagem relida sob
 * `FOR UPDATE` — aqui e lá é esta mesma função: contagem otimista isolada NÃO basta (D-2), mas a
 * REGRA é única.
 */
export function planejarTransicaoEstado(e: EntradaDecisaoEstado): DecisaoEstado {
  if (e.transicao === 'SUSPENDER') {
    if (e.estadoAtual === 'REMOVED') return { tipo: 'ESTADO_INVALIDO' };
    if (e.estadoAtual === 'SUSPENDED') return { tipo: 'NOOP' };
    if (e.ehProprio) return { tipo: 'AUTOSSUSPENSAO' };
    if (!e.stepUpValido) return { tipo: 'STEP_UP' };
    if (suspensaoReduzAdmin(e.estadoAtual, e.papelAlvo) && e.adminsAtivos <= 1) {
      return { tipo: 'ULTIMO_ADMIN' };
    }
    return { tipo: 'APLICAR' };
  }

  // REATIVAR
  if (e.estadoAtual === 'REMOVED') return { tipo: 'ESTADO_INVALIDO' };
  if (e.estadoAtual === 'ACTIVE') return { tipo: 'NOOP' };
  if (!e.stepUpValido) return { tipo: 'STEP_UP' };
  return { tipo: 'APLICAR' };
}

/** O estado destino de uma transição APLICÁVEL. */
export function estadoDestino(transicao: TransicaoEstado): MembershipState {
  return transicao === 'SUSPENDER' ? 'SUSPENDED' : 'ACTIVE';
}

/** O tipo de evento canônico correspondente à transição. */
export function tipoEvento(transicao: TransicaoEstado): 'SUSPENDED' | 'REACTIVATED' {
  return transicao === 'SUSPENDER' ? 'SUSPENDED' : 'REACTIVATED';
}
