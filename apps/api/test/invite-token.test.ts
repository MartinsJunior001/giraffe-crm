import { describe, expect, it } from 'vitest';
import { emitirToken, hashToken, tokenConfere } from '../src/organizations/invites/invite-token';

/**
 * Token do Convite (Story 8.2). O invariante: só o HASH persiste; o bruto nunca é guardado.
 * Testes puros, sem banco.
 */

describe('emissão do token', () => {
  it('gera bruto e hash, e o hash é o SHA-256 do bruto', () => {
    const t = emitirToken();
    expect(t.bruto.length).toBeGreaterThan(20);
    expect(t.hash).toBe(hashToken(t.bruto));
    expect(t.hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  it('é base64url (seguro em URL) — sem +, /, =', () => {
    for (let i = 0; i < 20; i++) {
      expect(emitirToken().bruto).not.toMatch(/[+/=]/);
    }
  });

  it('cada emissão é única (entropia forte)', () => {
    const n = 500;
    const brutos = new Set(Array.from({ length: n }, () => emitirToken().bruto));
    expect(brutos.size).toBe(n);
  });
});

describe('comparação de token', () => {
  it('o bruto correto confere com o hash persistido', () => {
    const t = emitirToken();
    expect(tokenConfere(t.bruto, t.hash)).toBe(true);
  });

  it('um bruto diferente NÃO confere', () => {
    const t = emitirToken();
    const outro = emitirToken();
    expect(tokenConfere(outro.bruto, t.hash)).toBe(false);
  });

  it('bruto adulterado (1 char) NÃO confere', () => {
    const t = emitirToken();
    const adulterado = `${t.bruto.slice(0, -1)}${t.bruto.slice(-1) === 'A' ? 'B' : 'A'}`;
    expect(tokenConfere(adulterado, t.hash)).toBe(false);
  });

  it('hash de comprimento inesperado retorna false sem lançar', () => {
    expect(tokenConfere('qualquer', 'abc')).toBe(false);
  });

  it('hashToken é determinístico', () => {
    expect(hashToken('mesmo-valor')).toBe(hashToken('mesmo-valor'));
  });
});
