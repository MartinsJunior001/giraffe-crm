import { describe, expect, it } from 'vitest';
import {
  CATALOGO_VARIAVEIS,
  DefinicaoInvalidaError,
  extrairReferencias,
  LIMITE_VARIAVEIS,
  planejarArquivamento,
  podeEditarTemplate,
  validarConteudoTemplate,
  validarDefinicao,
} from '../src/emails/templates/template-definition.core';

/** Núcleo puro da Story 6.2 — catálogo tipado, definição e conteúdo do Template, fail-closed. */

describe('validarDefinicao', () => {
  it('aceita declaração válida do catálogo (com e sem obrigatoria) e ausente = []', () => {
    expect(validarDefinicao(undefined)).toEqual([]);
    expect(
      validarDefinicao([{ nome: 'org.name' }, { nome: 'card.title', obrigatoria: true }]),
    ).toEqual([
      { nome: 'org.name', obrigatoria: false },
      { nome: 'card.title', obrigatoria: true },
    ]);
  });

  it('rejeita fora do catálogo, duplicata, chave extra, tipos errados e acima do limite', () => {
    expect(() => validarDefinicao([{ nome: 'hack.env' }])).toThrow('catálogo');
    expect(() => validarDefinicao([{ nome: 'org.name' }, { nome: 'org.name' }])).toThrow(
      'duplicata',
    );
    expect(() => validarDefinicao([{ nome: 'org.name', extra: 1 }])).toThrow('desconhecida');
    expect(() => validarDefinicao([{ nome: 'org.name', obrigatoria: 'sim' }])).toThrow('booleano');
    expect(() => validarDefinicao('org.name')).toThrow('lista');
    const demais = Array.from({ length: LIMITE_VARIAVEIS + 1 }, (_, i) => ({ nome: `v${i}` }));
    expect(() => validarDefinicao(demais)).toThrow(DefinicaoInvalidaError);
  });

  it('mensagem não ecoa o valor recebido (sanitizada)', () => {
    try {
      validarDefinicao([{ nome: 'segredo-vazavel' }]);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain('segredo-vazavel');
    }
  });
});

describe('extrairReferencias / validarConteudoTemplate', () => {
  it('extrai {{ref}} (espaços tolerados, únicos); malformada é texto literal', () => {
    expect(extrairReferencias('Oi {{ org.name }} e {{card.title}} e {{org.name}}')).toEqual([
      'org.name',
      'card.title',
    ]);
    expect(extrairReferencias('aberta {{org.name e solta }} fim')).toEqual([]);
  });

  it('referência declarada passa; não declarada → 400 (fail-closed)', () => {
    const def = validarDefinicao([{ nome: 'org.name' }]);
    const ok = validarConteudoTemplate('T', 'Oi {{org.name}}', 'corpo {{org.name}}', def);
    expect(ok.subject).toContain('{{org.name}}');
    expect(() => validarConteudoTemplate('T', 'Oi {{card.title}}', 'x', def)).toThrow(
      'não declarada',
    );
    expect(() => validarConteudoTemplate('T', 'x', 'corpo {{user.name}}', def)).toThrow(
      'não declarada',
    );
  });

  it('tetos e controle (contrato da 6.1): nome vazio/controle/NUL → 400', () => {
    expect(() => validarConteudoTemplate('', 's', 'b', [])).toThrow('obrigatório');
    expect(() => validarConteudoTemplate('a'.repeat(121), 's', 'b', [])).toThrow('nome');
    expect(() => validarConteudoTemplate('T', 'a'.repeat(201), 'b', [])).toThrow('assunto');
    expect(() => validarConteudoTemplate('T', 's', 'a'.repeat(20_001), [])).toThrow('corpo');
    expect(() => validarConteudoTemplate('T', 'a' + String.fromCharCode(0) + 'b', 'x', [])).toThrow(
      'controle',
    );
    expect(() =>
      validarConteudoTemplate('T', 'x', 'a' + String.fromCharCode(27) + 'b', []),
    ).toThrow('controle');
    // corpo admite \n/\t
    expect(validarConteudoTemplate('T', 's', 'l1\nl2\tc', []).body).toBe('l1\nl2\tc');
  });

  it('catálogo é de plataforma, tipado e tenant-safe (origens canônicas)', () => {
    for (const v of CATALOGO_VARIAVEIS) {
      expect(v.tipo).toBe('TEXT');
      expect(['ORGANIZACAO', 'CARD', 'USUARIO']).toContain(v.origem);
    }
  });
});

describe('transições', () => {
  it('arquivar/restaurar idempotentes; arquivado não é editável', () => {
    expect(planejarArquivamento('ACTIVE', 'arquivar')).toEqual({
      tipo: 'aplicar',
      alvo: 'ARCHIVED',
    });
    expect(planejarArquivamento('ARCHIVED', 'arquivar')).toEqual({ tipo: 'noop' });
    expect(planejarArquivamento('ARCHIVED', 'restaurar')).toEqual({
      tipo: 'aplicar',
      alvo: 'ACTIVE',
    });
    expect(planejarArquivamento('ACTIVE', 'restaurar')).toEqual({ tipo: 'noop' });
    expect(podeEditarTemplate('ACTIVE')).toBe(true);
    expect(podeEditarTemplate('ARCHIVED')).toBe(false);
  });
});
