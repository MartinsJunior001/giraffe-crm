import { describe, expect, it } from 'vitest';
import { detectarTipo, validarUpload } from '../src/files/file-validation.core';

/**
 * Validação PURA de upload (Story 3.7) — magic bytes + tamanho + contagem. Prova o gate fail-closed: conteúdo
 * real manda (não a extensão), executáveis/scripts/ZIP/`.txt/.csv/.json` são rejeitados, e os limites barram.
 */

const bytes = (...b: number[]) => new Uint8Array(b);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10);
const GIF = bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50);
const EXE_MZ = bytes(0x4d, 0x5a, 0x90, 0x00); // executável Windows.
const ELF = bytes(0x7f, 0x45, 0x4c, 0x46); // executável Linux.
const ZIP = bytes(0x50, 0x4b, 0x03, 0x04); // ZIP/office/jar — fora da allowlist (colide com executável).
const TXT = bytes(0x68, 0x65, 0x6c, 0x6c, 0x6f); // "hello" — sem assinatura binária.

describe('detectarTipo (magic bytes)', () => {
  it('reconhece os tipos permitidos pelo conteúdo real', () => {
    expect(detectarTipo(PNG)).toBe('image/png');
    expect(detectarTipo(JPEG)).toBe('image/jpeg');
    expect(detectarTipo(GIF)).toBe('image/gif');
    expect(detectarTipo(PDF)).toBe('application/pdf');
    expect(detectarTipo(WEBP)).toBe('image/webp');
  });
  it('rejeita executáveis, ZIP/office e texto (fora da allowlist)', () => {
    for (const b of [EXE_MZ, ELF, ZIP, TXT]) {
      expect(detectarTipo(b)).toBeNull();
    }
  });
});

describe('validarUpload', () => {
  const base = { maxBytes: 1000, contagemAtual: 0, maxPorRecurso: 10 };

  it('aprova um PNG dentro dos limites e devolve o mime', () => {
    const r = validarUpload({ bytes: PNG, tamanhoBytes: PNG.length, ...base });
    expect(r).toEqual({ ok: true, mime: 'image/png' });
  });

  it('rejeita executável renomeado (conteúdo real, não extensão)', () => {
    const r = validarUpload({ bytes: EXE_MZ, tamanhoBytes: EXE_MZ.length, ...base });
    expect(r).toEqual(expect.objectContaining({ ok: false, codigo: 'TIPO_NAO_PERMITIDO' }));
  });

  it('rejeita acima do tamanho máximo', () => {
    const r = validarUpload({ bytes: PNG, tamanhoBytes: 1001, ...base });
    expect(r).toEqual(expect.objectContaining({ ok: false, codigo: 'TAMANHO_EXCEDIDO' }));
  });

  it('rejeita o 11º arquivo (teto de contagem = 10)', () => {
    const r = validarUpload({ bytes: PNG, tamanhoBytes: PNG.length, ...base, contagemAtual: 10 });
    expect(r).toEqual(expect.objectContaining({ ok: false, codigo: 'CONTAGEM_EXCEDIDA' }));
  });

  it('rejeita arquivo vazio', () => {
    const r = validarUpload({ bytes: bytes(), tamanhoBytes: 0, ...base });
    expect(r).toEqual(expect.objectContaining({ ok: false, codigo: 'VAZIO' }));
  });
});
