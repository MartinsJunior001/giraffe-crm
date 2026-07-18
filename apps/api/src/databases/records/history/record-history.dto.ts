import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL da rota de leitura do Histórico do Registro (Story 3.6), no mesmo estilo dos demais
 * DTOs do domínio: aceita `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException` SANITIZADA.
 * Sem `class-validator` (Constitution II). Espelho de `pipes/cards/kanban.dto.ts`, mantido LOCAL para não acoplar
 * `databases/` a `pipes/` (`Card ≠ Registro`).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cursor de paginação = `id` do último evento da página anterior (UUID). Ausente → 1ª página. Lixo → 400. */
export function parseCursor(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !UUID_RE.test(valor)) {
    throw new BadRequestException('cursor inválido');
  }
  return valor;
}

/** Limite da página; ausente → 50. Inteiro positivo; o teto rígido (100) é aplicado no serviço. Lixo → 400. */
export function parseLimite(valor: unknown): number {
  if (valor === undefined || valor === null || valor === '') return 50;
  const n = typeof valor === 'string' ? Number(valor) : NaN;
  if (!Number.isInteger(n) || n <= 0) {
    throw new BadRequestException('limite inválido');
  }
  return n;
}
