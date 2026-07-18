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
/** Teto de arquivos por Campo FILE múltiplo (alinhado ao cap de arquivos por recurso da 3.7 — Q1). */
const ARQUIVOS_POR_CAMPO_MAX = 10;
/** Referência de arquivo é um `FileObject.id` (UUID). Validar o shape aqui evita 500 no `where id` (coluna Uuid). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Submissão recusada por valor inválido — o serviço traduz em 400 determinístico. */
export class SubmissaoInvalidaError extends Error {}

/**
 * Como tratar Campos `FILE` na validação (Story 3.8, Opção 1). O tipo `FILE` **não** é mais texto: o valor é uma
 * **referência tipada** a `FileObject(s)` já enviados e vinculados ao recurso. O vínculo em si (estado DISPONIVEL +
 * `(resourceType, resourceId)` correto) é conferido pelo **chamador** (I/O), não aqui (função pura).
 *
 *  - `'rejeitar'` (default, seguro): valor para Campo `FILE` **não** é aceito nesta via — usada onde o recurso
 *    ainda não existe (criação de Card/Registro) ou onde o upload inline autenticado uniforme é evolução futura
 *    (DEB-3.8-INLINE-UNIFORME). Um valor `FILE` presente ⇒ recusa.
 *  - `'referencia'`: valor para Campo `FILE` é uma referência tipada — `fileId` (string UUID) ou `fileId[]` quando
 *    `typeConfig.multiplo`. Usada na **edição** do Registro (3.4), onde o recurso já existe e o arquivo já foi
 *    enviado e vinculado a ele. O chamador valida o vínculo com `extrairArquivosReferenciados`.
 */
export type ModoArquivo = 'rejeitar' | 'referencia';

/** Opções da validação de submissão. Aditivas — o default preserva o comportamento das vias 2.7/2.8/2.15. */
export interface OpcoesSubmissao {
  arquivo?: ModoArquivo;
}

/** O que a validação observa de um Campo do snapshot. */
interface CampoSnapshot {
  id: string;
  type: string;
  label: string;
  typeConfig: { options?: { id: string }[]; multiplo?: boolean };
}

/** Tipos textuais (inclui DATE/DATETIME/EMAIL/PHONE/URL): o valor é uma string dentro do limite. `FILE` NÃO é
 * texto (Story 3.8) — é referência tipada a `FileObject`, tratada à parte por `validarValor`. */
const TIPOS_TEXTO = new Set([
  'TEXT_SHORT',
  'TEXT_LONG',
  'EMAIL',
  'PHONE',
  'URL',
  'DATE',
  'DATETIME',
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
    const cfg = obj.typeConfig as { options?: unknown; multiplo?: unknown } | undefined;
    const options = cfg?.options;
    const opts = Array.isArray(options)
      ? options.map((o) => ({ id: String((o as { id?: unknown }).id) }))
      : undefined;
    const multiplo = cfg?.multiplo === true;
    indice.set(obj.id, {
      id: obj.id,
      type: obj.type,
      label: typeof obj.label === 'string' ? obj.label : obj.id,
      typeConfig: { ...(opts ? { options: opts } : {}), ...(multiplo ? { multiplo } : {}) },
    });
  }
  return indice;
}

/** Valida a referência de um Campo `FILE` (shape puro; o vínculo é conferido pelo serviço). Um `fileId` é um
 * UUID de `FileObject`; múltiplo ⇒ lista não vazia, sem repetição, dentro do teto. */
function validarReferenciaArquivo(campo: CampoSnapshot, valor: unknown): string | string[] {
  const umId = (v: unknown): string => {
    if (typeof v !== 'string' || !UUID_RE.test(v)) {
      throw new SubmissaoInvalidaError(`"${campo.label}" tem referência de arquivo inválida`);
    }
    return v;
  };
  if (campo.typeConfig.multiplo) {
    if (!Array.isArray(valor)) throw new SubmissaoInvalidaError(`"${campo.label}" deve ser uma lista`);
    if (valor.length > ARQUIVOS_POR_CAMPO_MAX) {
      throw new SubmissaoInvalidaError(`"${campo.label}" excede o número máximo de arquivos`);
    }
    const vistos = new Set<string>();
    const ids = valor.map((item) => {
      const id = umId(item);
      if (vistos.has(id)) throw new SubmissaoInvalidaError(`"${campo.label}" tem arquivo repetido`);
      vistos.add(id);
      return id;
    });
    return ids;
  }
  return umId(valor);
}

/** Valida UM valor contra o tipo do Campo. Lança `SubmissaoInvalidaError` (sem ecoar o valor). */
function validarValor(campo: CampoSnapshot, valor: unknown, opcoes: Required<OpcoesSubmissao>): unknown {
  const idsOpcoes = new Set((campo.typeConfig.options ?? []).map((o) => o.id));

  if (campo.type === 'FILE') {
    if (opcoes.arquivo === 'rejeitar') {
      // Recurso ainda não existe (criação) ou inline autenticado uniforme é evolução futura: valor FILE não cabe.
      throw new SubmissaoInvalidaError(`"${campo.label}" não aceita arquivo nesta operação`);
    }
    return validarReferenciaArquivo(campo, valor);
  }
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
  opcoes?: OpcoesSubmissao,
): Record<string, unknown> {
  const resolvidas: Required<OpcoesSubmissao> = { arquivo: opcoes?.arquivo ?? 'rejeitar' };
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
    normalizados[fieldId] = validarValor(campo, valor, resolvidas);
  }
  return normalizados;
}

/**
 * Extrai os `fileId`s referenciados por Campos `FILE` nos `valores` já validados (`validarSubmissao` com
 * `arquivo: 'referencia'`). Devolve a lista achatada, sem repetição. Função pura: o **serviço** usa esta lista
 * para conferir o vínculo real (cada `FileObject` DISPONIVEL e vinculado ao `(resourceType, resourceId)` do
 * recurso). Assume `valores` normalizado (FILE já é string ou string[]).
 */
export function extrairArquivosReferenciados(
  snapshot: Prisma.JsonValue,
  valores: Record<string, unknown>,
): string[] {
  const campos = indexarCampos(snapshot);
  const ids = new Set<string>();
  for (const [fieldId, valor] of Object.entries(valores)) {
    if (campos.get(fieldId)?.type !== 'FILE') continue;
    if (typeof valor === 'string') ids.add(valor);
    else if (Array.isArray(valor)) for (const v of valor) if (typeof v === 'string') ids.add(v);
  }
  return [...ids];
}
