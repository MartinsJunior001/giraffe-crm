import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma';

/**
 * Núcleo PURO das opções de Seleção no `typeConfig` (Story 2.5) — sem dependência de framework, para ser
 * provado em unidade. Concentra os invariantes do `typeConfig` (ver `specs/2-5-.../clarify.md`):
 *
 *  1. cada opção tem `id` estável e único no Campo;            (unicidade)
 *  3. renomear `label` não altera o `id`;                      (identidade)
 *  4. ordenação determinística (`position` 1..n reindexado);   (ordem)
 *  5. `id` duplicado é recusado;                               (unicidade)
 *  6. `label` vazio/só-espaços é recusado;                     (rótulo)
 *  7. limites de nº de opções, tamanho de rótulo e de payload; (limites)
 *  8. config malformada FALHA FECHADA (recusa, não conserta);  (fail-closed)
 *  9. propriedade desconhecida é recusada (anti-mass-assignment). (allowlist)
 *
 * A identidade é do SERVIDOR (`randomUUID`), nunca do cliente; o valor persistido (futuro, 2.7+) referenciará
 * o `id`, nunca o `label`. O `label` é conteúdo NÃO confiável: aplica-se `trim` e limites, mas **nada** de
 * sanitização destrutiva — quem escapa é a Web (React escapa por padrão; nenhuma rota devolve HTML).
 *
 * Opção legada da 2.4 (sem `state`) é lida como `ACTIVE`; ao regravar, o `state` fica explícito.
 */

export type EstadoOpcao = 'ACTIVE' | 'ARCHIVED';

/** Uma opção de Seleção com identidade estável. `position` é reindexado na serialização. */
export interface Opcao {
  id: string;
  label: string;
  position: number;
  state: EstadoOpcao;
}

/** Limites defensivos (invariante 7). Alinhados aos da 2.4 (`forms.dto.ts`). */
export const LABEL_MAX = 200;
export const OPCOES_MAX = 200;
/** Teto do `typeConfig` serializado (bytes UTF-8) — trava de payload. */
export const TYPECONFIG_BYTES_MAX = 64 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHAVES_OPCAO = new Set(['id', 'label', 'position', 'state']);

/** Config recusada (malformada, propriedade desconhecida, id duplicado, rótulo inválido, limite). → 400. */
export class TypeConfigInvalidoError extends Error {}
/** `optionId` não corresponde a nenhuma opção do Campo. → 404 (não-enumerante). */
export class OpcaoNaoEncontradaError extends Error {}

/** `label` não confiável: string, `trim`, não-vazio, dentro do limite. Recusa o resto (invariante 6/7). */
export function normalizarLabel(valor: unknown): string {
  if (typeof valor !== 'string') throw new TypeConfigInvalidoError('label deve ser string');
  const texto = valor.trim();
  if (texto.length === 0) throw new TypeConfigInvalidoError('label não pode ser vazio');
  if (texto.length > LABEL_MAX) throw new TypeConfigInvalidoError('label excede o tamanho máximo');
  return texto;
}

/**
 * Lê `typeConfig` (JSON persistido) e devolve as opções normalizadas, em ordem de `position`. FAIL-CLOSED:
 * qualquer forma inesperada (não-objeto, `options` não-array, item sem `id`/`label` válidos, chave
 * desconhecida, `id` duplicado, `state` inválido) **lança** — nunca "conserta" (invariante 8/9).
 *
 * `{}` (Campo não-Seleção ou Seleção sem opções) → `[]`. Opção legada sem `state` → `ACTIVE`.
 */
export function lerOpcoes(typeConfig: Prisma.JsonValue): Opcao[] {
  if (typeConfig === null || typeof typeConfig !== 'object' || Array.isArray(typeConfig)) {
    throw new TypeConfigInvalidoError('typeConfig deve ser um objeto');
  }
  const bruto = typeConfig as Record<string, unknown>;
  const options = bruto.options;
  if (options === undefined) return [];
  if (!Array.isArray(options)) throw new TypeConfigInvalidoError('options deve ser um array');
  if (options.length > OPCOES_MAX) throw new TypeConfigInvalidoError('options excede o limite');

  const vistos = new Set<string>();
  const opcoes = options.map((item): Opcao => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeConfigInvalidoError('opção deve ser um objeto');
    }
    const obj = item as Record<string, unknown>;
    for (const chave of Object.keys(obj)) {
      if (!CHAVES_OPCAO.has(chave))
        throw new TypeConfigInvalidoError('opção com chave desconhecida');
    }
    if (typeof obj.id !== 'string' || !UUID_RE.test(obj.id)) {
      throw new TypeConfigInvalidoError('opção com id inválido');
    }
    if (vistos.has(obj.id)) throw new TypeConfigInvalidoError('opção com id duplicado');
    vistos.add(obj.id);
    const label = normalizarLabel(obj.label);
    if (typeof obj.position !== 'number' || !Number.isFinite(obj.position)) {
      throw new TypeConfigInvalidoError('opção com position inválida');
    }
    const state = obj.state === undefined ? 'ACTIVE' : obj.state;
    if (state !== 'ACTIVE' && state !== 'ARCHIVED') {
      throw new TypeConfigInvalidoError('opção com state inválido');
    }
    return { id: obj.id, label, position: obj.position, state };
  });

  opcoes.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  return opcoes;
}

/**
 * Serializa opções para `{ options: [...] }`, reindexando `position` 1..n **na ordem recebida** (ordenação
 * determinística — invariante 4) e revalidando limites, unicidade de `id` e rótulos (invariante 5/6/7). O
 * objeto resultante é JSON puro (só string/number) — cast documentado, como na 2.4.
 */
export function serializarOpcoes(opcoes: Opcao[]): Prisma.InputJsonValue {
  if (opcoes.length > OPCOES_MAX) throw new TypeConfigInvalidoError('options excede o limite');
  const vistos = new Set<string>();
  const options = opcoes.map((opcao, i) => {
    if (!UUID_RE.test(opcao.id)) throw new TypeConfigInvalidoError('opção com id inválido');
    if (vistos.has(opcao.id)) throw new TypeConfigInvalidoError('opção com id duplicado');
    vistos.add(opcao.id);
    return {
      id: opcao.id,
      label: normalizarLabel(opcao.label),
      position: i + 1,
      state: opcao.state,
    };
  });
  const typeConfig = { options };
  const bytes = Buffer.byteLength(JSON.stringify(typeConfig), 'utf8');
  if (bytes > TYPECONFIG_BYTES_MAX) throw new TypeConfigInvalidoError('typeConfig excede o limite');
  return typeConfig as unknown as Prisma.InputJsonValue;
}

// ── Transformações puras (cada uma é aplicada e o resultado é regravado num único `field.update`) ──────

/** Adiciona uma opção ACTIVE ao final. `id` do servidor (`randomUUID`) — identidade estável. */
export function adicionarOpcao(opcoes: Opcao[], label: string): Opcao[] {
  const novo: Opcao = {
    id: randomUUID(),
    label: normalizarLabel(label),
    position: opcoes.length + 1,
    state: 'ACTIVE',
  };
  return [...opcoes, novo];
}

/** Renomeia a opção `optionId` — muda SÓ o `label`; o `id` permanece (invariante 3). 404 se não existe. */
export function renomearOpcao(opcoes: Opcao[], optionId: string, label: string): Opcao[] {
  const novoLabel = normalizarLabel(label);
  if (!opcoes.some((o) => o.id === optionId)) throw new OpcaoNaoEncontradaError(optionId);
  return opcoes.map((o) => (o.id === optionId ? { ...o, label: novoLabel } : o));
}

/**
 * Recoloca `optionId` logo **depois** de `afterOptionId` (ou no **início** se `null`) e reindexa. Não altera
 * `id`/`label`/`state` (só a ordem). 404 se `optionId` (ou a âncora, quando informada) não existe.
 */
export function reordenarOpcao(
  opcoes: Opcao[],
  optionId: string,
  afterOptionId: string | null,
): Opcao[] {
  const alvo = opcoes.find((o) => o.id === optionId);
  if (!alvo) throw new OpcaoNaoEncontradaError(optionId);
  if (afterOptionId === optionId) return [...opcoes]; // "depois de si mesmo" é no-op, não erro
  const semAlvo = opcoes.filter((o) => o.id !== optionId);
  let idx: number;
  if (afterOptionId === null) {
    idx = 0;
  } else {
    const pos = semAlvo.findIndex((o) => o.id === afterOptionId);
    if (pos === -1) throw new OpcaoNaoEncontradaError(afterOptionId);
    idx = pos + 1;
  }
  return [...semAlvo.slice(0, idx), alvo, ...semAlvo.slice(idx)];
}

/** Arquiva a opção (`state = ARCHIVED`) — preserva `id`/`label`. Idempotente. 404 se não existe. */
export function arquivarOpcao(opcoes: Opcao[], optionId: string): Opcao[] {
  if (!opcoes.some((o) => o.id === optionId)) throw new OpcaoNaoEncontradaError(optionId);
  return opcoes.map((o) => (o.id === optionId ? { ...o, state: 'ARCHIVED' } : o));
}

/** Remove a opção do array (é UPDATE do `typeConfig`, nunca DELETE de linha). 404 se não existe. */
export function removerOpcao(opcoes: Opcao[], optionId: string): Opcao[] {
  if (!opcoes.some((o) => o.id === optionId)) throw new OpcaoNaoEncontradaError(optionId);
  return opcoes.filter((o) => o.id !== optionId);
}
