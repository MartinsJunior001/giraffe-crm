# context7-check — Story 1.7 (casca e design system)

## Tecnologias e versões (baseline do projeto)
- **Tailwind CSS 4** (`apps/web/package.json`: `^4.0.0`).
- **Next.js 16** (App Router), **React 19**.
- Padrão **shadcn/ui + Radix + Tailwind** (ARCHITECTURE-SPINE #stack; DESIGN.md#ui_system). Nesta Story
  entram apenas `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (base do padrão
  shadcn/ui). **Radix não** — sem primitiva interativa consumidora ainda (Constitution II).

## Fonte consultada
Context7 MCP — `/websites/tailwindcss` (High, 3560 snippets). Docs oficiais Tailwind v4 (colors, theme,
font-family).

## API confirmada (Tailwind 4 — CSS-first)
```css
@import "tailwindcss";

/* Tokens semânticos como CSS variables (convenção shadcn/ui) */
:root {
  --primary: #FF7200;
  --foreground: #111111;
  /* ... */
}

/* @theme inline mapeia as vars para utilitários (bg-primary, text-foreground, ring-ring, ...) */
@theme inline {
  --color-primary: var(--primary);
  --color-foreground: var(--foreground);
  --radius-card: 12px;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}
```
- `@theme { --color-x: #hex }` cria tanto o utilitário (`bg-x`) quanto a var `--color-x` — confirmado.
- `@theme inline { --color-x: var(--y) }` referencia outra CSS variable — confirmado (docs "Reference
  Other CSS Variables"). É a base do tema semântico do shadcn/ui em Tailwind 4.
- `--font-*`, `--radius-*`, `--font-weight-*` seguem o mesmo mecanismo — confirmado.

## Verificações
- Não há `tailwind.config.js` a manter: Tailwind 4 é CSS-first; a configuração vive no `globals.css`.
- `cn()` (clsx + tailwind-merge) é o utilitário padrão shadcn/ui para compor classes; `cva` para
  variantes de componente (Button). API estável, sem assinatura assumida de memória.

## Divergências com o plano
Nenhuma. A abordagem CSS-first do Tailwind 4 corresponde ao desenho (tokens no `globals.css`).

## Veredito
**APROVADO** — API do Tailwind 4 verificada para a versão instalada; convenção shadcn/ui em Tailwind 4
confirmada. Liberado para implementação.
