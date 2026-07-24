/**
 * Núcleo PURO da Story 6.2 — catálogo canônico de variáveis e validação da definição/conteúdo do
 * Template (sem framework, sem banco). FAIL-CLOSED: entrada fora do contrato lança
 * `DefinicaoInvalidaError` (vira 400 no serviço). **Nada é executado nem resolvido aqui** — variável é
 * DADO tipado declarado; a resolução server-side é a Story 6.3.
 */

/** Variável canônica de PLATAFORMA (D-62.1): nome estável, tipo e origem tenant-safe. Ampliar = acrescentar. */
export interface VariavelCatalogo {
  readonly nome: string;
  readonly tipo: 'TEXT';
  /** Origem canônica e autorizada do valor (resolvida na 6.3 sob a autorização do contexto). */
  readonly origem: 'ORGANIZACAO' | 'CARD' | 'USUARIO';
}

export const CATALOGO_VARIAVEIS: readonly VariavelCatalogo[] = [
  { nome: 'org.name', tipo: 'TEXT', origem: 'ORGANIZACAO' },
  { nome: 'card.title', tipo: 'TEXT', origem: 'CARD' },
  { nome: 'user.name', tipo: 'TEXT', origem: 'USUARIO' },
];

const NOMES_CATALOGO = new Set(CATALOGO_VARIAVEIS.map((v) => v.nome));

export const LIMITE_VARIAVEIS = 20;
export const LIMITE_NOME_TEMPLATE = 120;
export const LIMITE_ASSUNTO_TEMPLATE = 200;
export const LIMITE_CORPO_TEMPLATE = 20_000;

/**
 * Sintaxe ESTRITA de referência: `{{nome}}` (espaços internos tolerados). O que não casar o padrão é
 * texto literal — nunca vira referência "quase" (comportamento documentado; sem heurística permissiva).
 */
const REF_RE = /\{\{\s*([A-Za-z][\w.]*)\s*\}\}/g;

// Reusa o contrato de texto plano da 6.1 (controle proibido; corpo admite \n/\r/\t).
// eslint-disable-next-line no-control-regex
const CONTROLE_CORPO_RE = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]');
// eslint-disable-next-line no-control-regex
const CONTROLE_ASSUNTO_RE = new RegExp('[\\u0000-\\u001F\\u007F]');

export class DefinicaoInvalidaError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'DefinicaoInvalidaError';
  }
}

export interface VariavelDeclarada {
  readonly nome: string;
  readonly obrigatoria: boolean;
}

/**
 * Valida a DEFINIÇÃO de variáveis do Template (allowlist anti-mass-assignment): lista de
 * `{ nome, obrigatoria }` com nome do catálogo, sem duplicata, ≤ LIMITE_VARIAVEIS, sem chave extra.
 */
export function validarDefinicao(input: unknown): VariavelDeclarada[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new DefinicaoInvalidaError('variáveis devem ser uma lista');
  if (input.length > LIMITE_VARIAVEIS) {
    throw new DefinicaoInvalidaError(`número de variáveis excede o limite (${LIMITE_VARIAVEIS})`);
  }
  const vistos = new Set<string>();
  const saida: VariavelDeclarada[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new DefinicaoInvalidaError('variável deve ser um objeto { nome, obrigatoria }');
    }
    const chaves = Object.keys(item as Record<string, unknown>);
    if (chaves.some((c) => c !== 'nome' && c !== 'obrigatoria')) {
      throw new DefinicaoInvalidaError('variável contém chave desconhecida');
    }
    const { nome, obrigatoria } = item as { nome?: unknown; obrigatoria?: unknown };
    if (typeof nome !== 'string' || !NOMES_CATALOGO.has(nome)) {
      // Sanitizado: não ecoa o valor recebido.
      throw new DefinicaoInvalidaError('variável fora do catálogo canônico');
    }
    if (obrigatoria !== undefined && typeof obrigatoria !== 'boolean') {
      throw new DefinicaoInvalidaError('obrigatoria deve ser booleano');
    }
    if (vistos.has(nome)) throw new DefinicaoInvalidaError('variável declarada em duplicata');
    vistos.add(nome);
    saida.push({ nome, obrigatoria: obrigatoria === true });
  }
  return saida;
}

/** Extrai as referências `{{nome}}` de um texto (nomes únicos, na ordem de aparição). */
export function extrairReferencias(texto: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(REF_RE)) vistos.add(m[1] as string);
  return [...vistos];
}

/**
 * Valida nome/assunto/corpo do Template: tetos (D-62.3), texto plano sem controle (contrato da 6.1) e
 * **toda referência `{{nome}}` do conteúdo declarada na definição** (fail-closed — nenhuma referência
 * não declarada sobrevive; "nenhuma variável não resolvida é enviada silenciosamente" nasce aqui).
 */
export function validarConteudoTemplate(
  name: unknown,
  subject: unknown,
  body: unknown,
  definicao: readonly VariavelDeclarada[],
): { name: string; subject: string; body: string } {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new DefinicaoInvalidaError('nome do Template é obrigatório');
  }
  if (name.length > LIMITE_NOME_TEMPLATE) {
    throw new DefinicaoInvalidaError('nome excede o tamanho máximo');
  }
  if (typeof subject !== 'string' || typeof body !== 'string') {
    throw new DefinicaoInvalidaError('assunto e corpo devem ser texto');
  }
  if (subject.length > LIMITE_ASSUNTO_TEMPLATE) {
    throw new DefinicaoInvalidaError('assunto excede o tamanho máximo');
  }
  if (body.length > LIMITE_CORPO_TEMPLATE) {
    throw new DefinicaoInvalidaError('corpo excede o tamanho máximo');
  }
  if (CONTROLE_ASSUNTO_RE.test(subject) || CONTROLE_ASSUNTO_RE.test(name)) {
    throw new DefinicaoInvalidaError('nome/assunto contém caracteres de controle');
  }
  if (CONTROLE_CORPO_RE.test(body)) {
    throw new DefinicaoInvalidaError('corpo contém caracteres de controle');
  }
  const declaradas = new Set(definicao.map((v) => v.nome));
  for (const ref of [...extrairReferencias(subject), ...extrairReferencias(body)]) {
    if (!declaradas.has(ref)) {
      throw new DefinicaoInvalidaError('conteúdo referencia variável não declarada');
    }
  }
  return { name, subject, body };
}

export type EstadoTemplate = 'ACTIVE' | 'ARCHIVED';

/** Arquivado é somente-leitura: nova versão/renome só em ACTIVE (409 senão). */
export function podeEditarTemplate(state: EstadoTemplate): boolean {
  return state === 'ACTIVE';
}

export type PlanoArquivamento = { tipo: 'aplicar'; alvo: EstadoTemplate } | { tipo: 'noop' }; // idempotente — sem updateMany (sem falso `denied`)

/** Arquivar/restaurar idempotentes (espelho da 6.1/3.1 — 2 estados, sem transição inválida). */
export function planejarArquivamento(
  atual: EstadoTemplate,
  acao: 'arquivar' | 'restaurar',
): PlanoArquivamento {
  const alvo: EstadoTemplate = acao === 'arquivar' ? 'ARCHIVED' : 'ACTIVE';
  if (atual === alvo) return { tipo: 'noop' };
  return { tipo: 'aplicar', alvo };
}
