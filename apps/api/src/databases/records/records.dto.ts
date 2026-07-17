import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL das operações de Registro (Story 3.4), no mesmo estilo da 2.7: aceita `unknown`,
 * valida a forma do envelope, devolve o tipo estreito — ou lança `BadRequestException` sanitizada. Sem
 * `class-validator` (Constitution II). A validação de DOMÍNIO dos `valores` (contra o snapshot da versão
 * publicada) é do serviço (`submission.ts`).
 */

const IDEMPOTENCY_KEY_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CriarRegistroDTO {
  idempotencyKey: string;
  valores: unknown;
}

export interface EditarRegistroDTO {
  valores: unknown;
}

/** Garante que um `:id` de rota é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/** Valida `valores` como mapa `Field.id → valor` (objeto; ausente vira `{}`). Recusa array/escalar. */
function normalizarValores(valores: unknown): unknown {
  if (valores === undefined) return {};
  if (typeof valores !== 'object' || valores === null || Array.isArray(valores)) {
    throw new BadRequestException('valores deve ser um objeto');
  }
  return valores;
}

/**
 * Valida o corpo da criação. `idempotencyKey` é **obrigatória** (garante idempotência — uma ação lógica cria 0 ou
 * 1 Registro); `valores` deve ser um objeto (mapa `Field.id → valor`); ausente vira `{}`.
 */
export function parseCriar(body: unknown): CriarRegistroDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  const chave = dados.idempotencyKey;
  if (typeof chave !== 'string' || chave.trim().length === 0) {
    throw new BadRequestException('idempotencyKey é obrigatória');
  }
  if (chave.length > IDEMPOTENCY_KEY_MAX) {
    throw new BadRequestException('idempotencyKey excede o tamanho máximo');
  }

  return { idempotencyKey: chave, valores: normalizarValores(dados.valores) };
}

/** Valida o corpo da edição de valores (sem `idempotencyKey`: editar não é criação idempotente). */
export function parseEditar(body: unknown): EditarRegistroDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  return { valores: normalizarValores(dados.valores) };
}
