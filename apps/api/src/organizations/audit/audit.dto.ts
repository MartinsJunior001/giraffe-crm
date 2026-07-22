import { BadRequestException } from '@nestjs/common';
import type { MembershipEventType } from '../../../generated/prisma';
import type { CategoriaAuditoria, ResultadoAuditoria, TipoAlvoAuditoria } from './audit-projection';

/**
 * Validação de entrada MANUAL da rota de consulta da Auditoria administrativa (Story 8.8), no estilo dos
 * demais DTOs do domínio (`record-history.dto`/`kanban.dto`): aceita `unknown`, valida, devolve o tipo
 * estreito — ou lança `BadRequestException` SANITIZADA. Sem `class-validator` (Constitution II).
 *
 * Todo filtro é uma **allowlist fail-closed**: valor fora do conjunto conhecido → 400 (não vira consulta
 * silenciosamente ampla nem revela vocabulário interno). `orgId` NUNCA vem do cliente (é do contexto).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Taxonomia REAL do `MembershipEvent` (schema.prisma): ROLE_CHANGED (8.4), SUSPENDED/REACTIVATED (8.5),
// REMOVED (8.6). NÃO há `CREATED` — a criação de Membership (aceite de Convite, 8.3) não emite este evento.
const OPERACOES: ReadonlySet<MembershipEventType> = new Set<MembershipEventType>([
  'ROLE_CHANGED',
  'SUSPENDED',
  'REACTIVATED',
  'REMOVED',
]);
const RESULTADOS: ReadonlySet<ResultadoAuditoria> = new Set<ResultadoAuditoria>([
  'SUCESSO',
  'BLOQUEADA',
  'FALHA',
]);
const CATEGORIAS: ReadonlySet<CategoriaAuditoria> = new Set<CategoriaAuditoria>(['MEMBERSHIP']);
const TIPOS_ALVO: ReadonlySet<TipoAlvoAuditoria> = new Set<TipoAlvoAuditoria>(['Membership']);

/** Teto rígido da página (NFR-3/4): nunca devolver a trilha inteira sem limite. */
export const LIMITE_MAX_AUDITORIA = 100;

/** Os filtros já validados que o serviço aplica sob RLS. Campos ausentes = sem restrição. */
export interface FiltrosAuditoria {
  categoria: CategoriaAuditoria | null;
  operacao: MembershipEventType | null;
  resultado: ResultadoAuditoria | null;
  ator: string | null;
  tipoAlvo: TipoAlvoAuditoria | null;
  alvo: string | null;
  de: Date | null;
  ate: Date | null;
  cursor: string | null;
  limite: number;
}

function opcional(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new BadRequestException('parâmetro inválido');
  return valor;
}

function uuidOuNulo(valor: unknown, campo: string): string | null {
  const v = opcional(valor);
  if (v === null) return null;
  if (!UUID_RE.test(v)) throw new BadRequestException(`${campo} inválido`);
  return v;
}

function dataOuNula(valor: unknown, campo: string): Date | null {
  const v = opcional(valor);
  if (v === null) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`${campo} inválido`);
  return d;
}

/** Cursor de paginação = `id` (PK) do último evento da página anterior (UUID). Ausente → 1ª página. */
export function parseCursor(valor: unknown): string | null {
  return uuidOuNulo(valor, 'cursor');
}

/** Limite; ausente → 50. Inteiro positivo; o teto rígido (100) é aplicado no serviço. Lixo → 400. */
export function parseLimite(valor: unknown): number {
  const v = opcional(valor);
  if (v === null) return 50;
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequestException('limite inválido');
  return n;
}

/**
 * Valida e estreita TODOS os parâmetros da consulta. Cada filtro é opcional e fail-closed. `de`/`ate`
 * são intervalo (inclusivo) sobre `occurredAt`; se ambos vierem e `de > ate` → 400 (intervalo vazio por
 * engano é erro do cliente, não consulta silenciosa).
 */
export function parseConsultaAuditoria(q: Record<string, unknown>): FiltrosAuditoria {
  const categoria = opcional(q.categoria);
  if (categoria !== null && !CATEGORIAS.has(categoria as CategoriaAuditoria)) {
    throw new BadRequestException('categoria inválida');
  }
  const operacao = opcional(q.operacao);
  if (operacao !== null && !OPERACOES.has(operacao as MembershipEventType)) {
    throw new BadRequestException('operacao inválida');
  }
  const resultado = opcional(q.resultado);
  if (resultado !== null && !RESULTADOS.has(resultado as ResultadoAuditoria)) {
    throw new BadRequestException('resultado inválido');
  }
  const tipoAlvo = opcional(q.tipoAlvo);
  if (tipoAlvo !== null && !TIPOS_ALVO.has(tipoAlvo as TipoAlvoAuditoria)) {
    throw new BadRequestException('tipoAlvo inválido');
  }

  const de = dataOuNula(q.de, 'de');
  const ate = dataOuNula(q.ate, 'ate');
  if (de !== null && ate !== null && de.getTime() > ate.getTime()) {
    throw new BadRequestException('intervalo inválido: de > ate');
  }

  return {
    categoria: (categoria as CategoriaAuditoria | null) ?? null,
    operacao: (operacao as MembershipEventType | null) ?? null,
    resultado: (resultado as ResultadoAuditoria | null) ?? null,
    ator: uuidOuNulo(q.ator, 'ator'),
    tipoAlvo: (tipoAlvo as TipoAlvoAuditoria | null) ?? null,
    alvo: uuidOuNulo(q.alvo, 'alvo'),
    de,
    ate,
    cursor: parseCursor(q.cursor),
    limite: parseLimite(q.limite),
  };
}
