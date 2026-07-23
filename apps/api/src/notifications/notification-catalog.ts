/**
 * Catálogo canônico de tipos de Notificação — Story 5.6 (FR-30, RN-080..085, INV-NOTIF-01). Fonte ÚNICA e FIXA
 * do vocabulário de Notificações da Fase 1, na MESMA fonte de 5.3 (sem mecanismo paralelo). Puro, sem framework
 * e sem banco — testável sem PostgreSQL, como os catálogos de Evento (4.3), Ação (4.5) e Condição (4.4).
 *
 * Cada tipo declara, num único lugar (gate OQ-33): **como resolver destinatários** (`estrategia`), a **regra do
 * ator** (`incluirAtor`), o **padrão de preferência** + **desativável** + **obrigatório** (metadados consumidos
 * pela 5.4 — fecha DEB-5.4-TIPO-OBRIGATORIO), a **origem** (qual Épico é dono do produtor) e se já está
 * **implementado** (wirado nesta Fase) ou é apenas um SLOT declarado (E6/E8, contrato-futuro AD-11).
 *
 * **Obrigatoriedade nasce toda `false`** — não se inventa obrigatoriedade sem decisão explícita de Produto
 * (Constitution; espelha o "obrigatório vazio" da 5.4 e o "preflight vacuamente verdadeiro" da 2.10). O
 * mecanismo existe e é testável; o conjunto obrigatório é populável por decisão futura sem tocar a resolução.
 */

/** Formato estrutural de um tipo de Notificação (enum estrutural — nunca texto livre). Espelha 5.3/5.4. */
const TIPO_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Estratégia de resolução de destinatários de um tipo (gate OQ-33.a):
 * - `ALVO_DIRETO`: o produtor fornece a(s) Membership(s)-alvo do evento (ex.: o novo Responsável).
 * - `RESPONSAVEL_TAREFA_ATUAL`: lê o Responsável atual da Tarefa (nulo ⇒ sem destinatário).
 * - `PARTES_DO_CARD`: lê as partes do Card — Responsável atual + concessões diretas (`CardGrant` com `podeLer`).
 * - `SLOT`: sem produtor implementado nesta Fase (E6/E8) — resolver é erro de programação (fail-closed).
 */
export type EstrategiaDestinatarios =
  'ALVO_DIRETO' | 'RESPONSAVEL_TAREFA_ATUAL' | 'PARTES_DO_CARD' | 'SLOT';

/** Épico dono do produtor do tipo. */
export type OrigemTipo = 'E5' | 'E6' | 'E8';

/** Metadados canônicos de um tipo de Notificação. */
export interface TipoNotificacao {
  readonly tipo: string;
  /** Tipo de recurso que a Notificação referencia — roteia a revalidação de acesso (5.4). */
  readonly resourceType: 'TASK' | 'SOLICITACAO' | 'CARD' | 'RECORD' | 'ORGANIZACAO';
  readonly estrategia: EstrategiaDestinatarios;
  /** O ATOR do evento é destinatário? `false` ⇒ quem dispara não recebe da própria ação (RN-082). */
  readonly incluirAtor: boolean;
  /** Entregue por omissão quando o usuário não tem override? (metadado de preferência — 5.4). */
  readonly padraoHabilitado: boolean;
  /** O usuário pode silenciar este tipo? (`false` ⇒ tentativa de desativar → 400 na 5.4). */
  readonly podeDesativar: boolean;
  /** Aviso OBRIGATÓRIO — a preferência NUNCA o silencia. Nasce `false` (sem decisão de Produto). */
  readonly obrigatorio: boolean;
  readonly origem: OrigemTipo;
  /** Wirado (produtor real) nesta Fase? `false` = SLOT declarado (contrato-futuro E6/E8). */
  readonly implementado: boolean;
}

/**
 * O catálogo FIXO da Fase 1. Os 5 tipos de E5 são IMPLEMENTADOS (produtor wirado); os 2 slots de E6/E8 são
 * DECLARADOS (mesma fonte, sem mecanismo paralelo) mas sem produtor — o dono os implementa (AD-11).
 */
export const CATALOGO_NOTIFICACOES = [
  {
    // Designação/alteração de Responsável de Tarefa (5.1). Destinatário = o novo Responsável; ator excluído.
    tipo: 'TASK_RESPONSIBLE_ASSIGNED',
    resourceType: 'TASK',
    estrategia: 'ALVO_DIRETO',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E5',
    implementado: true,
  },
  {
    // Designação/alteração de Responsável de Solicitação (5.2). Destinatário = o novo Responsável; ator excluído.
    tipo: 'SOLICITACAO_RESPONSIBLE_ASSIGNED',
    resourceType: 'SOLICITACAO',
    estrategia: 'ALVO_DIRETO',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E5',
    implementado: true,
  },
  {
    // Designação/alteração de Responsável de Card (2.10). Destinatário = o novo Responsável; ator excluído.
    tipo: 'CARD_RESPONSIBLE_ASSIGNED',
    resourceType: 'CARD',
    estrategia: 'ALVO_DIRETO',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E5',
    implementado: true,
  },
  {
    // Tarefa atrasada (5.1). Destinatário = Responsável atual da Tarefa. Evento de SISTEMA (sem ator humano).
    tipo: 'TASK_OVERDUE',
    resourceType: 'TASK',
    estrategia: 'RESPONSAVEL_TAREFA_ATUAL',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E5',
    implementado: true,
  },
  {
    // Movimentação de Card causada por Automação (2.16 + E4). Destinatários = partes do Card (Responsável +
    // concessões). Evento de AUTOMAÇÃO (ator não-humano). O TRIGGER de motor é deferido à 5.7
    // (DEB-5.6-CARD-MOVED-AUTOMATION-WIRING); a distribuição é implementada e testável agora.
    tipo: 'CARD_MOVED_BY_AUTOMATION',
    resourceType: 'CARD',
    estrategia: 'PARTES_DO_CARD',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E5',
    implementado: true,
  },
  {
    // SLOT E6 — comando de IA aguardando aprovação. Registrado no mesmo catálogo/fonte; produtor é do E6 (AD-11).
    tipo: 'AI_COMMAND_AWAITING_APPROVAL',
    resourceType: 'CARD',
    estrategia: 'SLOT',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E6',
    implementado: false,
  },
  {
    // SLOT E8 — convite aceito. Registrado no mesmo catálogo/fonte; produtor é do E8 (AD-11).
    tipo: 'INVITE_ACCEPTED',
    resourceType: 'ORGANIZACAO',
    estrategia: 'SLOT',
    incluirAtor: false,
    padraoHabilitado: true,
    podeDesativar: true,
    obrigatorio: false,
    origem: 'E8',
    implementado: false,
  },
] as const satisfies readonly TipoNotificacao[];

export type TipoNotificacaoNome = (typeof CATALOGO_NOTIFICACOES)[number]['tipo'];

/** Índice por tipo para lookup O(1). */
const POR_TIPO: ReadonlyMap<string, TipoNotificacao> = new Map(
  CATALOGO_NOTIFICACOES.map((t): [string, TipoNotificacao] => [t.tipo, t]),
);

/** Metadados de um tipo, ou `undefined` se desconhecido (não catalogado). */
export function obterTipoNotificacao(tipo: string): TipoNotificacao | undefined {
  return POR_TIPO.get(tipo);
}

/** O `tipo` casa o formato estrutural do catálogo? (defesa antes de qualquer lookup por string do cliente). */
export function formatoTipoValido(tipo: unknown): tipo is string {
  return typeof tipo === 'string' && TIPO_RE.test(tipo);
}

/** Erro de tipo fora do catálogo / não-implementado — o serviço o traduz sem eco de payload. */
export class TipoNotificacaoInvalidoError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'TipoNotificacaoInvalidoError';
  }
}

/**
 * Fail-closed: exige que `tipo` seja um tipo do catálogo com produtor IMPLEMENTADO nesta Fase. Rejeita
 * desconhecido e SLOT (E6/E8, sem produtor). É o enforcement do produtor de distribuição (5.6) — chamar
 * `distribuir` com um tipo-slot é erro de programação, não uma entrega silenciosa.
 */
export function exigirTipoImplementado(tipo: string): TipoNotificacao {
  const meta = POR_TIPO.get(tipo);
  if (!meta) throw new TipoNotificacaoInvalidoError('tipo de Notificação desconhecido');
  if (!meta.implementado || meta.estrategia === 'SLOT') {
    throw new TipoNotificacaoInvalidoError('tipo de Notificação registrado mas ainda sem produtor');
  }
  return meta;
}
