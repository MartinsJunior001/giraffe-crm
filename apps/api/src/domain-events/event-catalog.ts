/**
 * Catálogo canônico de Eventos (gatilhos) — Story 4.3 (FR-21, RN-100, D4.1).
 *
 * É a fonte ÚNICA e FIXA do vocabulário de Eventos da Fase 1: o que uma Automação pode escolher como gatilho
 * (`Automation.quando.tipo`) e o que o envelope canônico (`event-envelope.ts`) carrega em `eventType`. Sem
 * framework, sem banco — puro, testável sem PostgreSQL, como `automation-config.ts` (4.1).
 *
 * **Por que um catálogo FECHADO:** um gatilho aberto (qualquer string) deixaria o usuário configurar uma
 * Automação que o motor (4.6) nunca dispara, porque não há fato canônico correspondente. Fail-closed: o que
 * não está aqui é rejeitado (CA1). A 4.1 deixou `quando.tipo` deliberadamente estrutural (aceitava qualquer
 * texto) exatamente para esta Story fechar o catálogo — o enforcement vive no serviço de Automação, não no
 * núcleo estrutural da 4.1.
 *
 * **Ancoragem em fatos REAIS (Story §1327/§1341):** cada tipo NÚCLEO corresponde a um fato JÁ persistido no
 * domínio (Card/Registro/vínculo). O catálogo NÃO inventa Eventos — ele nomeia os que existem. A EMISSÃO de
 * cada tipo é fiada no seu produtor quando há consumidor concreto (AD-11); a 4.3 fia apenas `CARD_CREATED`
 * (os dois sítios de criação de Card), e os demais ficam declarados como contrato até 4.6+ os consumir.
 */

/** Metadados de um tipo de Evento do catálogo. */
export interface EventoCatalogo {
  /** Identificador estável do tipo (vocabulário canônico, EN — alinhado a `CARD_MOVED` da 2.16). */
  readonly tipo: string;
  /** O tipo de recurso principal que o Evento descreve (para `resourceType` do envelope). */
  readonly resourceType: 'CARD' | 'RECORD' | 'CARD_RECORD_LINK';
  /** O Evento sempre carrega `pipeId`? (Card/vínculo sim; Registro puro não — Story §1339). */
  readonly temPipe: boolean;
  /**
   * Origem do catálogo. `CORE` = núcleo E4 SELECIONÁVEL na Fase 1. `EXTENSION` = ponto de extensão de E5/E6,
   * DECLARADO como contrato mas NÃO selecionável até a Story da extensão o confirmar (Story §1338).
   */
  readonly origem: 'CORE' | 'EXTENSION';
  /** Extensão indisponível de forma permanente na Fase 1 (ex.: `EMAIL_RECEIVED`). Nunca selecionável. */
  readonly indisponivel?: boolean;
}

/**
 * NÚCLEO E4 — o catálogo fixo e completo da Fase 1 (Story §1328–1337). 16 tipos, cada um ancorado a um fato
 * canônico real. `CARD_MOVED` é o mesmo evento canônico da 2.16 (`MovementEvent`): entrada e saída de Fase
 * derivam DELE, sem duplicidade técnica (Story §1339) — a 4.3 NÃO re-emite movimentação.
 */
export const EVENTOS_NUCLEO = [
  { tipo: 'CARD_CREATED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_MOVED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_HEALTH_CHANGED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_FINALIZED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_ARCHIVED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_REOPENED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_RESTORED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_RESPONSIBLE_CHANGED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  { tipo: 'CARD_FIELD_VALUE_CHANGED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
  {
    tipo: 'CARD_RECORD_LINK_CREATED',
    resourceType: 'CARD_RECORD_LINK',
    temPipe: true,
    origem: 'CORE',
  },
  {
    tipo: 'CARD_RECORD_LINK_REMOVED',
    resourceType: 'CARD_RECORD_LINK',
    temPipe: true,
    origem: 'CORE',
  },
  { tipo: 'RECORD_CREATED', resourceType: 'RECORD', temPipe: false, origem: 'CORE' },
  { tipo: 'RECORD_ARCHIVED', resourceType: 'RECORD', temPipe: false, origem: 'CORE' },
  { tipo: 'RECORD_RESTORED', resourceType: 'RECORD', temPipe: false, origem: 'CORE' },
  { tipo: 'RECORD_FIELD_VALUE_CHANGED', resourceType: 'RECORD', temPipe: false, origem: 'CORE' },
  { tipo: 'PHASE_FORM_SUBMITTED', resourceType: 'CARD', temPipe: true, origem: 'CORE' },
] as const satisfies readonly EventoCatalogo[];

/**
 * Pontos de EXTENSÃO E5/E6 — declarados como CONTRATO (Story §1338), NÃO selecionáveis na Fase 1. E5 registra
 * Tarefa criada/concluída/atrasada; E6 registra E-mail enviado. `EMAIL_RECEIVED` permanece INDISPONÍVEL
 * (recebimento/sincronização fora da Fase 1). Ficam aqui para que o catálogo seja explícito sobre o que EXISTE
 * como contrato e o que é proibido — não para habilitá-los.
 */
export const EVENTOS_EXTENSAO = [
  { tipo: 'TASK_CREATED', resourceType: 'CARD', temPipe: true, origem: 'EXTENSION' },
  { tipo: 'TASK_COMPLETED', resourceType: 'CARD', temPipe: true, origem: 'EXTENSION' },
  { tipo: 'TASK_OVERDUE', resourceType: 'CARD', temPipe: true, origem: 'EXTENSION' },
  { tipo: 'EMAIL_SENT', resourceType: 'CARD', temPipe: true, origem: 'EXTENSION' },
  {
    tipo: 'EMAIL_RECEIVED',
    resourceType: 'CARD',
    temPipe: true,
    origem: 'EXTENSION',
    indisponivel: true,
  },
] as const satisfies readonly EventoCatalogo[];

/** Índice por tipo (núcleo + extensão) para lookup O(1). */
const POR_TIPO: ReadonlyMap<string, EventoCatalogo> = new Map<string, EventoCatalogo>(
  [...EVENTOS_NUCLEO, ...EVENTOS_EXTENSAO].map((e): [string, EventoCatalogo] => [e.tipo, e]),
);

/** Conjunto dos tipos NÚCLEO — os SELECIONÁVEIS na Fase 1. */
export const TIPOS_NUCLEO: ReadonlySet<string> = new Set<string>(EVENTOS_NUCLEO.map((e) => e.tipo));

export type EventoNucleoTipo = (typeof EVENTOS_NUCLEO)[number]['tipo'];

/** Erro de gatilho fora do catálogo. O serviço o traduz em 400 sanitizado, sem eco do payload. */
export class EventoForaDoCatalogoError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'EventoForaDoCatalogoError';
  }
}

/** Metadados de um tipo, ou `undefined` se desconhecido. */
export function obterEventoCatalogo(tipo: string): EventoCatalogo | undefined {
  return POR_TIPO.get(tipo);
}

/** Um tipo é SELECIONÁVEL como gatilho na Fase 1? Só o núcleo E4; extensões e desconhecidos não. */
export function ehEventoSelecionavel(tipo: string): boolean {
  return TIPOS_NUCLEO.has(tipo);
}

/**
 * Fail-closed: exige que `tipo` seja um Evento NÚCLEO selecionável. Rejeita desconhecido, ponto de extensão
 * ainda não confirmado (E5/E6) e o indisponível permanente (`EMAIL_RECEIVED`) — cada um com um motivo
 * distinto, sanitizado (sem eco do payload). É o enforcement do CA1, chamado pelo serviço de Automação após a
 * validação estrutural da 4.1.
 */
export function exigirEventoNoCatalogo(tipo: string): void {
  const meta = POR_TIPO.get(tipo);
  if (!meta) {
    throw new EventoForaDoCatalogoError('tipo de Evento desconhecido');
  }
  if (meta.indisponivel) {
    throw new EventoForaDoCatalogoError('tipo de Evento indisponível na Fase 1');
  }
  if (meta.origem === 'EXTENSION') {
    throw new EventoForaDoCatalogoError('tipo de Evento de extensão ainda não disponível');
  }
}
