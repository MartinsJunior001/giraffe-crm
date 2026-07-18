import { describe, expect, it } from 'vitest';
import { baseFresca, computarVeredito, type EntradaVeredito } from '../src/files/file-verdict.core';

/**
 * Veredito composto PURO (Story 3.7) — fail-closed absoluto. Prova que CLEAN exige TODAS as provas e que qualquer
 * falha isolada (tipo/tamanho/2×SHA/ClamAV/base velha/if-match) bloqueia. É a matriz de mutação em unidade.
 */

const OK: EntradaVeredito = {
  tipoDetectado: 'image/png',
  tamanhoOk: true,
  sha256Ingest: 'abc',
  sha256Releitura: 'abc',
  clamav: 'LIMPO',
  baseClamAVFresca: true,
  ifMatchOk: true,
};

describe('computarVeredito', () => {
  it('CLEAN quando todas as provas passam', () => {
    expect(computarVeredito(OK)).toEqual({ veredito: 'CLEAN' });
  });

  it('BLOCKED se o tipo não é permitido (magic bytes)', () => {
    expect(computarVeredito({ ...OK, tipoDetectado: null }).veredito).toBe('BLOCKED');
  });

  it('BLOCKED se o tamanho está fora do limite', () => {
    expect(computarVeredito({ ...OK, tamanhoOk: false }).veredito).toBe('BLOCKED');
  });

  it('BLOCKED se os dois SHA diferem (troca de bytes)', () => {
    expect(computarVeredito({ ...OK, sha256Releitura: 'xyz' }).veredito).toBe('BLOCKED');
  });

  it('BLOCKED se a base do ClamAV está velha (scanner cego)', () => {
    expect(computarVeredito({ ...OK, baseClamAVFresca: false }).veredito).toBe('BLOCKED');
  });

  it('BLOCKED se o ClamAV detectou ameaça', () => {
    expect(computarVeredito({ ...OK, clamav: 'INFECTADO' }).veredito).toBe('BLOCKED');
  });

  it('BLOCKED se o ClamAV não conseguiu escanear (null/erro/timeout/limite)', () => {
    expect(computarVeredito({ ...OK, clamav: 'NAO_ESCANEAVEL' }).veredito).toBe('BLOCKED');
  });

  it('BLOCKED se o if-match da promoção falhou', () => {
    expect(computarVeredito({ ...OK, ifMatchOk: false }).veredito).toBe('BLOCKED');
  });
});

describe('baseFresca', () => {
  const agora = new Date('2026-07-17T12:00:00Z');

  it('fresca dentro do teto de horas', () => {
    expect(baseFresca(new Date('2026-07-17T00:00:00Z'), 48, agora)).toBe(true); // 12h atrás.
  });
  it('velha além do teto', () => {
    expect(baseFresca(new Date('2026-07-14T00:00:00Z'), 48, agora)).toBe(false); // ~84h atrás.
  });
  it('data desconhecida (null) é tratada como cega — fail-closed', () => {
    expect(baseFresca(null, 48, agora)).toBe(false);
  });
  it('data no futuro (relógio incoerente) não é aceita', () => {
    expect(baseFresca(new Date('2026-07-18T00:00:00Z'), 48, agora)).toBe(false);
  });
});
