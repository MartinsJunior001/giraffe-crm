import type { MembershipRole, MembershipState } from './membership-role.core';

/**
 * Núcleo PURO da REMOÇÃO / SAÍDA VOLUNTÁRIA da Membership (Story 8.6) — o encerramento do vínculo
 * (`ACTIVE`/`SUSPENDED → REMOVED`). Espelha `membership-state.core.ts` (8.5), mas no eixo TERMINAL do
 * estado: remover é irreversível pela API (reativar `REMOVED` NÃO existe — o reingresso exige novo
 * Convite/aceite, 8.3). Sem framework, sem banco: recebe o estado corrente como DADO e devolve a
 * DECISÃO — o que permite provar em unidade cada invariante (step-up exigido, proteção ATÔMICA do
 * último Admin, idempotência). A decisão AUTORITATIVA do último Admin é reavaliada DENTRO da transação
 * com `SELECT … FOR UPDATE` (D-2); este núcleo é reusado lá e no pré-cheque, com a MESMA função.
 *
 * **Remoção administrativa e saída voluntária compartilham este núcleo.** A diferença é só de
 * AUTORIDADE/ROTA (o Admin remove um alvo; o próprio usuário sai de si) e de AUDITORIA (`saidaVoluntaria`
 * no evento) — resolvida no serviço a partir de `actorId === alvo.accountId`, NÃO aqui. Por isso não há
 * bloqueio de "auto-alvo": diferente da autossuspensão (8.5, vedada), a saída própria é o próprio objetivo
 * da 8.6. Removê-lo do núcleo mantém a regra única e o serviço fino.
 */

/** Estado corrente lido antes/durante a remoção — a ENTRADA da decisão. */
export interface EntradaDecisaoRemocao {
  readonly estadoAtual: MembershipState;
  /** Admins ATIVOS na Organização, INCLUINDO o alvo se ele for Admin ativo. */
  readonly adminsAtivos: number;
  /** Papel efetivo do alvo (não muda ao remover; alimenta a proteção do último Admin). */
  readonly papelAlvo: MembershipRole;
  /** Há step-up recente válido para a sessão do ator? (D-1: remover E sair exigem). */
  readonly stepUpValido: boolean;
}

/**
 * A decisão. `APLICAR` autoriza a escrita; os demais são recusas tipadas que o serviço traduz em HTTP:
 *  - `NOOP`          → 200 idempotente, SEM escrita/evento (já `REMOVED`; não emite `updateMany` → sem
 *    falso `denied` na auditoria);
 *  - `STEP_UP`       → 403 STEP_UP_REQUIRED;
 *  - `ULTIMO_ADMIN`  → 409 LAST_ADMIN_PROTECTED (INV-ADMIN-01) — vale para os DOIS fluxos.
 */
export type DecisaoRemocao =
  { tipo: 'APLICAR' } | { tipo: 'NOOP' } | { tipo: 'STEP_UP' } | { tipo: 'ULTIMO_ADMIN' };

/** Remover REDUZ a quantidade de Admins ativos? Só quando o alvo é Admin ATIVO. Gatilho da D-2. */
export function remocaoReduzAdmin(
  estadoAtual: MembershipState,
  papelAlvo: MembershipRole,
): boolean {
  return estadoAtual === 'ACTIVE' && papelAlvo === 'ADMIN';
}

/**
 * Decide a remoção, FAIL-CLOSED e em ordem determinística:
 *  1. já `REMOVED` → `NOOP` (idempotência sem escrita — encerramento é terminal e repetível sem efeito);
 *  2. exige step-up e não há janela válida → `STEP_UP` (auth é pré-condição, remover E sair);
 *  3. remove o ÚLTIMO Admin ativo (`adminsAtivos <= 1`) → `ULTIMO_ADMIN` (INV-ADMIN-01) — inclusive na
 *     saída voluntária do próprio último Admin;
 *  4. `APLICAR`.
 *
 * **Sem bloqueio de auto-alvo:** a saída própria é permitida (é a 8.6); um Admin removendo a si mesmo
 * também é permitido, EXCETO quando viola o último Admin (passo 3). O passo 3 é reavaliado DENTRO da
 * transação com a contagem relida sob `FOR UPDATE` — aqui e lá é esta mesma função: contagem otimista
 * isolada NÃO basta (D-2), mas a REGRA é única.
 */
export function planejarRemocao(e: EntradaDecisaoRemocao): DecisaoRemocao {
  if (e.estadoAtual === 'REMOVED') return { tipo: 'NOOP' };
  if (!e.stepUpValido) return { tipo: 'STEP_UP' };
  if (remocaoReduzAdmin(e.estadoAtual, e.papelAlvo) && e.adminsAtivos <= 1) {
    return { tipo: 'ULTIMO_ADMIN' };
  }
  return { tipo: 'APLICAR' };
}
