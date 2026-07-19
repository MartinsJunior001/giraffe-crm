/**
 * Núcleo PURO da configuração da Automação (Story 4.1 — FR-21, RN-100/101, D4.1).
 *
 * Valida a ESTRUTURA `Quando → Condições → Então` e as REFERÊNCIAS. **Não valida o vocabulário**: os
 * catálogos de Evento (4.3), Condição (4.4) e Ação (4.5) ainda não existem, e inventá-los aqui seria
 * antecipar escopo sem consumidor (AD-11). O que esta Story garante é que a configuração tem forma
 * conhecida, não carrega chave desconhecida e só referencia recursos por ID estável.
 *
 * Sem I/O, sem Prisma, sem Nest — o mesmo desenho de `option-config.ts` (2.5) e `submission.ts` (2.7):
 * o invariante é testável sem banco, e o serviço só o aplica.
 *
 * **Fail-closed em toda decisão.** Entrada desconhecida é REJEITADA, nunca ignorada — uma chave silenciosamente
 * descartada viraria uma Automação que o usuário acredita ter configurado e que o motor não executa.
 */

/**
 * Versão do SCHEMA da configuração (não da Automação — versões/snapshots da Automação são a 4.2).
 *
 * Um documento JSON persistido sem versão é um documento que ninguém consegue migrar depois: quando a
 * 4.3/4.4/4.5 acrescentarem forma, não haveria como distinguir "config antiga válida" de "config
 * corrompida". Gravar a versão agora custa um campo; descobrir que ela falta custa uma migração de dados
 * às cegas. É o mesmo motivo pelo qual `FormVersion` numera seus snapshots.
 *
 * O valor é atribuído pelo SERVIDOR e **nunca aceito do cliente** — como `state` e `orgId`.
 */
export const SCHEMA_VERSION_CONFIG = 1;

/** Tipos de recurso que uma referência pode apontar. Allowlist — o que não está aqui é rejeitado. */
export const TIPOS_DE_REFERENCIA = [
  'PIPE',
  'PHASE',
  'FIELD',
  'FORM',
  'DATABASE',
  'RECORD',
] as const;
export type TipoDeReferencia = (typeof TIPOS_DE_REFERENCIA)[number];

/** Chaves aceitas em `quando`. Allowlist anti-mass-assignment (mesmo critério da submissão, 2.7). */
const CHAVES_QUANDO = new Set(['tipo', 'refs']);
/** Chaves aceitas em cada Condição. */
const CHAVES_CONDICAO = new Set(['tipo', 'operador', 'valor', 'refs']);
/** Chaves aceitas em cada Ação. */
const CHAVES_ACAO = new Set(['tipo', 'parametros', 'refs']);
/** Chaves aceitas em cada referência. */
const CHAVES_REF = new Set(['tipo', 'id']);

/** Limites — uma configuração é uma REGRA, não um programa. Barram payload abusivo (NFR-4). */
export const LIMITE_CONDICOES = 50;
export const LIMITE_ACOES = 50;
export const LIMITE_REFS = 50;
export const LIMITE_NOME = 200;

/**
 * Teto do TOTAL de referências da configuração inteira, somando os três ramos.
 *
 * Os limites por-array não bastam: 50 Condições × 50 refs + 50 Ações × 50 refs chegariam a ~5.000
 * referências num único payload, e cada uma custa uma verificação no banco. Sem este teto, um corpo
 * legítimo em forma seria um amplificador de carga — o pedido é barato de escrever e caro de validar.
 * O limite é sobre a SOMA justamente porque é a soma que o servidor paga.
 */
export const LIMITE_REFS_TOTAL = 200;

/** Uma referência a recurso, sempre por ID estável e tenant-safe. */
export interface Referencia {
  readonly tipo: TipoDeReferencia;
  readonly id: string;
}

export interface Quando {
  readonly tipo: string;
  readonly refs: readonly Referencia[];
}

export interface Condicao {
  readonly tipo: string;
  readonly operador: string;
  readonly valor: unknown;
  readonly refs: readonly Referencia[];
}

export interface Acao {
  readonly tipo: string;
  readonly parametros: Record<string, unknown>;
  readonly refs: readonly Referencia[];
}

/** A configuração já normalizada e validada — o que o serviço persiste. */
export interface ConfiguracaoValidada {
  /** Versão do SCHEMA do documento, carimbada pelo servidor. Ver `SCHEMA_VERSION_CONFIG`. */
  readonly schemaVersion: number;
  readonly quando: Quando;
  readonly condicoes: readonly Condicao[];
  readonly entao: readonly Acao[];
}

/** Erro de configuração inválida. O serviço o traduz em 400 — sanitizado, sem eco do payload. */
export class ConfiguracaoInvalidaError extends Error {
  constructor(readonly motivo: string) {
    super(motivo);
    this.name = 'ConfiguracaoInvalidaError';
  }
}

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Rejeita qualquer chave fora da allowlist. É o que impede mass-assignment via JSON livre. */
function exigirSomenteChaves(
  obj: Record<string, unknown>,
  permitidas: ReadonlySet<string>,
  onde: string,
): void {
  for (const chave of Object.keys(obj)) {
    if (!permitidas.has(chave)) {
      throw new ConfiguracaoInvalidaError(`${onde}: chave não permitida`);
    }
  }
}

function exigirTextoNaoVazio(v: unknown, onde: string, limite = LIMITE_NOME): string {
  if (typeof v !== 'string') throw new ConfiguracaoInvalidaError(`${onde}: esperado texto`);
  const t = v.trim();
  if (t.length === 0) throw new ConfiguracaoInvalidaError(`${onde}: não pode ser vazio`);
  if (t.length > limite) throw new ConfiguracaoInvalidaError(`${onde}: excede o limite`);
  return t;
}

/**
 * Valida uma referência.
 *
 * O `id` precisa ser **UUID**, nunca rótulo — a mesma regra que faz a submissão referenciar opção de
 * Seleção "por `id`, nunca rótulo" (2.7). Rótulo é editável; ID é estável. Uma referência por rótulo
 * apontaria para outro recurso no dia em que alguém renomeasse o original.
 *
 * A validação de que o recurso EXISTE e é ALCANÇÁVEL na Organização é do serviço (precisa de banco) e,
 * para o Pipe proprietário, do próprio banco via FK composta (F-A1).
 */
function validarReferencia(bruto: unknown, onde: string): Referencia {
  if (!ehObjetoSimples(bruto)) throw new ConfiguracaoInvalidaError(`${onde}: esperado objeto`);
  exigirSomenteChaves(bruto, CHAVES_REF, onde);

  const tipo = exigirTextoNaoVazio(bruto.tipo, `${onde}.tipo`);
  if (!(TIPOS_DE_REFERENCIA as readonly string[]).includes(tipo)) {
    throw new ConfiguracaoInvalidaError(`${onde}.tipo: tipo de referência desconhecido`);
  }

  const id = exigirTextoNaoVazio(bruto.id, `${onde}.id`);
  if (!RE_UUID.test(id)) {
    throw new ConfiguracaoInvalidaError(`${onde}.id: referência deve ser um ID estável (UUID)`);
  }

  return { tipo: tipo as TipoDeReferencia, id };
}

function validarRefs(bruto: unknown, onde: string): readonly Referencia[] {
  if (bruto === undefined) return [];
  if (!Array.isArray(bruto)) throw new ConfiguracaoInvalidaError(`${onde}: esperado array`);
  if (bruto.length > LIMITE_REFS) throw new ConfiguracaoInvalidaError(`${onde}: excede o limite`);
  return bruto.map((r, i) => validarReferencia(r, `${onde}[${i}]`));
}

/** QUANDO — o Evento gatilho. Obrigatório: uma Automação sem gatilho nunca poderia disparar. */
function validarQuando(bruto: unknown): Quando {
  if (!ehObjetoSimples(bruto)) throw new ConfiguracaoInvalidaError('quando: esperado objeto');
  exigirSomenteChaves(bruto, CHAVES_QUANDO, 'quando');
  return {
    tipo: exigirTextoNaoVazio(bruto.tipo, 'quando.tipo'),
    refs: validarRefs(bruto.refs, 'quando.refs'),
  };
}

/**
 * CONDIÇÕES — array combinado por E/AND (D4.1: "combinação apenas E/AND na Fase 1").
 *
 * Array VAZIO é legítimo e significa "sem Condição: a Ação executa direto" (D4.1) — não é um erro.
 * A combinação é AND por definição do domínio; não há campo `operadorLogico`, e aceitá-lo insinuaria
 * um OU que a Fase 1 não tem.
 */
function validarCondicoes(bruto: unknown): readonly Condicao[] {
  if (bruto === undefined) return [];
  if (!Array.isArray(bruto)) throw new ConfiguracaoInvalidaError('condicoes: esperado array');
  if (bruto.length > LIMITE_CONDICOES) {
    throw new ConfiguracaoInvalidaError('condicoes: excede o limite');
  }

  return bruto.map((c, i) => {
    const onde = `condicoes[${i}]`;
    if (!ehObjetoSimples(c)) throw new ConfiguracaoInvalidaError(`${onde}: esperado objeto`);
    exigirSomenteChaves(c, CHAVES_CONDICAO, onde);
    return {
      tipo: exigirTextoNaoVazio(c.tipo, `${onde}.tipo`),
      operador: exigirTextoNaoVazio(c.operador, `${onde}.operador`),
      valor: c.valor ?? null,
      refs: validarRefs(c.refs, `${onde}.refs`),
    };
  });
}

/** ENTÃO — array de Ações, NÃO VAZIO: uma Automação sem Ação não reage a nada e só poderia confundir. */
function validarEntao(bruto: unknown): readonly Acao[] {
  if (!Array.isArray(bruto)) throw new ConfiguracaoInvalidaError('entao: esperado array');
  if (bruto.length === 0) {
    throw new ConfiguracaoInvalidaError('entao: ao menos uma Ação é obrigatória');
  }
  if (bruto.length > LIMITE_ACOES) throw new ConfiguracaoInvalidaError('entao: excede o limite');

  return bruto.map((a, i) => {
    const onde = `entao[${i}]`;
    if (!ehObjetoSimples(a)) throw new ConfiguracaoInvalidaError(`${onde}: esperado objeto`);
    exigirSomenteChaves(a, CHAVES_ACAO, onde);

    const parametros = a.parametros ?? {};
    if (!ehObjetoSimples(parametros)) {
      throw new ConfiguracaoInvalidaError(`${onde}.parametros: esperado objeto`);
    }

    return {
      tipo: exigirTextoNaoVazio(a.tipo, `${onde}.tipo`),
      parametros,
      refs: validarRefs(a.refs, `${onde}.refs`),
    };
  });
}

/**
 * Valida a configuração inteira. Ponto de entrada do núcleo.
 *
 * Lança `ConfiguracaoInvalidaError` no PRIMEIRO problema — fail-closed. Nada é "corrigido"
 * silenciosamente: o chamador recebe 400 e a Automação não é criada.
 */
export function validarConfiguracao(bruto: {
  quando: unknown;
  condicoes?: unknown;
  entao: unknown;
}): ConfiguracaoValidada {
  const config: ConfiguracaoValidada = {
    // Carimbado pelo SERVIDOR. O DTO já rejeita `schemaVersion` vindo do cliente (allowlist do corpo):
    // deixar o cliente escolher a versão do schema seria deixá-lo escolher qual parser o valida.
    schemaVersion: SCHEMA_VERSION_CONFIG,
    quando: validarQuando(bruto.quando),
    condicoes: validarCondicoes(bruto.condicoes),
    entao: validarEntao(bruto.entao),
  };

  // Teto do TOTAL, verificado depois de os três ramos estarem válidos — ver `LIMITE_REFS_TOTAL`.
  if (extrairReferencias(config).length > LIMITE_REFS_TOTAL) {
    throw new ConfiguracaoInvalidaError('refs: total de referências excede o limite');
  }

  return config;
}

/**
 * Todas as referências da configuração, achatadas — o que o serviço precisa revalidar contra o banco.
 *
 * Extrair aqui (puro) e verificar lá (com contexto) mantém a regra de alcance testável sem banco e
 * evita que cada sítio de validação reimplemente a varredura e esqueça um ramo.
 */
export function extrairReferencias(config: ConfiguracaoValidada): readonly Referencia[] {
  return [
    ...config.quando.refs,
    ...config.condicoes.flatMap((c) => c.refs),
    ...config.entao.flatMap((a) => a.refs),
  ];
}
