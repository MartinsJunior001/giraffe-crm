import { BadRequestException } from '@nestjs/common';
import type { FieldType } from '../../../generated/prisma';

/**
 * Validação de entrada MANUAL das rotas de Formulário (Story 2.4), no mesmo estilo dos DTOs de
 * Pipe/concessão/Fase: aceita `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException`
 * SANITIZADA (sem ecoar o valor recebido). O projeto não adota `class-validator` (Constitution II).
 */

/** Limites defensivos de tamanho (rótulo/ajuda/opção). */
const LABEL_MAX = 200;
const HELP_MAX = 1000;
const OPCOES_MAX = 200;

// Formato UUID (8-4-4-4-12 hex). Pré-filtro para 400 em vez de 500; a fronteira real é RLS + serviço.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Catálogo canônico dos 12 tipos (D3.1). Fonte única de verdade da validação de `type`. */
const TIPOS_CANONICOS = new Set<FieldType>([
  'TEXT_SHORT',
  'TEXT_LONG',
  'NUMBER',
  'SELECT_SINGLE',
  'SELECT_MULTI',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'FILE',
]);

/** Tipos de Seleção — os únicos que aceitam (e exigem) `options`. */
const TIPOS_SELECAO = new Set<FieldType>(['SELECT_SINGLE', 'SELECT_MULTI']);

/** Garante que um `:id` de rota (pipe/phase) é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

function validarTexto(valor: unknown, campo: string, max: number): string {
  if (typeof valor !== 'string') throw new BadRequestException(`${campo} deve ser uma string`);
  const texto = valor.trim();
  if (texto.length === 0) throw new BadRequestException(`${campo} não pode ser vazio`);
  if (texto.length > max) throw new BadRequestException(`${campo} excede o tamanho máximo`);
  return texto;
}

/** Corpo normalizado de `POST .../fields`. `options` só existe para tipos de Seleção. */
export interface AdicionarCampoDTO {
  label: string;
  type: FieldType;
  help: string | null;
  /** Rótulos das opções (Seleção). O servidor atribui id estável e posição; o cliente não os envia. */
  options: string[] | null;
}

/**
 * Valida o corpo de adicionar Campo. `type` deve pertencer ao catálogo canônico (senão 400 — SC-241).
 * Tipos de Seleção EXIGEM `options` (≥1 rótulo); os demais tipos NÃO aceitam `options`. Estado, posição e
 * identidade das opções são do servidor.
 */
export function parseAdicionarCampo(body: unknown): AdicionarCampoDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  const label = validarTexto(dados.label, 'label', LABEL_MAX);

  if (typeof dados.type !== 'string' || !TIPOS_CANONICOS.has(dados.type as FieldType)) {
    throw new BadRequestException('type fora do catálogo canônico de tipos de Campo');
  }
  const type = dados.type as FieldType;

  const help =
    dados.help === undefined || dados.help === null
      ? null
      : validarTexto(dados.help, 'help', HELP_MAX);

  const options = validarOpcoes(dados.options, type);

  return { label, type, help, options };
}

/**
 * Regras de `options` por tipo: Seleção exige array de rótulos não-vazios (≥1, ≤ limite); qualquer outro
 * tipo não pode receber `options`. Rejeita rótulos duplicados (a identidade estável é do servidor, mas dois
 * rótulos idênticos numa Seleção são ambíguos para o usuário).
 */
function validarOpcoes(valor: unknown, type: FieldType): string[] | null {
  const ehSelecao = TIPOS_SELECAO.has(type);

  if (!ehSelecao) {
    if (valor !== undefined && valor !== null) {
      throw new BadRequestException('options só é permitido para tipos de Seleção');
    }
    return null;
  }

  if (!Array.isArray(valor) || valor.length === 0) {
    throw new BadRequestException('tipos de Seleção exigem options (ao menos uma)');
  }
  if (valor.length > OPCOES_MAX)
    throw new BadRequestException('options excede a quantidade máxima');

  const rotulos = valor.map((opcao, i) => validarTexto(opcao, `options[${i}]`, LABEL_MAX));
  const distintos = new Set(rotulos.map((r) => r.toLowerCase()));
  if (distintos.size !== rotulos.length) {
    throw new BadRequestException('options não pode conter rótulos duplicados');
  }
  return rotulos;
}

/**
 * Corpo de `POST .../fields/reorder` (mover-um): `fieldId` é o Campo a mover; `afterFieldId` é o Campo irmão
 * após o qual posicioná-lo — `null` (ou ausente) move para o **início**. Não recebe `position` (chave
 * interna). Ordem completa não é aceita: reescrever N posições não seria atômico (ver serviço/plan).
 */
export function parseReordenarCampo(body: unknown): {
  fieldId: string;
  afterFieldId: string | null;
} {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  if (typeof dados.fieldId !== 'string' || !UUID_RE.test(dados.fieldId)) {
    throw new BadRequestException('fieldId inválido');
  }
  const after = dados.afterFieldId;
  if (after === undefined || after === null) {
    return { fieldId: dados.fieldId, afterFieldId: null };
  }
  if (typeof after !== 'string' || !UUID_RE.test(after)) {
    throw new BadRequestException('afterFieldId inválido');
  }
  return { fieldId: dados.fieldId, afterFieldId: after };
}
