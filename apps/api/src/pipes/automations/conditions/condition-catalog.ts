import type { Condicao } from '../automation-config';

/**
 * Catálogo canônico de tipos de CONDIÇÃO (Story 4.4 — FR-23, D4.2). Fonte ÚNICA e FIXA do vocabulário de
 * Condições da Fase 1 sobre os cinco domínios oficiais — **Card**, **Campo e valor**, **prazo e marco**,
 * **relacionamento** e **Fase**. Puro, sem framework/banco — testável sem PostgreSQL, como `event-catalog.ts`
 * (4.3) e `automation-config.ts` (4.1).
 *
 * **Por que FECHADO (fail-closed):** um tipo/operador aberto deixaria o Admin configurar uma Condição que o
 * motor (4.6) nunca consegue avaliar — e uma Condição não-avaliável cai em **falso** (não dispara), então uma
 * Automação silenciosamente nunca agiria. Rejeitar na configuração (400) é honesto; aceitar e falhar depois,
 * não. O enforcement vive no serviço de Automação (como o do catálogo de Eventos), não no núcleo estrutural
 * da 4.1 (que aceita qualquer `tipo`/`operador` por desenho — a 4.1 valida FORMA, a 4.4 valida VOCABULÁRIO).
 *
 * **Operadores por tipo de Campo REUSAM o Form Builder** (D4.2, gate de Arquitetura): para as Condições de
 * valor (`CARD_FIELD_VALUE`/`RECORD_FIELD_VALUE`), a categoria de comparação e a semântica saem de
 * `categoriaDeCampo` (`record-query.core.ts`, 3.5) — NÃO há um segundo catálogo de operadores. Aqui a
 * validação de CONFIGURAÇÃO só garante que o `operador` é um operador de Campo CONHECIDO; a compatibilidade
 * FINA operador↔tipo-do-Campo é fail-closed na AVALIAÇÃO (o tipo do Campo vive no snapshot, 4.6), exatamente
 * como a consulta de Registros valida contra a definição viva (3.5).
 */

/** Os cinco domínios oficiais de Condição (Story §1355). */
export type DominioCondicao = 'CARD' | 'FIELD' | 'DEADLINE' | 'LINK' | 'PHASE';

/** Tipo de referência exigido/aceito por uma Condição (subconjunto de `TipoDeReferencia` da 4.1). */
type TipoRefCondicao = 'PHASE' | 'FIELD' | 'RECORD' | 'DATABASE';

/** Metadados de um tipo de Condição do catálogo. */
export interface CondicaoCatalogo {
  readonly tipo: string;
  readonly dominio: DominioCondicao;
  /**
   * Operadores permitidos na CONFIGURAÇÃO. Para as Condições de valor é a UNIÃO dos operadores de Campo (a
   * compatibilidade por tipo é resolvida na avaliação); para os demais domínios é o conjunto exato e fechado.
   */
  readonly operadores: ReadonlySet<string>;
  /** Referência (por `Field.id`/`Phase.id`/...) EXIGIDA — exatamente uma deste tipo. `null` = nenhuma exigida. */
  readonly refExigida: TipoRefCondicao | null;
  /** Valores literais admissíveis (enum de domínio), quando o operador os usa. `null` = valor livre/ausente. */
  readonly valoresAdmissiveis: ReadonlySet<string> | null;
}

// ── Operadores canônicos ────────────────────────────────────────────────────────────────────────────

/**
 * UNIÃO dos operadores de Campo, derivada das categorias do Form Builder/consulta (3.5) mais os operadores
 * EXPLÍCITOS de nulo/vazio/mudança que o domínio de Condição exige (Story §1357/§1360: "comportamento
 * explícito para nulo, vazio e Campo ausente"; "operadores de mudança consultam valor anterior e posterior").
 * NÃO é um catálogo paralelo: é o mesmo espaço de operadores de 3.5 (`contem`/`igual`/`maior`/`menor`/
 * `intervalo`/`contemOpcao`) acrescido de `diferente`/`preenchido`/`vazio`/`mudou`, todos compatíveis.
 */
export const OPERADORES_CAMPO: ReadonlySet<string> = new Set([
  'igual',
  'diferente',
  'contem',
  'maior',
  'menor',
  'intervalo',
  'contemOpcao',
  'preenchido',
  'vazio',
  'mudou',
]);

const OP_IGUALDADE: ReadonlySet<string> = new Set(['igual', 'diferente']);

/** Estados de ciclo de vida do Card (2.11) admissíveis em `CARD_LIFECYCLE_STATE`. */
export const ESTADOS_CARD: ReadonlySet<string> = new Set(['ATIVO', 'FINALIZADO', 'ARQUIVADO']);
/** Veredictos de saúde (2.13) admissíveis em `CARD_HEALTH`. */
export const SAUDES_CARD: ReadonlySet<string> = new Set(['ok', 'atrasado', 'vencido', 'expirado']);
/** Marcos temporais (2.12) admissíveis em `CARD_MILESTONE`. */
export const MARCOS_CARD: ReadonlySet<string> = new Set(['esperado', 'vencimento', 'expiracao']);

// ── O catálogo FIXO ─────────────────────────────────────────────────────────────────────────────────

/**
 * O catálogo completo da Fase 1 — 7 tipos cobrindo os 5 domínios. Fechado: o que não está aqui é rejeitado.
 * `OU/OR` e aninhamento ficam FORA da Fase 1 (Story §1356) — não há tipo "grupo" nem operador lógico; a
 * combinação é sempre AND, no avaliador.
 */
export const CONDICOES_CATALOGO = [
  // Domínio Card — estado/ciclo de vida e saúde.
  {
    tipo: 'CARD_LIFECYCLE_STATE',
    dominio: 'CARD',
    operadores: OP_IGUALDADE,
    refExigida: null,
    valoresAdmissiveis: ESTADOS_CARD,
  },
  {
    tipo: 'CARD_HEALTH',
    dominio: 'CARD',
    operadores: OP_IGUALDADE,
    refExigida: null,
    valoresAdmissiveis: SAUDES_CARD,
  },
  // Domínio Fase — Fase atual do Card (referência por `Phase.id`).
  {
    tipo: 'CARD_PHASE',
    dominio: 'PHASE',
    operadores: OP_IGUALDADE,
    refExigida: 'PHASE',
    valoresAdmissiveis: null,
  },
  // Domínio Campo e valor — valor de Campo do Card / do Registro (referência por `Field.id`).
  {
    tipo: 'CARD_FIELD_VALUE',
    dominio: 'FIELD',
    operadores: OPERADORES_CAMPO,
    refExigida: 'FIELD',
    valoresAdmissiveis: null,
  },
  {
    tipo: 'RECORD_FIELD_VALUE',
    dominio: 'FIELD',
    operadores: OPERADORES_CAMPO,
    refExigida: 'FIELD',
    valoresAdmissiveis: null,
  },
  // Domínio prazo e marco — um marco temporal foi atingido no instante do Evento.
  {
    tipo: 'CARD_MILESTONE',
    dominio: 'DEADLINE',
    operadores: new Set(['atingido', 'nao_atingido']),
    refExigida: null,
    valoresAdmissiveis: MARCOS_CARD,
  },
  // Domínio relacionamento — existência de vínculo Card↔Registro (3.9).
  {
    tipo: 'CARD_HAS_RECORD_LINK',
    dominio: 'LINK',
    operadores: new Set(['existe', 'nao_existe']),
    refExigida: null,
    valoresAdmissiveis: null,
  },
] as const satisfies readonly CondicaoCatalogo[];

/** Índice por tipo para lookup O(1). */
const POR_TIPO: ReadonlyMap<string, CondicaoCatalogo> = new Map(
  CONDICOES_CATALOGO.map((c): [string, CondicaoCatalogo] => [c.tipo, c]),
);

/** Conjunto dos tipos de Condição válidos na Fase 1. */
export const TIPOS_CONDICAO: ReadonlySet<string> = new Set(CONDICOES_CATALOGO.map((c) => c.tipo));

export type CondicaoTipo = (typeof CONDICOES_CATALOGO)[number]['tipo'];

/** Metadados de um tipo de Condição, ou `undefined` se desconhecido. */
export function obterCondicaoCatalogo(tipo: string): CondicaoCatalogo | undefined {
  return POR_TIPO.get(tipo);
}

/** Erro de Condição fora do catálogo. O serviço o traduz em 400 sanitizado, sem eco do payload. */
export class CondicaoForaDoCatalogoError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'CondicaoForaDoCatalogoError';
  }
}

/** Quantas referências de um dado tipo a Condição carrega. */
function contarRefs(c: Condicao, tipo: TipoRefCondicao): number {
  return c.refs.filter((r) => r.tipo === tipo).length;
}

/**
 * Valida UMA Condição contra o catálogo (fail-closed): `tipo` conhecido; `operador` permitido para o tipo;
 * a referência EXIGIDA presente em número exato (exatamente uma); e, quando o operador USA um valor literal
 * de enum de domínio, que o valor está entre os admissíveis. NÃO valida a compatibilidade fina operador↔tipo
 * de Campo (isso é fail-closed na avaliação, com o tipo do Campo do snapshot) nem que a referência é
 * ALCANÇÁVEL (isso é `revalidarReferencias`, sob RLS). Lança `CondicaoForaDoCatalogoError` no 1º problema.
 */
function validarCondicao(c: Condicao, onde: string): void {
  const meta = POR_TIPO.get(c.tipo);
  if (!meta) throw new CondicaoForaDoCatalogoError(`${onde}: tipo de Condição desconhecido`);

  if (!meta.operadores.has(c.operador)) {
    throw new CondicaoForaDoCatalogoError(`${onde}: operador inválido para o tipo de Condição`);
  }

  if (meta.refExigida !== null && contarRefs(c, meta.refExigida) !== 1) {
    throw new CondicaoForaDoCatalogoError(
      `${onde}: exige exatamente uma referência do tipo esperado`,
    );
  }

  // Operadores que USAM valor literal de enum (igualdade / marco): o valor precisa ser admissível. Os
  // operadores de presença/mudança (`preenchido`/`vazio`/`mudou`) e de existência de vínculo não usam valor.
  const usaValorEnum =
    meta.valoresAdmissiveis !== null &&
    (OP_IGUALDADE.has(c.operador) || c.operador === 'atingido' || c.operador === 'nao_atingido');
  if (usaValorEnum) {
    if (typeof c.valor !== 'string' || !meta.valoresAdmissiveis!.has(c.valor)) {
      throw new CondicaoForaDoCatalogoError(
        `${onde}: valor fora do domínio para o tipo de Condição`,
      );
    }
  }
}

/**
 * Enforcement fail-closed do catálogo de Condições — chamado pelo serviço de Automação DEPOIS da validação
 * estrutural da 4.1 e do catálogo de Eventos (4.3). Valida cada Condição; array vazio é legítimo (ausência de
 * Condição = aprovação direta, D4.1). É o CA de configuração da 4.4.
 */
export function exigirCondicoesNoCatalogo(condicoes: readonly Condicao[]): void {
  condicoes.forEach((c, i) => validarCondicao(c, `condicoes[${i}]`));
}
