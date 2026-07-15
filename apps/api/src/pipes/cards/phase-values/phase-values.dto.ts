import { BadRequestException } from '@nestjs/common';

/** Corpo da gravação de valores de Fase (Story 2.15). Só garante a FORMA (objeto por `Field.id`); domínio é do serviço. */
export interface ValoresDeFaseDTO {
  valores: Record<string, unknown>;
}

export function parseValoresDeFase(body: unknown): ValoresDeFaseDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const dados = body as Record<string, unknown>;
  let valores: unknown = dados.valores;
  if (valores === undefined) valores = {};
  if (typeof valores !== 'object' || valores === null || Array.isArray(valores)) {
    throw new BadRequestException('valores deve ser um objeto');
  }
  return { valores: valores as Record<string, unknown> };
}
