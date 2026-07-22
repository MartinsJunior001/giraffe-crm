import { BadRequestException } from '@nestjs/common';
import { ehPapelValido, type MembershipRole, type MembershipState } from './membership-role.core';
import { normalizarPaginacao, ROSTER_BUSCA_MAX } from './roster.core';

/**
 * Fronteira de entrada das consultas do roster (Story 8.7). Parsing explícito, fail-closed, com
 * allowlist anti-surpresa — mesmo padrão de `membership-role.dto.ts`/`records-query.dto`. Query string
 * com chave desconhecida → 400 (nunca ignorada em silêncio). `orgId` JAMAIS é aceito do cliente: a
 * Organização vem do contexto resolvido no servidor.
 */

const ESTADOS_MEMBERSHIP: readonly MembershipState[] = ['ACTIVE', 'SUSPENDED', 'REMOVED'] as const;
const ESTADOS_INVITE = ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED'] as const;
type InviteState = (typeof ESTADOS_INVITE)[number];

/** Consulta ao roster de MEMBROS. Todos os campos são opcionais; ausência = sem filtro. */
export interface ConsultaMembros {
  state?: MembershipState;
  role?: MembershipRole;
  /** Termo de busca (nome; e-mail só na visão do Admin — decidido no serviço). Já normalizado. */
  busca?: string;
  skip: number;
  take: number;
}

/** Consulta ao roster de CONVITES. */
export interface ConsultaConvites {
  state?: InviteState;
  role?: MembershipRole;
  busca?: string;
  skip: number;
  take: number;
}

const CHAVES_PERMITIDAS = new Set(['state', 'role', 'busca', 'skip', 'take']);

/** Rejeita qualquer chave de query fora da allowlist (fail-closed). */
function exigirAllowlist(query: Record<string, unknown>): void {
  for (const chave of Object.keys(query)) {
    if (!CHAVES_PERMITIDAS.has(chave)) {
      throw new BadRequestException({ erro: 'PARAMETRO_NAO_PERMITIDO', parametro: chave });
    }
  }
}

/** Extrai uma string simples (a `query` do Express pode trazer array/objeto — rejeita ambos). */
function comoString(v: unknown, chave: string): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string')
    throw new BadRequestException({ erro: 'PARAMETRO_INVALIDO', parametro: chave });
  return v;
}

/** Normaliza e valida o termo de busca (trim + teto de tamanho). Vazio após trim → sem busca. */
function parseBusca(v: unknown): string | undefined {
  const s = comoString(v, 'busca');
  if (s === undefined) return undefined;
  const t = s.trim();
  if (t.length === 0) return undefined;
  if (t.length > ROSTER_BUSCA_MAX) throw new BadRequestException({ erro: 'BUSCA_LONGA_DEMAIS' });
  return t;
}

function parsePapel(v: unknown): MembershipRole | undefined {
  const s = comoString(v, 'role');
  if (s === undefined) return undefined;
  if (!ehPapelValido(s)) throw new BadRequestException({ erro: 'ROLE_INVALIDO' });
  return s;
}

export function parseConsultaMembros(query: unknown): ConsultaMembros {
  const q = comoQuery(query);
  exigirAllowlist(q);

  const state = comoString(q.state, 'state');
  if (state !== undefined && !(ESTADOS_MEMBERSHIP as readonly string[]).includes(state)) {
    throw new BadRequestException({ erro: 'STATE_INVALIDO' });
  }
  const { skip, take } = normalizarPaginacao(q.skip, q.take);
  return {
    state: state as MembershipState | undefined,
    role: parsePapel(q.role),
    busca: parseBusca(q.busca),
    skip,
    take,
  };
}

export function parseConsultaConvites(query: unknown): ConsultaConvites {
  const q = comoQuery(query);
  exigirAllowlist(q);

  const state = comoString(q.state, 'state');
  if (state !== undefined && !(ESTADOS_INVITE as readonly string[]).includes(state)) {
    throw new BadRequestException({ erro: 'STATE_INVALIDO' });
  }
  const { skip, take } = normalizarPaginacao(q.skip, q.take);
  return {
    state: state as InviteState | undefined,
    role: parsePapel(q.role),
    busca: parseBusca(q.busca),
    skip,
    take,
  };
}

function comoQuery(query: unknown): Record<string, unknown> {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw new BadRequestException({ erro: 'QUERY_INVALIDA' });
  }
  return query as Record<string, unknown>;
}
