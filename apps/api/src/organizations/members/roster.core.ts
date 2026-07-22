import type { MembershipRole, MembershipState } from './membership-role.core';

/**
 * Núcleo PURO do roster (Story 8.7) — sem framework, sem banco. Recebe o estado corrente como DADO e
 * devolve a DECISÃO: quais AÇÕES aparecem para cada linha (capacidades) e como normalizar a paginação.
 *
 * Ser puro é o que permite provar em unidade — sem PostgreSQL — a regra sensível do roster: a **proteção
 * do último Administrador** nunca apresenta como executável uma ação que o encerramento/rebaixamento
 * bloquearia (AC-2). As capacidades aqui são de APRESENTAÇÃO: a autoridade real é sempre revalidada no
 * disparo, pela Story proprietária (papel 8.4; suspensão/reativação 8.5; remoção 8.6). Reflexo ≠ execução.
 */

/** Teto rígido de página do roster (espelha 2.9/3.5 — NFR-3/4). Nunca devolver a Organização inteira. */
export const ROSTER_TAKE_MAX = 100;
/** Página default quando o cliente não pede `take`. */
export const ROSTER_TAKE_DEFAULT = 50;
/** Limite de caracteres do termo de busca — corta entrada absurda antes de tocar o banco. */
export const ROSTER_BUSCA_MAX = 200;

/**
 * As capacidades EFETIVAS de ação sobre uma Membership, derivadas do estado + papel + contagem de
 * Admins ativos + identidade do ator. Só aparecem na visão do Admin; a UI mostra apenas o permitido.
 */
export interface CapacidadesMembro {
  /** Alterar papel (8.4) — só Membership ATIVA; o ÚLTIMO Admin não tem alteração válida (só rebaixaria). */
  podeAlterarPapel: boolean;
  /** Suspender (8.5) — só ATIVA, não o próprio ator, e nunca o ÚLTIMO Admin. */
  podeSuspender: boolean;
  /** Reativar (8.5) — só a partir de SUSPENSA. */
  podeReativar: boolean;
  /** Remover (8.6) — qualquer estado não terminal (≠ REMOVED), nunca o ÚLTIMO Admin. */
  podeRemover: boolean;
}

/** A entrada mínima para decidir as capacidades de UMA linha do roster. */
export interface EntradaCapacidades {
  readonly role: MembershipRole;
  readonly state: MembershipState;
  /** A Membership é do PRÓPRIO ator que consulta o roster? (autossuspensão vedada — 8.5). */
  readonly ehProprio: boolean;
  /** Admins ATIVOS na Organização (inclui esta linha se ela for Admin ativo). Gatilho da proteção. */
  readonly adminsAtivos: number;
}

/**
 * Esta linha é o ÚLTIMO Admin ativo? — o gatilho da proteção do último Administrador (INV-ADMIN-01).
 * Um Admin ATIVO quando `adminsAtivos <= 1` é o único que resta: rebaixá-lo/suspendê-lo/removê-lo
 * deixaria a Organização sem Admin. A mesma regra que os núcleos de 8.4/8.5 reavaliam sob `FOR UPDATE`
 * no disparo; aqui ela só decide o que a UI OFERECE (fail-closed: na dúvida, não oferece).
 */
export function ehUltimoAdminAtivo(e: {
  role: MembershipRole;
  state: MembershipState;
  adminsAtivos: number;
}): boolean {
  return e.role === 'ADMIN' && e.state === 'ACTIVE' && e.adminsAtivos <= 1;
}

/**
 * Decide, FAIL-CLOSED, quais ações o roster apresenta como executáveis para uma linha. Espelha as
 * recusas dos núcleos de 8.4/8.5/8.6 sem duplicar a REGRA de negócio: aqui só se decide o que MOSTRAR.
 */
export function capacidadesDoMembro(e: EntradaCapacidades): CapacidadesMembro {
  const ultimoAdmin = ehUltimoAdminAtivo(e);
  return {
    // O último Admin só teria uma alteração de papel possível: um rebaixamento — que a proteção barra.
    // Logo, não há alteração válida a oferecer para ele (fail-closed).
    podeAlterarPapel: e.state === 'ACTIVE' && !ultimoAdmin,
    podeSuspender: e.state === 'ACTIVE' && !e.ehProprio && !ultimoAdmin,
    podeReativar: e.state === 'SUSPENDED',
    podeRemover: e.state !== 'REMOVED' && !ultimoAdmin,
  };
}

/**
 * Normaliza a paginação offset (comum a membros e convites): `skip >= 0`, `take` em `[1, MAX]` com
 * default. Entradas fora do contrato são CLAMPADAS (não lançam) — paginação é robustez, não validação
 * de segurança; o que precisa lançar (estado/papel inválidos) lança no DTO.
 */
export function normalizarPaginacao(skip: unknown, take: unknown): { skip: number; take: number } {
  const skipN = inteiroNaoNegativo(skip) ?? 0;
  const takeN = inteiroNaoNegativo(take);
  const takeClamp =
    takeN === undefined ? ROSTER_TAKE_DEFAULT : Math.min(Math.max(takeN, 1), ROSTER_TAKE_MAX);
  return { skip: skipN, take: takeClamp };
}

/** Converte para inteiro não-negativo, ou `undefined` se não for um inteiro não-negativo válido. */
function inteiroNaoNegativo(v: unknown): number | undefined {
  if (typeof v !== 'string' && typeof v !== 'number') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

/** Um Convite está EXPIRADO de fato? — PENDING cujo prazo já passou (não há agendador que vire o estado). */
export function conviteExpirado(state: string, expiresAt: Date, agora: Date): boolean {
  return state === 'PENDING' && expiresAt.getTime() < agora.getTime();
}
