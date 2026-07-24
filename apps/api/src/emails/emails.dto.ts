import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL das rotas de e-mail (Story 6.1), no estilo da base (5.1 etc.): aceita
 * `unknown`, extrai APENAS os campos conhecidos (anti-mass-assignment por construção — `orgId`/`state`/
 * `submittedAt`/`createdByMembershipId` nunca são aceitos do cliente) e devolve o tipo estreito. A
 * validação SEMÂNTICA (sintaxe/dedup/limite de destinatários, sanitização de conteúdo) é do núcleo puro
 * `email-compose.core.ts` — o DTO só dá forma.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Garante que um `:id` de rota é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/** Marca "o campo foi enviado" vs "não foi enviado" — distingue limpar (null) de não-mexer (undefined). */
export type Talvez<T> = T | undefined;

export interface CriarEmailDTO {
  cardId: string | null;
  recipients: unknown; // validado no núcleo puro
  subject: unknown;
  body: unknown;
}

export interface EditarEmailDTO {
  cardId: Talvez<string | null>;
  recipients: Talvez<unknown>;
  subject: Talvez<unknown>;
  body: Talvez<unknown>;
}

function parseCardId(v: unknown): Talvez<string | null> {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) {
    throw new BadRequestException('cardId inválido');
  }
  return v;
}

export function parseCriarEmail(body: unknown): CriarEmailDTO {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  return {
    cardId: parseCardId(b.cardId) ?? null,
    recipients: b.recipients,
    subject: b.subject ?? '',
    body: b.body ?? '',
  };
}

export function parseEditarEmail(body: unknown): EditarEmailDTO {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo da requisição inválido');
  }
  const b = body as Record<string, unknown>;
  const dto: EditarEmailDTO = {
    cardId: parseCardId(b.cardId),
    recipients: 'recipients' in b ? b.recipients : undefined,
    subject: 'subject' in b ? b.subject : undefined,
    body: 'body' in b ? b.body : undefined,
  };
  if (
    dto.cardId === undefined &&
    dto.recipients === undefined &&
    dto.subject === undefined &&
    dto.body === undefined
  ) {
    throw new BadRequestException('nenhum campo editável informado');
  }
  return dto;
}
