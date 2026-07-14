import { BadRequestException } from '@nestjs/common';
import type { ConfigMarcos } from './phase-milestones.core';

/**
 * Validação de entrada MANUAL da config de marcos (Story 2.12), no estilo da casa (sem `class-validator` —
 * Constitution II): aceita `unknown`, garante a FORMA do envelope, devolve `ConfigMarcos` estreito — ou lança
 * `BadRequestException` sanitizada. A validação de DOMÍNIO (`esperado ≤ vencimento ≤ expiração`, não-negatividade)
 * é do núcleo puro (`validarConfigMarcos`); o pertencimento/tipo do Campo de override é do serviço.
 *
 * Semântica de SUBSTITUIÇÃO (PUT): o corpo descreve a config COMPLETA. Campo ausente ou `null` = marco não
 * configurado (limpa). Assim configurar é idempotente e sem estado oculto.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DURACAO_MAX_MIN = 5_256_000; // ~10 anos em minutos — teto sanitário contra overflow/absurdo.

/** Garante que um `:id` de rota é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/** Duração opcional: ausente/`null` → null; senão inteiro em [0, DURACAO_MAX_MIN]. Recusa fração/negativo/não-número. */
function parseDuracao(v: unknown, campo: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new BadRequestException(`${campo} deve ser um inteiro não-negativo (minutos)`);
  }
  if (v > DURACAO_MAX_MIN) throw new BadRequestException(`${campo} excede o máximo permitido`);
  return v;
}

/** FieldId opcional de override: ausente/`null` → null; senão precisa ser UUID (o pertencimento é conferido no serviço). */
function parseFieldId(v: unknown, campo: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    throw new BadRequestException(`${campo} deve ser um UUID de Campo`);
  }
  return v;
}

/** Valida o corpo da config de marcos e devolve a `ConfigMarcos` completa (substituição). */
export function parseConfigMarcos(body: unknown): ConfigMarcos {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException('corpo inválido');
  }
  const b = body as Record<string, unknown>;
  return {
    expectedDurationMin: parseDuracao(b.expectedDurationMin, 'expectedDurationMin'),
    dueDurationMin: parseDuracao(b.dueDurationMin, 'dueDurationMin'),
    expirationDurationMin: parseDuracao(b.expirationDurationMin, 'expirationDurationMin'),
    expectedFieldId: parseFieldId(b.expectedFieldId, 'expectedFieldId'),
    dueFieldId: parseFieldId(b.dueFieldId, 'dueFieldId'),
    expirationFieldId: parseFieldId(b.expirationFieldId, 'expirationFieldId'),
  };
}
