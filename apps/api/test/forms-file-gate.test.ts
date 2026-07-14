import { describe, expect, it } from 'vitest';
import { podePublicarComArquivo, tipoArquivoDisponivel } from '../src/pipes/forms/file-gate';
import type { CampoParaGate } from '../src/pipes/forms/file-gate';

/**
 * Gate do Campo Arquivo (Story 2.4, AD-27/AD-28) — regra **fail-closed**, pura. Unit sem banco: prova o
 * CONTRATO que a Story 2.6 consumirá no ato de publicar. Fase VERMELHA: se o gate deixasse passar um `FILE`
 * ativo com a capacidade desabilitada, o primeiro `expect(...).toBe(false)` falharia. (SC-244)
 */

const texto: CampoParaGate = { type: 'TEXT_SHORT', state: 'ACTIVE' };
const arquivoAtivo: CampoParaGate = { type: 'FILE', state: 'ACTIVE' };
const arquivoArquivado: CampoParaGate = { type: 'FILE', state: 'ARCHIVED' };

describe('podePublicarComArquivo (fail-closed)', () => {
  it('BARRA publicar um Formulário com Campo FILE ativo quando o upload está desabilitado', () => {
    expect(podePublicarComArquivo([texto, arquivoAtivo], { fileUpload: false })).toBe(false);
  });

  it('LIBERA quando não há Campo FILE ativo (só um FILE arquivado não barra)', () => {
    expect(podePublicarComArquivo([texto, arquivoArquivado], { fileUpload: false })).toBe(true);
    expect(podePublicarComArquivo([texto], { fileUpload: false })).toBe(true);
    expect(podePublicarComArquivo([], { fileUpload: false })).toBe(true);
  });

  it('LIBERA um FILE ativo somente quando a capacidade de upload está habilitada', () => {
    expect(podePublicarComArquivo([arquivoAtivo], { fileUpload: true })).toBe(true);
  });
});

describe('tipoArquivoDisponivel', () => {
  it('reflete a capacidade: indisponível por padrão (fail-closed), disponível só quando habilitada', () => {
    expect(tipoArquivoDisponivel(false)).toBe(false);
    expect(tipoArquivoDisponivel(true)).toBe(true);
  });
});
