import { BadRequestException } from '@nestjs/common';

/**
 * Fronteira de entrada do aceite (Story 8.3): allowlist estrita anti-mass-assignment. Só `token` é
 * lido do corpo — NADA de `orgId`/`accountId`/`role`/`inviteId` do cliente (a Org e o papel saem do
 * Convite; a Account, da sessão). Qualquer chave desconhecida → 400.
 */
export function parseAceitarConvite(body: unknown): { token: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new BadRequestException({ motivo: 'CORPO_INVALIDO' });
  }
  const registro = body as Record<string, unknown>;

  // Anti-mass-assignment: recusa chaves além de `token`.
  const permitidas = new Set(['token']);
  for (const chave of Object.keys(registro)) {
    if (!permitidas.has(chave)) throw new BadRequestException({ motivo: 'CAMPO_NAO_PERMITIDO' });
  }

  const token = registro.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new BadRequestException({ motivo: 'TOKEN_INVALIDO' });
  }
  return { token };
}
