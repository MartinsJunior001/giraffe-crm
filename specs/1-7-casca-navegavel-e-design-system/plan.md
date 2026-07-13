# Plan — Story 1.7: Casca navegável e design system

> Compacto. Fonte: `spec.md` (FR-701..708, SC-701..708). Stack de UI congelada: shadcn/ui + Radix +
> Tailwind 4 (SPINE/DESIGN.md). Radix adiado (sem consumidor — Constitution II).

## Stack e fronteiras
- **apps/web:** Next 16 (App Router), React 19, Tailwind 4 (CSS-first). Base shadcn/ui:
  `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.
- **apps/api:** único toque — `organizations.controller.ts` inclui `papel` no retorno de
  `/organizations/current` (lido de `RequestContext.obter().papel`). Aditivo.
- **Nenhuma regra de domínio no frontend.** A nav reflete permissões do servidor.

## Decisões técnicas
- **P1 — Tokens (`app/globals.css`):** `:root` com CSS variables semânticas do `DESIGN.md`; `@theme
  inline` mapeando para utilitários (`--color-primary: var(--primary)`, `--color-foreground`,
  `--color-accent`, `--color-ring`, `--color-destructive`, `--color-warning`, `--color-border`,
  `--color-muted`, ...), `--radius-card: 12px`, `--font-sans: "Inter"...`. Inter via `next/font`.
- **P2 — `lib/utils.ts`:** `cn(...)` = `twMerge(clsx(...))` (padrão shadcn/ui).
- **P3 — `components/ui/button.tsx`:** `cva` com variantes primary/secondary/tertiary/destructive e
  tamanhos; `focus-visible:ring-2 ring-ring`; área de toque adequada; `aria` correto. Componente real
  (consumidor: o próprio shell + logout).
- **P4 — `lib/navegacao.ts`:** tipo `ItemNav { href, rotulo, icone, papeis? }`; `itensVisiveis(papel,
  itens)` filtra por `papeis` (ausência de `papeis` = visível a todos). Só o **Dashboard** hoje. Pura,
  testável, sem regra de domínio (só filtragem de apresentação).
- **P5 — Casca (`app/painel/layout.tsx` + `_componentes/`):** Server Component lê contexto
  (`fetchOrgAtual` → `{orgId, orgNome, papel}`); se `sem-sessao` → redirect login; monta `<Sidebar
  itens={itensVisiveis(papel)} ativo={pathname}/>` + `<Topbar orgNome=.../>` + `{children}`. Sidebar:
  item ativo `aria-current="page"` + `bg-accent`/ícone `primary`/peso. Topbar: nome da Org à direita;
  Busca/Notificações/Perfil como marcadores `aria`-rotulados **sem** handler.
- **P6 — Dashboard (`app/painel/page.tsx`):** conteúdo dentro da casca; **sem indicadores FR-4**;
  mantém o estado honesto de contexto (org ativa × sem-org × indisponível) herdado da 1.5.
- **P7 — Responsividade:** Tailwind breakpoints (`md`/`lg`); sidebar recolhível em tablet, nav adaptada
  em mobile (sem depender de hover); `motion-reduce:` respeitado.
- **P8 — Backend `papel`:** `OrganizacaoAtual` ganha `papel`; `current()` inclui
  `this.requestContext.obter().papel`; teste de contrato atualizado.

## Sequência (red-green)
1. Deps + P1/P2 (tokens + cn) → SC-708.
2. P3 Button → SC-704.
3. P8 API papel → SC-705.
4. P4 navegação → SC-703.
5. P5 casca (Sidebar/Topbar) → SC-701, SC-702, SC-706.
6. P6 Dashboard → SC-707.
7. P7 responsividade (revisão + asserções de classes).

## Testes
- Web (Vitest jsdom + Testing Library): `navegacao.test.ts` (filtro), `button.test.tsx` (variantes/foco),
  `casca.test.tsx` (Sidebar/Topbar/aria-current/Dashboard-sem-indicador). Fase vermelha onde couber.
- API: `organizations` (integração real) — `papel` no contrato.

## Riscos/ressalvas
Não inferir domínio no cliente; não instalar Radix sem consumidor; não introduzir controle falso; a
verificação de contraste do `ring` é da 1.8. Testing Library já disponível? confirmar; se não, adicionar
`@testing-library/react` como devDep (mínimo para render de componente).
