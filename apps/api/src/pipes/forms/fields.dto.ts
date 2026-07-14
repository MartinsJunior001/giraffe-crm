import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma';
import { LABEL_MAX } from './option-config';

/**
 * Validação de entrada MANUAL das rotas de evolução de Campo (Story 2.5), no mesmo estilo da 2.4: aceita
 * `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException` SANITIZADA (sem ecoar o valor).
 * Sem `class-validator` (Constitution II).
 *
 * O ponto sensível é o **anti-mass-assignment**: editar Campo aceita SOMENTE `label`/`help`/`defaultValue`.
 * `type` (imutável, 2.5), `options`/`typeConfig` (cru — o cliente perderia um `id` silenciosamente e quebraria
 * a identidade estável, AD-12) são **recusados**. Opção evolui só pelas rotas dedicadas.
 */

const HELP_MAX = 1000;
/** Teto defensivo do `defaultValue` serializado (bytes UTF-8). */
const DEFAULT_VALUE_BYTES_MAX = 8 * 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Chaves que o cliente NÃO pode enviar ao editar (imutável / gerido pelo servidor / rota dedicada). */
const CHAVES_PROIBIDAS_EDITAR = [
  'type',
  'options',
  'typeConfig',
  'id',
  'orgId',
  'formId',
  'position',
  'state',
];

/** Único conjunto que a rota de edição aceita. Allowlist estrita: o resto é 400 (não silenciosamente ignorado). */
const CHAVES_EDITAVEIS = new Set(['label', 'help', 'defaultValue']);

function validarTexto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== 'string') throw new BadRequestException(`${campo} deve ser uma string`);
  const texto = valor.trim();
  if (texto.length === 0) throw new BadRequestException(`${campo} não pode ser vazio`);
  if (texto.length > max) throw new BadRequestException(`${campo} excede o tamanho máximo`);
  return texto;
}

/** Garante que um `:id` de rota (pipe/phase/field/option) é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/** Como `defaultValue` deve ser aplicado: ausente (não muda), limpar (SQL NULL) ou definir um valor JSON. */
export type DefaultValuePatch =
  { tipo: 'manter' } | { tipo: 'limpar' } | { tipo: 'definir'; valor: Prisma.InputJsonValue };

/** Corpo normalizado de `PATCH .../fields/:fieldId`. Só as chaves presentes mudam. */
export interface EditarCampoDTO {
  label?: string;
  /** presente = mudar; `null` = limpar (help é opcional no schema). */
  help?: string | null;
  defaultValue: DefaultValuePatch;
}

/**
 * Valida o corpo de editar Campo. Recusa `type`/`options`/`typeConfig`/etc. (400 — anti-mass-assignment).
 * Exige ao menos uma chave editável presente. `help: null` limpa; `defaultValue: null` limpa (SQL NULL).
 */
export function parseEditarCampo(body: unknown): EditarCampoDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  for (const chave of CHAVES_PROIBIDAS_EDITAR) {
    if (chave in dados)
      throw new BadRequestException(`${chave} não pode ser editado por esta rota`);
  }
  // Allowlist estrita: uma chave benigna desconhecida (typo, campo futuro) é recusada, não ignorada em
  // silêncio — o cliente que julgar ter mudado algo recebe erro, não um sucesso enganoso (fail-closed).
  for (const chave of Object.keys(dados)) {
    if (!CHAVES_EDITAVEIS.has(chave)) throw new BadRequestException(`campo desconhecido: ${chave}`);
  }

  const dto: EditarCampoDTO = { defaultValue: { tipo: 'manter' } };
  let algo = false;

  if ('label' in dados) {
    dto.label = validarTexto(dados.label, 'label', LABEL_MAX);
    algo = true;
  }
  if ('help' in dados) {
    dto.help = dados.help === null ? null : validarTexto(dados.help, 'help', HELP_MAX);
    algo = true;
  }
  if ('defaultValue' in dados) {
    dto.defaultValue = normalizarDefaultValue(dados.defaultValue);
    algo = true;
  }

  if (!algo) throw new BadRequestException('nada a editar');
  return dto;
}

/** `defaultValue`: `null` limpa; qualquer JSON válido dentro do limite define; `undefined` não chega aqui. */
function normalizarDefaultValue(valor: unknown): DefaultValuePatch {
  if (valor === null) return { tipo: 'limpar' };
  // Já é JSON (veio de JSON.parse do corpo); só limitamos o tamanho serializado.
  const bytes = Buffer.byteLength(JSON.stringify(valor), 'utf8');
  if (bytes > DEFAULT_VALUE_BYTES_MAX) {
    throw new BadRequestException('defaultValue excede o tamanho máximo');
  }
  return { tipo: 'definir', valor: valor as Prisma.InputJsonValue };
}

/** Corpo de adicionar/renomear opção: `{ label }`. */
export function parseOpcaoLabel(body: unknown): { label: string } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  return { label: validarTexto(dados.label, 'label', LABEL_MAX) };
}

/** Corpo de reordenar opção: `{ afterOptionId }` — `null`/ausente move para o início; senão UUID. */
export function parseReordenarOpcao(body: unknown): { afterOptionId: string | null } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  const after = dados.afterOptionId;
  if (after === undefined || after === null) return { afterOptionId: null };
  if (typeof after !== 'string' || !UUID_RE.test(after)) {
    throw new BadRequestException('afterOptionId inválido');
  }
  return { afterOptionId: after };
}
