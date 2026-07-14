import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL da submissão (Story 2.7), no mesmo estilo da 2.4-2.6: aceita `unknown`, valida,
 * devolve o tipo estreito — ou lança `BadRequestException` sanitizada. Sem `class-validator` (Constitution II).
 *
 * A validação de DOMÍNIO dos `valores` (contra o snapshot da versão publicada) é do serviço (`submission.ts`);
 * aqui só garantimos a forma do envelope: uma `idempotencyKey` presente e um `valores` que é objeto.
 */

const IDEMPOTENCY_KEY_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SubmissaoDTO {
  idempotencyKey: string;
  valores: unknown;
}

/** Garante que um `:id` de rota é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/**
 * Valida o corpo da submissão. `idempotencyKey` é obrigatória (garante idempotência — 1 submissão lógica ≤ 1
 * Card); `valores` deve ser um objeto (mapa `Field.id → valor`); ausente vira `{}` (submissão sem valores é
 * possível — não há obrigatoriedade na 2.7). Recusa array/escalar em `valores`.
 */
export function parseSubmissao(body: unknown): SubmissaoDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;

  const chave = dados.idempotencyKey;
  if (typeof chave !== 'string' || chave.trim().length === 0) {
    throw new BadRequestException('idempotencyKey é obrigatória');
  }
  if (chave.length > IDEMPOTENCY_KEY_MAX) {
    throw new BadRequestException('idempotencyKey excede o tamanho máximo');
  }

  let valores: unknown = dados.valores;
  if (valores === undefined) valores = {};
  if (typeof valores !== 'object' || valores === null || Array.isArray(valores)) {
    throw new BadRequestException('valores deve ser um objeto');
  }

  return { idempotencyKey: chave, valores };
}
