import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { parseAceitarConvite } from '../src/organizations/invites/invite-accept.dto';

/** Fronteira de entrada do aceite (Story 8.3): allowlist estrita, só `token`. Anti-mass-assignment. */

/** Captura o motivo do `BadRequestException` (que vive no corpo de resposta, não na `.message`). */
function motivoDe(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return ((e as BadRequestException).getResponse() as { motivo: string }).motivo;
  }
  throw new Error('esperava lançar');
}

describe('parseAceitarConvite', () => {
  it('aceita { token } e devolve só o token', () => {
    expect(parseAceitarConvite({ token: 'abc' })).toEqual({ token: 'abc' });
  });

  it('recusa chave desconhecida (ex.: orgId/role/accountId do cliente) → CAMPO_NAO_PERMITIDO', () => {
    expect(motivoDe(() => parseAceitarConvite({ token: 'abc', orgId: 'x' }))).toBe(
      'CAMPO_NAO_PERMITIDO',
    );
    expect(motivoDe(() => parseAceitarConvite({ token: 'abc', role: 'ADMIN' }))).toBe(
      'CAMPO_NAO_PERMITIDO',
    );
  });

  it('recusa token ausente/vazio/não-string → TOKEN_INVALIDO', () => {
    expect(motivoDe(() => parseAceitarConvite({}))).toBe('TOKEN_INVALIDO');
    expect(motivoDe(() => parseAceitarConvite({ token: '' }))).toBe('TOKEN_INVALIDO');
    expect(motivoDe(() => parseAceitarConvite({ token: 123 }))).toBe('TOKEN_INVALIDO');
  });

  it('recusa corpo não-objeto → CORPO_INVALIDO', () => {
    expect(motivoDe(() => parseAceitarConvite(null))).toBe('CORPO_INVALIDO');
    expect(motivoDe(() => parseAceitarConvite('token'))).toBe('CORPO_INVALIDO');
    expect(motivoDe(() => parseAceitarConvite([]))).toBe('CORPO_INVALIDO');
  });
});
