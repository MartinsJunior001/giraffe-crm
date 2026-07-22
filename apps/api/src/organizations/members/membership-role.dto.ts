import { BadRequestException } from '@nestjs/common';
import { ehPapelValido, type MembershipRole } from './membership-role.core';

/**
 * Fronteira de entrada da alteração de papel (Story 8.4). Parsing explícito, fail-closed, com allowlist
 * anti-mass-assignment — o mesmo padrão de `invites.dto.ts`/`password.dto.ts`. Só a chave `role` é aceita;
 * `orgId`/`membershipId`/`state`/qualquer outra coisa no corpo é rejeitada (400), nunca ignorada.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corpoObjeto(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ erro: 'CORPO_INVALIDO' });
  }
  return body as Record<string, unknown>;
}

export interface AlterarPapelDto {
  role: MembershipRole;
}

export function parseAlterarPapel(body: unknown): AlterarPapelDto {
  const b = corpoObjeto(body);
  for (const chave of Object.keys(b)) {
    if (chave !== 'role')
      throw new BadRequestException({ erro: 'CAMPO_NAO_PERMITIDO', campo: chave });
  }
  if (!ehPapelValido(b.role)) {
    throw new BadRequestException({ erro: 'ROLE_INVALIDO' });
  }
  return { role: b.role };
}

/** Valida a FORMA do id na rota. Malformado → 400 (não é tentativa de acesso; é entrada inválida). */
export function exigirUuid(valor: string): string {
  if (!UUID.test(valor)) throw new BadRequestException({ erro: 'ID_INVALIDO' });
  return valor;
}
