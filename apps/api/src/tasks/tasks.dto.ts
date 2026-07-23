import { BadRequestException } from '@nestjs/common';

/**
 * Validação de entrada MANUAL das rotas de Tarefa (Story 5.1), no mesmo estilo da base (2.7 etc.): aceita
 * `unknown`, valida, devolve o tipo estreito — ou lança `BadRequestException` sanitizada. Sem `class-validator`
 * (Constitution II). `orgId` NUNCA vem do cliente; nenhum DTO o aceita.
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

export interface CriarTarefaDTO {
  title: string;
  description: string | null;
  cardId: string | null;
  dueAt: Date | null;
  responsavelMembershipId: string | null;
}

export interface EditarTarefaDTO {
  title: Talvez<string>;
  description: Talvez<string | null>;
  dueAt: Talvez<Date | null>;
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

/** Prazo como INSTANTE absoluto (ISO-8601). `null` = sem prazo. Recusa data inválida (fail-closed). */
function parsePrazo(v: unknown): Talvez<Date | null> {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'string') throw new BadRequestException('dueAt deve ser uma data ISO ou null');
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('dueAt inválido');
  return d;
}

function parseIdOpcional(v: unknown, campo: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw new BadRequestException(`${campo} inválido`);
  return v;
}

/** Corpo de `POST /pipes/:pipeId/tasks`. `title` obrigatório; demais opcionais. */
export function parseCriarTarefa(body: unknown): CriarTarefaDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  return {
    title: parseTitulo(d.title, true)!,
    description: parseDescricao(d.description) ?? null,
    cardId: parseIdOpcional(d.cardId, 'cardId'),
    dueAt: parsePrazo(d.dueAt) ?? null,
    responsavelMembershipId: parseIdOpcional(d.responsavelMembershipId, 'responsavelMembershipId'),
  };
}

/** Corpo de `PATCH /tasks/:taskId`. Todos opcionais; pelo menos um deve estar presente. */
export function parseEditarTarefa(body: unknown): EditarTarefaDTO {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  const dto: EditarTarefaDTO = {
    title: parseTitulo(d.title, false),
    description: parseDescricao(d.description),
    dueAt: parsePrazo(d.dueAt),
  };
  if (dto.title === undefined && dto.description === undefined && dto.dueAt === undefined) {
    throw new BadRequestException('nada a editar');
  }
  return dto;
}

/** Corpo de `PUT /tasks/:taskId/responsavel`. `responsavelMembershipId: null` = remover Responsável. */
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

/** Corpo de `PUT /tasks/:taskId/card`. `cardId: null` = desvincular. */
export function parseVinculoCard(body: unknown): { cardId: string | null } {
  if (typeof body !== 'object' || body === null) throw new BadRequestException('corpo inválido');
  const d = body as Record<string, unknown>;
  if (!('cardId' in d)) {
    throw new BadRequestException('cardId é obrigatório (use null para desvincular)');
  }
  return { cardId: parseIdOpcional(d.cardId, 'cardId') };
}
