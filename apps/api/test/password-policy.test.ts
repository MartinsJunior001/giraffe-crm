import { describe, expect, it } from 'vitest';
import {
  SENHA_MAX,
  SENHA_MIN,
  ehSenhaComum,
  normalizarParaComparacao,
  validarPoliticaSenha,
} from '../src/kernel/auth/password-policy';

/**
 * Política de senha central (Story 1.12, D-1) — o validador ÚNICO. Núcleo puro, então testado como
 * unidade determinística: os limites exatos (14/15/128/129), a ausência de exigência de classes, a
 * aceitação de frases-senha com espaço e a rejeição local de senha comum.
 */

/** Constrói uma string de N caracteres previsível e NÃO trivial (não cai na lista de comuns). */
function senhaDe(n: number): string {
  // Padrão sem repetição longa nem sequência de teclado — só para exercitar o comprimento.
  const base = 'GiraffeMontanha7-Vale.Rio_Sol+Lua';
  let s = '';
  while (s.length < n) s += base;
  return s.slice(0, n);
}

describe('validarPoliticaSenha — limites de comprimento (D-1: 15..128)', () => {
  it('constantes ratificadas', () => {
    expect(SENHA_MIN).toBe(15);
    expect(SENHA_MAX).toBe(128);
  });

  it('14 caracteres → rejeitada (CURTA)', () => {
    expect(validarPoliticaSenha(senhaDe(14))).toEqual({ ok: false, motivo: 'CURTA' });
  });

  it('15 caracteres → aceita (o piso exato)', () => {
    expect(validarPoliticaSenha(senhaDe(15))).toEqual({ ok: true });
  });

  it('128 caracteres → aceita (o teto exato)', () => {
    expect(validarPoliticaSenha(senhaDe(128))).toEqual({ ok: true });
  });

  it('129 caracteres → rejeitada (LONGA)', () => {
    expect(validarPoliticaSenha(senhaDe(129))).toEqual({ ok: false, motivo: 'LONGA' });
  });

  it('comprimento é contado em code points (emoji não conta em dobro)', () => {
    // 15 emojis = 15 code points (30 unidades UTF-16). Deve passar o piso — não ser barrado por
    // uma contagem UTF-16 que veria 30.
    const quinzeEmojis = '🦒'.repeat(15);
    expect([...quinzeEmojis].length).toBe(15);
    expect(validarPoliticaSenha(quinzeEmojis)).toEqual({ ok: true });
  });
});

describe('validarPoliticaSenha — sem exigência de classes, frases-senha permitidas', () => {
  it('15 letras minúsculas (sem número/maiúscula/símbolo) → aceita', () => {
    // Prova que NÃO há exigência de mistura de classes (D-1). "giraffemontanha" tem 15 letras.
    const soLetras = 'giraffemontanha';
    expect([...soLetras].length).toBe(15);
    expect(validarPoliticaSenha(soLetras)).toEqual({ ok: true });
  });

  it('frase-senha COM ESPAÇOS, ≥15 e não trivial → aceita', () => {
    const frase = 'gato azul corre no telhado de zinco';
    expect(validarPoliticaSenha(frase)).toEqual({ ok: true });
  });
});

describe('validarPoliticaSenha — rejeição local de senha comum/comprometida', () => {
  it('senha comum que PASSA no comprimento ainda é rejeitada (COMUM)', () => {
    expect(validarPoliticaSenha('passwordpassword')).toEqual({ ok: false, motivo: 'COMUM' });
    expect(validarPoliticaSenha('qwertyuiopasdfgh')).toEqual({ ok: false, motivo: 'COMUM' });
    expect(validarPoliticaSenha('123456789012345')).toEqual({ ok: false, motivo: 'COMUM' });
  });

  it('a passphrase famosa é pega mesmo escrita com espaços/maiúsculas (normalização)', () => {
    // "correct horse battery staple" normaliza para a entrada "correcthorsebatterystaple".
    expect(validarPoliticaSenha('correct horse battery staple')).toEqual({
      ok: false,
      motivo: 'COMUM',
    });
    expect(validarPoliticaSenha('Correct Horse Battery Staple')).toEqual({
      ok: false,
      motivo: 'COMUM',
    });
    expect(ehSenhaComum('CORRECTHORSEBATTERYSTAPLE')).toBe(true);
  });

  it('normalização: minúsculas + remoção de espaços + NFKC', () => {
    expect(normalizarParaComparacao('  Ab C\tD ')).toBe('abcd');
  });
});

describe('validarPoliticaSenha — fail-closed', () => {
  it('entrada não-string → NAO_TEXTO (nunca coage)', () => {
    expect(validarPoliticaSenha(undefined)).toEqual({ ok: false, motivo: 'NAO_TEXTO' });
    expect(validarPoliticaSenha(null)).toEqual({ ok: false, motivo: 'NAO_TEXTO' });
    expect(validarPoliticaSenha(123456789012345)).toEqual({ ok: false, motivo: 'NAO_TEXTO' });
    expect(validarPoliticaSenha({ toString: () => senhaDe(20) })).toEqual({
      ok: false,
      motivo: 'NAO_TEXTO',
    });
  });
});
