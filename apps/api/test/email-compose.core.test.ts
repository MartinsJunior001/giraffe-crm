import { describe, expect, it } from 'vitest';
import {
  ComposicaoInvalidaError,
  LIMITE_ASSUNTO,
  LIMITE_CORPO,
  LIMITE_DESTINATARIOS,
  normalizarDestinatarios,
  planejarTransicao,
  validarConteudo,
} from '../src/emails/email-compose.core';

/** Núcleo puro da Story 6.1 — validação fail-closed de destinatários, conteúdo e transições. */

describe('normalizarDestinatarios', () => {
  it('normaliza (trim/lowercase), valida e deduplica case-insensitive', () => {
    const out = normalizarDestinatarios(
      ['  Ana@Exemplo.Com ', 'ana@exemplo.com', 'b@dominio.com.br'],
      true,
    );
    expect(out).toEqual(['ana@exemplo.com', 'b@dominio.com.br']);
  });

  it('lista vazia/ausente: permitida no rascunho, rejeitada no submit', () => {
    expect(normalizarDestinatarios(undefined, false)).toEqual([]);
    expect(normalizarDestinatarios([], false)).toEqual([]);
    expect(() => normalizarDestinatarios([], true)).toThrow(ComposicaoInvalidaError);
    expect(() => normalizarDestinatarios(undefined, true)).toThrow(ComposicaoInvalidaError);
  });

  it('rejeita não-lista, item não-string e sintaxe inválida (fail-closed, sem eco do valor)', () => {
    expect(() => normalizarDestinatarios('a@b.co', false)).toThrow('lista');
    expect(() => normalizarDestinatarios([42], false)).toThrow(ComposicaoInvalidaError);
    for (const ruim of [
      'sem-arroba',
      'a@semponto',
      'a b@x.co',
      'a@x.co ; DROP',
      '@x.co',
      'a@.co',
    ]) {
      expect(() => normalizarDestinatarios([ruim], false), ruim).toThrow('endereço inválido');
    }
    try {
      normalizarDestinatarios(['segredo-vazavel@'], false);
      expect.unreachable();
    } catch (err) {
      // Sanitizado: a mensagem NÃO ecoa o valor recebido.
      expect((err as Error).message).not.toContain('segredo-vazavel');
    }
  });

  it(`aceita ${LIMITE_DESTINATARIOS} e rejeita ${LIMITE_DESTINATARIOS + 1} (após dedup)`, () => {
    const lista = Array.from({ length: LIMITE_DESTINATARIOS }, (_, i) => `u${i}@exemplo.com`);
    expect(normalizarDestinatarios(lista, true)).toHaveLength(LIMITE_DESTINATARIOS);
    expect(() => normalizarDestinatarios([...lista, 'extra@exemplo.com'], true)).toThrow('limite');
    // Duplicatas não contam para o teto.
    expect(normalizarDestinatarios([...lista, 'U0@EXEMPLO.COM'], true)).toHaveLength(
      LIMITE_DESTINATARIOS,
    );
  });
});

describe('validarConteudo', () => {
  it('aceita texto plano com quebras de linha e tabs no corpo', () => {
    const { subject, body } = validarConteudo('Proposta', 'linha 1\nlinha 2\tcol');
    expect(subject).toBe('Proposta');
    expect(body).toBe('linha 1\nlinha 2\tcol');
  });

  it('rejeita não-string e tamanhos acima do teto', () => {
    expect(() => validarConteudo(null, 'x')).toThrow(ComposicaoInvalidaError);
    expect(() => validarConteudo('x', 42)).toThrow(ComposicaoInvalidaError);
    expect(() => validarConteudo('a'.repeat(LIMITE_ASSUNTO + 1), 'x')).toThrow('assunto');
    expect(() => validarConteudo('x', 'a'.repeat(LIMITE_CORPO + 1))).toThrow('corpo');
  });

  it('rejeita caracteres de controle (NUL, ESC, \\n no assunto) — fail-closed, sem strip', () => {
    expect(() => validarConteudo('a' + String.fromCharCode(0) + 'b', 'x')).toThrow('controle');
    expect(() => validarConteudo('a\nb', 'x')).toThrow('controle'); // assunto não admite quebra
    expect(() => validarConteudo('x', 'a' + String.fromCharCode(27) + 'b')).toThrow('controle');
    expect(() => validarConteudo('x', 'a' + String.fromCharCode(0) + 'b')).toThrow('controle');
  });

  it('HTML/script são texto INERTE (aceitos como texto plano; nunca interpretados)', () => {
    const { body } = validarConteudo('x', '<script>alert(1)</script> & <b>oi</b>');
    expect(body).toContain('<script>'); // armazenado como texto; a renderização escapa
  });
});

describe('planejarTransicao', () => {
  it('DRAFT → submeter/descartar aplica; repetir no alvo é no-op; cruzar é inválido', () => {
    expect(planejarTransicao('DRAFT', 'submeter')).toEqual({ tipo: 'aplicar', alvo: 'SUBMITTED' });
    expect(planejarTransicao('DRAFT', 'descartar')).toEqual({ tipo: 'aplicar', alvo: 'DISCARDED' });
    expect(planejarTransicao('SUBMITTED', 'submeter')).toEqual({ tipo: 'noop' });
    expect(planejarTransicao('DISCARDED', 'descartar')).toEqual({ tipo: 'noop' });
    // Descartar NÃO exclui enviados; submeter um descartado não ressuscita.
    expect(planejarTransicao('SUBMITTED', 'descartar')).toEqual({ tipo: 'invalido' });
    expect(planejarTransicao('DISCARDED', 'submeter')).toEqual({ tipo: 'invalido' });
  });
});
