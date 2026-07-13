# Plan — Story 1.8: Estados honestos e acessibilidade transversal

> Compacto. Fonte: `spec.md` + Story BMAD. Risco NORMAL. Só `apps/web`.

## Stack e fronteiras
- **Next 16 / React 19 / Tailwind 4 (CSS-first)**, padrão shadcn/ui já estabelecido na 1.7.
- Componentes de estado em `components/ui/estado.tsx` (vizinho de `button.tsx`). Utilitário de
  contraste em `lib/contraste.ts` (função pura, testável em `environment: node`).
- **Sem backend, sem migration, sem dependência nova.** Reutiliza `cn`, `Botao`, `lucide-react`,
  tokens do `globals.css`, e o modelo `EstadoOrg`.

## Decisões técnicas
- **Contraste por cálculo puro** (não axe): razão WCAG a partir de luminância relativa (sRGB →
  linear → `L`), `(L1+0.05)/(L2+0.05)`. É a única prova confiável (jsdom não pinta). Cores lidas dos
  tokens congelados do `DESIGN.md`.
- **Base `Estado` + variantes** só com consumidor concreto (`EstadoVazio`/`EstadoErro`/`SemPermissao`/
  `Carregando`). Sem `Pendente`/`Aguardando` isolados (Constitution II). Ação de recuperação do
  `EstadoErro` usa `Botao` (foco/área de toque já corretos).
- **`role` estático** (`status`/`alert`), sem `aria-live` explícito (render de servidor, sem troca
  client-side na 1.8).
- **A11y por `@testing-library`** (roles, nomes, foco, ordem de DOM) — sem `jest-axe`.

## Touch-points (arquivos)
- **Novos:** `apps/web/lib/contraste.ts`, `apps/web/components/ui/estado.tsx`,
  `apps/web/test/contraste.test.ts`, `apps/web/test/estado.test.tsx`,
  `apps/web/test/acessibilidade.test.tsx`.
- **Modificados:** `apps/web/app/painel/page.tsx` (consumo de `Estado*`). Possível ajuste em
  `test/casca.test.tsx` se a a11y for estendida ali (senão, arquivo novo).

## Sequência (red-green-refactor)
T001 (contraste) e T002 (componentes) podem ir em paralelo → T003 (consumo no Dashboard) →
T004 (a11y transversal) → T005 (gates).

## Riscos (do relatório de preparação)
- **Contraste `ring` vs `accent` ≈ 3,8:1** → passa 3:1 (não-textual), mas `ring` **nunca** como texto.
- Não introduzir dependência de a11y sem gate; não replicar cor crua do Login; tab real fora do
  unitário (registrado).

## Constitution
Sem violação: sem abstração especulativa (todo componente tem consumidor), sem antecipar Fase 2, sem
regra de domínio no frontend, estado não-revelador honra INV-REPORT-01. Gate de contraste é
técnico-de-implementação (não decisão de Produto).
