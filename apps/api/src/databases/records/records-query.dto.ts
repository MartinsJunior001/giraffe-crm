import { BadRequestException } from '@nestjs/common';
import type { FiltroEntrada, QueryEntrada } from './record-query.core';

/**
 * Parse MANUAL da query da listagem de Registros (Story 3.5), no mesmo estilo da 3.4 (sem class-validator). Só
 * garante a FORMA do envelope (números, lista de filtros bem-formada); a validação de DOMÍNIO (allowlist de
 * Campos/operadores por tipo, coerção de valor) é do núcleo puro `record-query.core` (fail-closed → 400).
 */
export function parseListarQuery(q: Record<string, unknown>): QueryEntrada {
  const take = q.take !== undefined ? Number(q.take) : undefined;
  const skip = q.skip !== undefined ? Number(q.skip) : undefined;
  const orderByFieldId = typeof q.orderBy === 'string' && q.orderBy !== '' ? q.orderBy : undefined;
  const dir = typeof q.dir === 'string' ? q.dir : undefined;
  const incluirArquivados = q.incluirArquivados === 'true' || q.incluirArquivados === true;

  let filtros: FiltroEntrada[] | undefined;
  if (q.filtros !== undefined && q.filtros !== '') {
    let bruto: unknown = q.filtros;
    if (typeof bruto === 'string') {
      try {
        bruto = JSON.parse(bruto);
      } catch {
        throw new BadRequestException('filtros inválido (JSON)');
      }
    }
    if (!Array.isArray(bruto)) throw new BadRequestException('filtros deve ser uma lista');
    filtros = bruto.map((item) => {
      if (item === null || typeof item !== 'object') {
        throw new BadRequestException('cada filtro deve ser um objeto');
      }
      const o = item as Record<string, unknown>;
      return { fieldId: o.fieldId, op: o.op, valor: o.valor };
    });
  }

  return { take, skip, orderByFieldId, dir, incluirArquivados, filtros };
}
