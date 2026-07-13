/**
 * Razão de contraste WCAG 2.2 (Story 1.8) — função pura, sem dependência externa.
 *
 * É o **gate nomeado** da Story: provar que o anel de foco (`ring #CC5B00`) e os tokens semânticos
 * atingem os pisos de contraste. jsdom não pinta pixels e o axe-core não mede contraste sem layout
 * real; por isso a verificação é feita por cálculo, a partir dos tokens congelados do DESIGN.md.
 *
 * Fórmula (W3C WCAG 2.2):
 * - luminância relativa L de uma cor sRGB;
 * - razão = (Lclaro + 0,05) / (Lescuro + 0,05).
 *
 * Pisos: texto normal ≥ 4,5:1 (1.4.3); componente de UI / gráfico não-textual, inclusive o anel de
 * foco, ≥ 3:1 (1.4.11).
 */

/** Piso WCAG 1.4.3 — texto normal. */
export const PISO_TEXTO = 4.5;
/** Piso WCAG 1.4.11 — componente de UI / elemento não-textual (anel de foco, bordas de estado). */
export const PISO_NAO_TEXTUAL = 3;

/** Converte `#rgb` ou `#rrggbb` nos três canais 0–255. Lança em entrada inválida (falha honesta). */
function hexParaRgb(hex: string): readonly [number, number, number] {
  const limpo = hex.trim().replace(/^#/, '');
  const expandido =
    limpo.length === 3
      ? limpo
          .split('')
          .map((c) => c + c)
          .join('')
      : limpo;
  if (!/^[0-9a-fA-F]{6}$/.test(expandido)) {
    throw new Error(`Cor hex inválida: ${hex}`);
  }
  const n = Number.parseInt(expandido, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Luminância relativa (WCAG): sRGB → linear → soma ponderada. */
function luminanciaRelativa(hex: string): number {
  const [r, g, b] = hexParaRgb(hex).map((canal) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores hex (ordem irrelevante). Resultado em [1, 21]. */
export function razaoContraste(corA: string, corB: string): number {
  const la = luminanciaRelativa(corA);
  const lb = luminanciaRelativa(corB);
  const claro = Math.max(la, lb);
  const escuro = Math.min(la, lb);
  return (claro + 0.05) / (escuro + 0.05);
}

/** Verdadeiro se o par atinge o piso informado (default: piso de texto). */
export function atendeContraste(corA: string, corB: string, piso: number = PISO_TEXTO): boolean {
  return razaoContraste(corA, corB) >= piso;
}
