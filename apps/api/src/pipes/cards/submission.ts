import type { Prisma } from '../../../generated/prisma';

/**
 * Núcleo PURO da submissão do Formulário inicial (Story 2.7) — valida os `valores` submetidos CONTRA o snapshot
 * da `FormVersion` publicada e devolve os valores normalizados. Sem framework, sem banco: os invariantes de
 * conteúdo vivem aqui e são provados em unidade.
 *
 * A definição usada é a **congelada** (snapshot), não o rascunho atual — a submissão referencia uma versão
 * imutável (AD-12). Regras:
 *  - **allowlist**: toda chave de `valores` deve ser o `id` de um Campo do snapshot; chave desconhecida recusa
 *    (anti-mass-assignment; o cliente não injeta Campo que não existe na versão publicada);
 *  - **tipo**: o valor casa com o tipo do Campo (texto→string, NUMBER→número, BOOLEAN→booleano, Seleção→id(s));
 *  - **Seleção por `id`, nunca rótulo** (AD-11/AD-12): SELECT_SINGLE = um `id` de opção existente no snapshot;
 *    SELECT_MULTI = array de `id`s existentes, sem repetição;
 *  - **obrigatoriedade NÃO é validada aqui**: não existe atributo de obrigatoriedade em `Field` (2.4/2.5) — é
 *    gating do Formulário de Fase (D3.3), fora da 2.7. Valor ausente é permitido; o que se valida é o presente.
 *  - **limites** defensivos de tamanho (string e payload).
 */

/** Limites defensivos. */
const VALOR_STRING_MAX = 10_000;
const VALORES_BYTES_MAX = 256 * 1024;

/** Submissão recusada por valor inválido — o serviço traduz em 400 determinístico. */
export class SubmissaoInvalidaError extends Error {}

/** O que a validação observa de um Campo do snapshot. */
interface CampoSnapshot {
  id: string;
  type: string;
  label: string;
  typeConfig: { options?: { id: string }[] };
}

/** Tipos textuais (inclui DATE/DATETIME/EMAIL/PHONE/URL/FILE): o valor é uma string dentro do limite. */
const TIPOS_TEXTO = new Set([
  'TEXT_SHORT',
  'TEXT_LONG',
  'EMAIL',
  'PHONE',
  'URL',
  'DATE',
  'DATETIME',
  'FILE',
]);

/** Lê o snapshot (Json da `FormVersion`) e devolve o índice `Field.id → Campo`. Fail-closed se malformado. */
function indexarCampos(snapshot: Prisma.JsonValue): Map<string, CampoSnapshot> {
  if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new SubmissaoInvalidaError('snapshot inválido');
  }
  const fields = (snapshot as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) throw new SubmissaoInvalidaError('snapshot sem campos');
  const indice = new Map<string, CampoSnapshot>();
  for (const f of fields) {
    if (f === null || typeof f !== 'object') throw new SubmissaoInvalidaError('campo inválido');
    const obj = f as Record<string, unknown>;
    if (typeof obj.id !== 'string' || typeof obj.type !== 'string') {
      throw new SubmissaoInvalidaError('campo sem id/tipo');
    }
    const options = (obj.typeConfig as { options?: unknown } | undefined)?.options;
    const opts = Array.isArray(options)
      ? options.map((o) => ({ id: String((o as { id?: unknown }).id) }))
      : undefined;
    indice.set(obj.id, {
      id: obj.id,
      type: obj.type,
      label: typeof obj.label === 'string' ? obj.label : obj.id,
      typeConfig: opts ? { options: opts } : {},
    });
  }
  return indice;
}

/** Valida UM valor contra o tipo do Campo. Lança `SubmissaoInvalidaError` (sem ecoar o valor). */
function validarValor(campo: CampoSnapshot, valor: unknown): unknown {
  const idsOpcoes = new Set((campo.typeConfig.options ?? []).map((o) => o.id));

  if (TIPOS_TEXTO.has(campo.type)) {
    if (typeof valor !== 'string')
      throw new SubmissaoInvalidaError(`"${campo.label}" deve ser texto`);
    if (valor.length > VALOR_STRING_MAX) {
      throw new SubmissaoInvalidaError(`"${campo.label}" excede o tamanho máximo`);
    }
    return valor;
  }
  if (campo.type === 'NUMBER') {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) {
      throw new SubmissaoInvalidaError(`"${campo.label}" deve ser um número`);
    }
    return valor;
  }
  if (campo.type === 'BOOLEAN') {
    if (typeof valor !== 'boolean')
      throw new SubmissaoInvalidaError(`"${campo.label}" deve ser booleano`);
    return valor;
  }
  if (campo.type === 'SELECT_SINGLE') {
    if (typeof valor !== 'string' || !idsOpcoes.has(valor)) {
      throw new SubmissaoInvalidaError(`"${campo.label}" deve ser uma opção válida`);
    }
    return valor;
  }
  if (campo.type === 'SELECT_MULTI') {
    if (!Array.isArray(valor))
      throw new SubmissaoInvalidaError(`"${campo.label}" deve ser uma lista`);
    const vistos = new Set<string>();
    for (const item of valor) {
      if (typeof item !== 'string' || !idsOpcoes.has(item)) {
        throw new SubmissaoInvalidaError(`"${campo.label}" tem opção inválida`);
      }
      if (vistos.has(item)) throw new SubmissaoInvalidaError(`"${campo.label}" tem opção repetida`);
      vistos.add(item);
    }
    return [...valor];
  }
  throw new SubmissaoInvalidaError(`tipo de Campo não suportado: ${campo.type}`);
}

/**
 * Valida `valores` (payload do cliente) contra o snapshot e devolve os valores normalizados (só Campos
 * conhecidos, chaveados por `Field.id`). Recusa: chave desconhecida (não é Campo da versão), valor de tipo
 * errado, opção de Seleção inexistente, payload acima do limite. Valor ausente é permitido (sem obrigatoriedade).
 */
export function validarSubmissao(
  snapshot: Prisma.JsonValue,
  valores: unknown,
): Record<string, unknown> {
  if (valores === null || typeof valores !== 'object' || Array.isArray(valores)) {
    throw new SubmissaoInvalidaError('valores deve ser um objeto');
  }
  const bytes = Buffer.byteLength(JSON.stringify(valores), 'utf8');
  if (bytes > VALORES_BYTES_MAX)
    throw new SubmissaoInvalidaError('valores excede o tamanho máximo');

  const campos = indexarCampos(snapshot);
  const normalizados: Record<string, unknown> = {};
  for (const [fieldId, valor] of Object.entries(valores as Record<string, unknown>)) {
    const campo = campos.get(fieldId);
    if (!campo) throw new SubmissaoInvalidaError('valor para Campo desconhecido');
    normalizados[fieldId] = validarValor(campo, valor);
  }
  return normalizados;
}
