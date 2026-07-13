import { describe, expect, it } from 'vitest';
import { atendeContraste, PISO_NAO_TEXTUAL, PISO_TEXTO, razaoContraste } from '@/lib/contraste';

/**
 * Gate de contraste da Story 1.8 (WCAG 2.2). Prova, por cálculo, que os tokens do DESIGN.md atingem
 * os pisos. Roda em ambiente `node` (sem DOM) — é a única prova confiável, pois jsdom não pinta.
 */

// Tokens congelados do DESIGN.md (globals.css).
const BRANCO = '#ffffff';
const ACCENT = '#fff3e8';
const MUTED = '#f5f5f5';
const RING = '#cc5b00';
const DESTRUCTIVE = '#d92d20';
const WARNING = '#a15c00';
const SUCCESS = '#157a52';
const INFO = '#2563eb';

describe('razaoContraste', () => {
  it('é simétrica e vale 1 para cores iguais', () => {
    expect(razaoContraste(BRANCO, BRANCO)).toBeCloseTo(1, 5);
    expect(razaoContraste(RING, BRANCO)).toBeCloseTo(razaoContraste(BRANCO, RING), 5);
  });

  it('preto contra branco é o máximo (21:1)', () => {
    expect(razaoContraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('aceita hex de 3 dígitos', () => {
    expect(razaoContraste('#fff', '#000')).toBeCloseTo(21, 1);
  });

  it('rejeita hex inválido (falha honesta)', () => {
    expect(() => razaoContraste('laranja', BRANCO)).toThrow();
    expect(() => razaoContraste('#12', BRANCO)).toThrow();
  });
});

describe('anel de foco ring #CC5B00 — WCAG 1.4.11 (≥ 3:1)', () => {
  it('atinge o piso não-textual contra todos os fundos onde aparece', () => {
    for (const fundo of [BRANCO, ACCENT, MUTED]) {
      expect(razaoContraste(RING, fundo)).toBeGreaterThanOrEqual(PISO_NAO_TEXTUAL);
    }
  });

  it('fica ABAIXO do piso de texto contra o accent — logo o ring é outline, nunca texto', () => {
    // ≈ 3,8:1: passa como indicador não-textual, mas não serve como cor de texto (R2 da Story).
    expect(razaoContraste(RING, ACCENT)).toBeLessThan(PISO_TEXTO);
  });
});

describe('tokens semânticos como texto sobre o canvas — WCAG 1.4.3 (≥ 4,5:1)', () => {
  it('destructive/warning/success/info atingem o piso de texto sobre branco', () => {
    for (const token of [DESTRUCTIVE, WARNING, SUCCESS, INFO]) {
      expect(atendeContraste(token, BRANCO, PISO_TEXTO)).toBe(true);
    }
  });
});

describe('fase vermelha — o utilitário reprova o que deve reprovar', () => {
  it('um par de baixo contraste NÃO atende o piso de texto', () => {
    // Cinza claro sobre branco: reprovaria WCAG 1.4.3. Se isto passasse, o gate seria inútil.
    expect(atendeContraste('#cccccc', BRANCO, PISO_TEXTO)).toBe(false);
    expect(razaoContraste('#cccccc', BRANCO)).toBeLessThan(PISO_NAO_TEXTUAL);
  });

  it('cores iguais nunca atendem nenhum piso', () => {
    expect(atendeContraste(BRANCO, BRANCO, PISO_NAO_TEXTUAL)).toBe(false);
  });
});
