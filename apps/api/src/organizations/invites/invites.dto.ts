import { BadRequestException } from '@nestjs/common';
import type { MembershipRole } from '../../../generated/prisma';

/**
 * Fronteira de entrada das rotas de Convite (Story 8.2). Parsing explícito e fail-closed. `orgId`
 * NUNCA vem do corpo — a Organização é do contexto. Só `email` e `role` são lidos.
 */

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAPEIS: readonly MembershipRole[] = ['ADMIN', 'MEMBER', 'GUEST'];

export interface CriarConviteDto {
  email: string;
  role: MembershipRole;
}

export function parseCriarConvite(body: unknown): CriarConviteDto {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const b = body as Record<string, unknown>;
  // Allowlist anti-mass-assignment: só `email` e `role`. `state`, `orgId`, `tokenHash` etc. rejeitados.
  for (const chave of Object.keys(b)) {
    if (chave !== 'email' && chave !== 'role') {
      throw new BadRequestException({ motivo: 'CAMPO_NAO_PERMITIDO', campo: chave });
    }
  }
  if (typeof b.email !== 'string' || b.email.trim().length === 0) {
    throw new BadRequestException({ motivo: 'EMAIL_INVALIDO' });
  }
  if (typeof b.role !== 'string' || !PAPEIS.includes(b.role as MembershipRole)) {
    throw new BadRequestException({ motivo: 'PAPEL_INVALIDO' });
  }
  return { email: b.email, role: b.role as MembershipRole };
}

export function validarUuidDeRota(valor: string, campo: string): string {
  if (typeof valor !== 'string' || !RE_UUID.test(valor)) {
    throw new BadRequestException({ motivo: 'ID_INVALIDO', campo });
  }
  return valor;
}
