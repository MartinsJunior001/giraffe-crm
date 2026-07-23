import { BadRequestException } from '@nestjs/common';
import type { ExecutionState } from './execution-view';

/**
 * Validação de entrada MANUAL da Trilha de Execuções (Story 4.8), no estilo dos demais DTOs do domínio (aceita
 * `unknown`, valida, devolve o tipo estreito ou lança `BadRequestException` SANITIZADA). Sem `class-validator`
 * (Constitution II). **Allowlist fail-closed** em todos os filtros (§1448): estado fora do enum, data malformada
 * ou `eventType` fora de `^[A-Z_]+$` → **400** — nunca cai silenciosamente para "sem filtro".
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_TYPE_RE = /^[A-Z][A-Z_]*$/;

/** Os 8 estados HONESTOS (4.6/4.7). Allowlist do filtro `estado`. */
const ESTADOS: readonly ExecutionState[] = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'PARTIAL',
  'FAILED',
  'SKIPPED_CONDITIONS',
  'BLOCKED_CONFIRMATION',
  'HALTED_BY_LIMIT',
];

export interface FiltrosExecucoes {
  estado: ExecutionState | null;
  eventType: string | null;
  de: Date | null;
  ate: Date | null;
}

/** Cursor de paginação = `id` da última Execução da página anterior (UUID). Ausente → 1ª página. Lixo → 400. */
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

function parseData(valor: unknown, campo: string): Date | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new BadRequestException(`${campo} inválido`);
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${campo} inválido`);
  return d;
}

/** Valida os filtros da listagem (período/estado/Evento), fail-closed. `de > ate` → 400. */
export function parseFiltrosExecucoes(query: {
  estado?: unknown;
  eventType?: unknown;
  de?: unknown;
  ate?: unknown;
}): FiltrosExecucoes {
  let estado: ExecutionState | null = null;
  if (query.estado !== undefined && query.estado !== null && query.estado !== '') {
    if (typeof query.estado !== 'string' || !ESTADOS.includes(query.estado as ExecutionState)) {
      throw new BadRequestException('estado inválido');
    }
    estado = query.estado as ExecutionState;
  }

  let eventType: string | null = null;
  if (query.eventType !== undefined && query.eventType !== null && query.eventType !== '') {
    if (typeof query.eventType !== 'string' || !EVENT_TYPE_RE.test(query.eventType)) {
      throw new BadRequestException('eventType inválido');
    }
    eventType = query.eventType;
  }

  const de = parseData(query.de, 'de');
  const ate = parseData(query.ate, 'ate');
  if (de && ate && de.getTime() > ate.getTime()) {
    throw new BadRequestException('período inválido (de > ate)');
  }

  return { estado, eventType, de, ate };
}
