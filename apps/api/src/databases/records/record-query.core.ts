/**
 * Núcleo PURO da consulta de Registros (Story 3.5) — valida a query (filtros/ordenação) CONTRA a definição
 * (Campos ativos) e devolve um **plano** estruturado que o serviço traduz em SQL parametrizado. Sem banco, sem
 * framework: os invariantes de segurança da consulta (allowlist de Campos por `Field.id`, allowlist de operadores
 * por tipo, coerção/validação de valor por tipo, fail-closed) vivem aqui e são provados em unidade.
 *
 * NENHUM `Field.id`, operador ou valor do cliente vira SQL diretamente: o núcleo só devolve identificadores
 * validados (UUIDs de Campos que EXISTEM) e operadores de uma allowlist fechada; o serviço parametriza tudo.
 * O filtro/ordenação sobre Campo do tipo Arquivo (`FILE`) é **rejeitado** (gated até 3.7/3.8 — AD-28).
 */

/** Erro de consulta inválida — o serviço traduz em 400 determinístico (sem ecoar o valor). */
export class ConsultaInvalidaError extends Error {}

/** O que a validação observa de um Campo da definição. */
export interface CampoDef {
  id: string;
  type: string;
}

/** Categoria de filtro derivada do `FieldType`. `FILE` é gated (sem categoria consultável). */
export type Categoria = 'texto' | 'numero' | 'data' | 'selecao' | 'booleano';

const CATEGORIA: Record<string, Categoria> = {
  TEXT_SHORT: 'texto',
  TEXT_LONG: 'texto',
  EMAIL: 'texto',
  PHONE: 'texto',
  URL: 'texto',
  NUMBER: 'numero',
  DATE: 'data',
  DATETIME: 'data',
  SELECT_SINGLE: 'selecao',
  SELECT_MULTI: 'selecao',
  BOOLEAN: 'booleano',
  // FILE: gated — ausente de propósito (filtro/ordenação rejeitados).
};

/** Operadores permitidos por categoria (allowlist fechada). */
const OPS: Record<Categoria, Set<string>> = {
  texto: new Set(['contem', 'igual']),
  numero: new Set(['igual', 'maior', 'menor', 'intervalo']),
  data: new Set(['igual', 'maior', 'menor', 'intervalo']),
  selecao: new Set(['contemOpcao', 'igual']),
  booleano: new Set(['igual']),
};

export interface FiltroEntrada {
  fieldId: unknown;
  op: unknown;
  valor: unknown;
}

/** Filtro validado: categoria + operador de allowlist + valor(es) já validado(s) por tipo. */
export interface FiltroPlano {
  fieldId: string;
  categoria: Categoria;
  op: string;
  /** Para `intervalo`: [min, max]. Para os demais: [valor]. Strings/números/booleanos já validados. */
  valores: (string | number | boolean)[];
}

export interface OrderByPlano {
  /** `createdAt` (default) ou um `Field.id` validado. */
  campo: { tipo: 'createdAt' } | { tipo: 'campo'; fieldId: string; categoria: Categoria };
  dir: 'ASC' | 'DESC';
}

export interface QueryEntrada {
  filtros?: FiltroEntrada[];
  orderByFieldId?: string | null;
  dir?: string | null;
  take?: number;
  skip?: number;
  incluirArquivados?: boolean;
}

export interface QueryPlano {
  filtros: FiltroPlano[];
  orderBy: OrderByPlano;
  take: number;
  skip: number;
  incluirArquivados: boolean;
}

const TAKE_MAX = 100;
const TAKE_DEFAULT = 50;
const VALOR_STRING_MAX = 1_000;

/**
 * Categoria consultável de um `FieldType`, ou `null` se o tipo não é comparável (hoje só `FILE`, gated —
 * AD-28). FONTE ÚNICA do mapeamento tipo-de-Campo → semântica de comparação: além da consulta de Registros
 * (3.5), a avaliação de Condições (Story 4.4) reusa ESTA função — "sem segundo catálogo de operadores por
 * tipo" (D4.2, gate de Arquitetura). Mudar a categoria de um tipo aqui muda os dois consumidores de uma vez.
 */
export function categoriaDeCampo(type: string): Categoria | null {
  return CATEGORIA[type] ?? null;
}

/** Índice `Field.id → categoria` a partir da definição; `FILE` fica de fora (gated). */
function indexar(campos: CampoDef[]): Map<string, Categoria> {
  const idx = new Map<string, Categoria>();
  for (const c of campos) {
    const cat = CATEGORIA[c.type];
    if (cat) idx.set(c.id, cat);
  }
  return idx;
}

/** Valida e coage UM valor escalar para a categoria. Lança `ConsultaInvalidaError`. */
function valorEscalar(cat: Categoria, valor: unknown): string | number | boolean {
  if (cat === 'numero') {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new ConsultaInvalidaError('valor de filtro deve ser número');
    }
    return valor;
  }
  if (cat === 'booleano') {
    if (typeof valor !== 'boolean')
      throw new ConsultaInvalidaError('valor de filtro deve ser booleano');
    return valor;
  }
  // texto | data | selecao → string. `data` é validada como data ISO (coerção segura para `::timestamptz`).
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > VALOR_STRING_MAX) {
    throw new ConsultaInvalidaError('valor de filtro deve ser texto não vazio');
  }
  if (cat === 'data' && Number.isNaN(Date.parse(valor))) {
    throw new ConsultaInvalidaError('valor de filtro deve ser uma data válida');
  }
  return valor;
}

/** Valida um filtro contra a definição. */
function validarFiltro(f: FiltroEntrada, idx: Map<string, Categoria>): FiltroPlano {
  if (typeof f.fieldId !== 'string' || !idx.has(f.fieldId)) {
    // Campo desconhecido OU gated (FILE não está no índice) → fail-closed.
    throw new ConsultaInvalidaError('filtro sobre Campo desconhecido ou não suportado');
  }
  const categoria = idx.get(f.fieldId)!;
  if (typeof f.op !== 'string' || !OPS[categoria].has(f.op)) {
    throw new ConsultaInvalidaError('operador inválido para o tipo do Campo');
  }
  if (f.op === 'intervalo') {
    if (!Array.isArray(f.valor) || f.valor.length !== 2) {
      throw new ConsultaInvalidaError('intervalo exige [min, max]');
    }
    const min = valorEscalar(categoria, f.valor[0]);
    const max = valorEscalar(categoria, f.valor[1]);
    return { fieldId: f.fieldId, categoria, op: f.op, valores: [min, max] };
  }
  return { fieldId: f.fieldId, categoria, op: f.op, valores: [valorEscalar(categoria, f.valor)] };
}

/**
 * Planeja a consulta: valida `take`/`skip`, cada filtro (allowlist de Campo/operador/valor) e a ordenação (Campo
 * da definição ou `createdAt`). Fail-closed — qualquer entrada fora da allowlist lança `ConsultaInvalidaError`.
 */
export function planejarConsulta(campos: CampoDef[], entrada: QueryEntrada): QueryPlano {
  const idx = indexar(campos);

  const take = entrada.take ?? TAKE_DEFAULT;
  if (!Number.isInteger(take) || take < 1 || take > TAKE_MAX) {
    throw new ConsultaInvalidaError('take deve ser inteiro entre 1 e 100');
  }
  const skip = entrada.skip ?? 0;
  if (!Number.isInteger(skip) || skip < 0) {
    throw new ConsultaInvalidaError('skip deve ser inteiro ≥ 0');
  }

  const filtros = (entrada.filtros ?? []).map((f) => validarFiltro(f, idx));

  const dir: 'ASC' | 'DESC' =
    entrada.dir === 'asc' ? 'ASC' : entrada.dir === 'desc' ? 'DESC' : 'DESC';
  let orderBy: OrderByPlano;
  if (entrada.orderByFieldId == null || entrada.orderByFieldId === '') {
    orderBy = { campo: { tipo: 'createdAt' }, dir };
  } else {
    if (!idx.has(entrada.orderByFieldId)) {
      throw new ConsultaInvalidaError('ordenação sobre Campo desconhecido ou não suportado');
    }
    orderBy = {
      campo: {
        tipo: 'campo',
        fieldId: entrada.orderByFieldId,
        categoria: idx.get(entrada.orderByFieldId)!,
      },
      dir,
    };
  }

  return { filtros, orderBy, take, skip, incluirArquivados: entrada.incluirArquivados ?? false };
}
