import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL da criação de vínculo Card↔Registro (Story 3.9), no estilo dos demais DTOs do
 * domínio (sem `class-validator` — Constitution II): aceita `unknown`, valida o `recordId`, devolve o tipo
 * estreito ou lança `BadRequestException` sanitizada.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Corpo de criação: `recordId` (UUID do Registro a vincular ao Card da rota). */
export function parseCriarVinculo(body: unknown): { recordId: string } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const recordId = (body as Record<string, unknown>).recordId;
  if (typeof recordId !== 'string' || !UUID_RE.test(recordId)) {
    throw new BadRequestException('recordId inválido');
  }
  return { recordId };
}
