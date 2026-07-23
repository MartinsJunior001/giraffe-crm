import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL das rotas de Solicitação (Story 5.2), no mesmo estilo da 5.1/2.7: aceita
 * `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException` sanitizada. Sem
 * `class-validator` (Constitution II). `orgId` NUNCA vem do cliente; nenhum DTO o aceita. Não há prazo (a
 * 5.2 não tem eixo temporal).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITLE_MAX = 500;
const DESCRIPTION_MAX = 10_000;

/** Garante que um `:id` de rota é UUID antes de tocar o banco. */
export function validarIdRota(id: string, campo: string): string {
  if (!UUID_RE.test(id)) throw new BadRequestException(`${campo} inválido`);
  return id;
}

/** Marca "o campo foi enviado" vs "não foi enviado" — distingue limpar (null) de não-mexer (undefined). */
export type Talvez<T> = T | undefined;

export interface CriarSolicitacaoDTO {
  title: string;
  description: string | null;
  cardId: string | null;
  responsavelMembershipId: string | null;
}

export interface EditarSolicitacaoDTO {
  title: Talvez<string>;
  description: Talvez<string | null>;
}

function parseTitulo(v: unknown, obrigatorio: boolean): Talvez<string> {
  if (v === undefined) {
    if (obrigatorio) throw new BadRequestException('title é obrigatório');
    return undefined;
  }
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new BadRequestException('title deve ser um texto não vazio');
  }
  if (v.length > TITLE_MAX) throw new BadRequestException('title excede o tamanho máximo');
  return v;
}

function parseDescricao(v: unknown): Talvez<string | null> {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') throw new BadRequestException('description deve ser texto ou null');
  if (v.length > DESCRIPTION_MAX)
    throw new BadRequestException('description excede o tamanho máximo');
  return v;
}

function parseIdOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new BadRequestException(`${campo} inválido`);
  return v;
}

/** Corpo de `POST /pipes/:pipeId/solicitacoes`. `title` obrigatório; Responsável 0..1 (opcional). */
export function parseCriarSolicitacao(body: unknown): CriarSolicitacaoDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  return {
    title: parseTitulo(d.title, true)!,
    description: parseDescricao(d.description) ?? null,
    cardId: parseIdOpcional(d.cardId, 'cardId'),
    responsavelMembershipId: parseIdOpcional(d.responsavelMembershipId, 'responsavelMembershipId'),
  };
}

/** Corpo de `PATCH /solicitacoes/:id`. Todos opcionais; pelo menos um deve estar presente. */
export function parseEditarSolicitacao(body: unknown): EditarSolicitacaoDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  const dto: EditarSolicitacaoDTO = {
    title: parseTitulo(d.title, false),
    description: parseDescricao(d.description),
  };
  if (dto.title === undefined && dto.description === undefined) {
    throw new BadRequestException('nada a editar');
  }
  return dto;
}

/** Corpo de `PUT /solicitacoes/:id/responsavel`. `responsavelMembershipId: null` = remover Responsável. */
export function parseResponsavel(body: unknown): { responsavelMembershipId: string | null } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  if (!('responsavelMembershipId' in d)) {
    throw new BadRequestException('responsavelMembershipId é obrigatório (use null para remover)');
  }
  return {
    responsavelMembershipId: parseIdOpcional(d.responsavelMembershipId, 'responsavelMembershipId'),
  };
}

/** Corpo de `PUT /solicitacoes/:id/card`. `cardId: null` = desvincular. */
export function parseVinculoCard(body: unknown): { cardId: string | null } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  if (!('cardId' in d)) {
    throw new BadRequestException('cardId é obrigatório (use null para desvincular)');
  }
  return { cardId: parseIdOpcional(d.cardId, 'cardId') };
}
