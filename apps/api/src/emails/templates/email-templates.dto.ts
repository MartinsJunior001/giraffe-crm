import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL das rotas de Template (Story 6.2): extrai APENAS os campos conhecidos
 * (anti-mass-assignment por construção — `orgId`/`state`/`activeVersion`/`version`/autoria nunca vêm do
 * cliente). A validação SEMÂNTICA (catálogo, referências, tetos) é do núcleo puro.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

export interface CriarTemplateDTO {
  name: unknown;
  subject: unknown;
  body: unknown;
  variables: unknown;
}

export interface NovaVersaoDTO {
  /** Renome opcional junto da edição; ausente = preserva. */
  name: string | undefined;
  subject: unknown;
  body: unknown;
  variables: unknown;
}

export function parseCriarTemplate(body: unknown): CriarTemplateDTO {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  return { name: b.name, subject: b.subject ?? '', body: b.body ?? '', variables: b.variables };
}

export function parseNovaVersao(body: unknown): NovaVersaoDTO {
  if (typeof body !== 'object' || body === null) {
    throw new BadRequestException('corpo da requisição inválido');
  }
  const b = body as Record<string, unknown>;
  let name: string | undefined;
  if (b.name !== undefined) {
    if (typeof b.name !== 'string') throw new BadRequestException('name deve ser texto');
    name = b.name;
  }
  return { name, subject: b.subject ?? '', body: b.body ?? '', variables: b.variables };
}
