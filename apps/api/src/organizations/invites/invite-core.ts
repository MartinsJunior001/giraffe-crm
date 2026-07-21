/**
 * Núcleo PURO do Convite (Story 8.2) — ciclo de vida, unicidade, conflitos e política de rate-limit,
 * derivado direto das decisões G2 (Produto/Segurança). Sem banco, sem SDK, sem Nest: os invariantes
 * são provados em teste de unidade, e o serviço apenas os aplica. Espelha o padrão de
 * `record-lifecycle.transitions.ts` (3.4).
 *
 * **Nenhum número aqui é inventado** — todos vêm da decisão material do dono registrada na spec da 8.2.
 */

// ── Ciclo de vida do Convite (D5.1) ──────────────────────────────────────────────────────────────
// Estados terminais (ACEITO/EXPIRADO/CANCELADO) NÃO voltam a PENDING (epics §585).
export type EstadoConvite = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';

/** Papel inicial concedido pelo Convite. Teto AD-9 aplicado no serviço, não aqui. */
export type PapelConvite = 'ADMIN' | 'MEMBER' | 'GUEST';

// ── G2: validade e cooldown ──────────────────────────────────────────────────────────────────────
/** Validade do Convite: 7 dias corridos desde a emissão. Reenvio reinicia este prazo. */
export const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;
/** Cooldown mínimo entre reenvios do MESMO Convite. */
export const COOLDOWN_REENVIO_MS = 60 * 1000;

// ── G2: rate limits (emissão/reenvio salvo indicação) ────────────────────────────────────────────
export const RATE_LIMITS = {
  emissaoPorAdminPorHora: 10,
  emissaoPorOrgPorDia: 100,
  emissaoPorDestinatarioNaOrgPorDia: 5,
  aceitacaoPorIpPor15min: 20,
  aceitacaoPorConvitePor15min: 5,
} as const;

export const JANELA = {
  horaMs: 60 * 60 * 1000,
  diaMs: 24 * 60 * 60 * 1000,
  quinzeMinMs: 15 * 60 * 1000,
} as const;

/**
 * Normaliza o e-mail para a chave de unicidade `(orgId, normalizedEmail)`.
 *
 * Trim + minúsculas. Deliberadamente conservador: NÃO remove pontos nem sufixos `+tag` (isso é
 * política específica de provedor e trataria `a.b@x` = `ab@x`, o que nem todo mundo quer). A regra de
 * unicidade compara a forma normalizada; o e-mail original de exibição é preservado à parte pelo
 * serviço, se necessário.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Formato de e-mail validado NO SERVIDOR (a UI não é autoridade). Conservador, sem aceitar espaços. */
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function emailValido(email: string): boolean {
  const e = email.trim();
  return e.length <= 254 && RE_EMAIL.test(e);
}

/** Um Convite já existente na Organização, do ponto de vista da decisão de conflito. */
export interface ConviteExistente {
  estado: EstadoConvite;
}

/** Estado de Membership do e-mail na Organização, para a decisão de conflito. */
export type EstadoMembershipAlvo = 'ACTIVE' | 'SUSPENDED' | 'REMOVED' | 'NONE';

/**
 * Resultado da decisão de criação de Convite, dado o contexto de conflito. Puro: o serviço traduz
 * cada veredito no efeito (criar linha / 409 / etc.), mas a REGRA vive aqui.
 */
export type DecisaoCriacao = { tipo: 'criar' } | { tipo: 'conflito'; motivo: ConflitoConvite };

export type ConflitoConvite =
  /** Já é membro ativo — bloquear (epics §616). */
  | 'JA_MEMBRO_ATIVO'
  /** Membership suspensa — bloquear e orientar reativação. */
  | 'MEMBRO_SUSPENSO'
  /** Já há Convite PENDING — usar reenviar/cancelar; não cria outro (unicidade G2). */
  | 'CONVITE_PENDENTE_EXISTE';

/**
 * Decide se um novo Convite pode ser criado (G2 unicidade + conflitos de associação, epics §616).
 *
 * Precedência das checagens:
 *   1. Membership ATIVA → `JA_MEMBRO_ATIVO` (já é membro).
 *   2. Membership SUSPENSA → `MEMBRO_SUSPENSO` (orientar reativação; não convidar por cima).
 *   3. Convite PENDING existente → `CONVITE_PENDENTE_EXISTE` (renovar é reenvio, não novo registro).
 *   4. REMOVED / NONE, sem pendente → `criar`.
 *
 * `encerrada (REMOVED)` e `outra Organização` (que nem chega aqui, pois a checagem é org-scoped) NÃO
 * conflitam — permitem novo Convite.
 */
export function decidirCriacao(
  membership: EstadoMembershipAlvo,
  pendenteExistente: boolean,
): DecisaoCriacao {
  if (membership === 'ACTIVE') return { tipo: 'conflito', motivo: 'JA_MEMBRO_ATIVO' };
  if (membership === 'SUSPENDED') return { tipo: 'conflito', motivo: 'MEMBRO_SUSPENSO' };
  if (pendenteExistente) return { tipo: 'conflito', motivo: 'CONVITE_PENDENTE_EXISTE' };
  return { tipo: 'criar' };
}

/** Instante de expiração a partir da emissão. Reenvio recalcula com `agora` novo (reinicia o prazo). */
export function calcularExpiracao(emitidoEm: Date): Date {
  return new Date(emitidoEm.getTime() + VALIDADE_CONVITE_MS);
}

/**
 * O Convite está expirado no instante `agora`?
 *
 * Expiração é DERIVADA do prazo e confirmada no servidor (epics §585): um PENDING cujo `expiraEm` já
 * passou é tratado como EXPIRED na leitura/validação, mesmo que a linha ainda diga PENDING (a
 * materialização do estado é responsabilidade do serviço/job, não invalida a derivação).
 */
export function estaExpirado(expiraEm: Date, agora: Date): boolean {
  return agora.getTime() >= expiraEm.getTime();
}

/** Um reenvio é permitido agora? (cooldown de 60s desde o último envio do mesmo Convite — G2.) */
export function podeReenviar(ultimoEnvioEm: Date, agora: Date): boolean {
  return agora.getTime() - ultimoEnvioEm.getTime() >= COOLDOWN_REENVIO_MS;
}

// ── Aceitação: validade do token apresentado ─────────────────────────────────────────────────────
export type MotivoTokenInvalido = 'EXPIRADO' | 'REVOGADO' | 'JA_USADO' | 'NAO_ENCONTRADO';

/**
 * O Convite localizado (por hash do token) é aceitável agora?
 *
 * Resposta NUNCA revela se o e-mail tem conta (G2): o serviço traduz qualquer `invalido` numa resposta
 * uniforme. Aqui só decidimos a validade a partir do estado + expiração.
 */
export function validarParaAceite(
  estado: EstadoConvite,
  expiraEm: Date,
  agora: Date,
): { ok: true } | { ok: false; motivo: MotivoTokenInvalido } {
  if (estado === 'ACCEPTED') return { ok: false, motivo: 'JA_USADO' };
  if (estado === 'CANCELLED') return { ok: false, motivo: 'REVOGADO' };
  if (estado === 'EXPIRED') return { ok: false, motivo: 'EXPIRADO' };
  // PENDING mas com prazo vencido → tratado como expirado (derivação, epics §585).
  if (estaExpirado(expiraEm, agora)) return { ok: false, motivo: 'EXPIRADO' };
  return { ok: true };
}
