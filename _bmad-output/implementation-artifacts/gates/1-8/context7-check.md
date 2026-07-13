# context7-check — Story 1.8 (estados honestos e acessibilidade)

## Superfície de biblioteca/stack tocada
- **Tailwind 4** (CSS-first, `@theme`) — tokens semânticos de estado usados como utilitários.
- **@testing-library/react + Vitest 4 (jsdom)** — já em uso desde a 1.7 (roles/nomes/foco).
- **Nenhuma dependência nova.** `jest-axe`/axe-core **não** adicionados (decisão registrada).

## Baseline de versão
Conforme `apps/web/package.json` (Tailwind 4, Vitest 4, @testing-library já instalados na 1.7). Versões
fixadas no `pnpm-lock.yaml`. Sem upgrade nesta Story.

## Consulta (MCP Context7)
- Biblioteca: `/websites/tailwindcss` (High, benchmark 88.46), consulta sobre **definição de token de
  cor no `@theme` e geração de utilitários**.
- **Resultado:** confirmado que definir `--color-<nome>` no `@theme` gera automaticamente os utilitários
  `text-<nome>`, `bg-<nome>`, `ring-<nome>`, etc. É **exatamente** o mecanismo já em uso na 1.7
  (`bg-accent`, `text-primary`, `ring-ring`, `text-destructive`). Nenhuma API nova é necessária para os
  componentes de estado — eles reutilizam os tokens já mapeados no `globals.css` (`@theme inline`).

## Contraste WCAG 2.2 (baseline documental, não biblioteca)
A razão de contraste é calculada por **função pura** (luminância relativa sRGB→linear;
`(L1+0.05)/(L2+0.05)`), padrão WCAG — **não** é uma biblioteca de terceiros. Critérios de referência:
- **1.4.3** (texto normal) ≥ 4,5:1;
- **1.4.11** (componentes de UI / gráficos não-textuais, inclui o anel de foco) ≥ 3:1;
- **2.4.7** (foco visível).
Fonte: especificação WCAG 2.2 (W3C). Sem dependência de runtime.

## Divergências com o plano
Nenhuma. O mecanismo de tokens do Tailwind 4 sustenta os componentes de estado sem nada novo. A decisão
de **não** usar axe-core (jsdom não computa contraste renderizado) está alinhada à documentação: o teste
de contraste é cálculo puro; roles/nomes/foco vão por `@testing-library`.

## Veredito
**APROVADO** — nenhuma biblioteca nova; padrão de token do Tailwind 4 confirmado no Context7 e já em uso;
cálculo de contraste é WCAG puro. Prosseguir para implementação.
