# Tasks — Story 1.7: Casca navegável e design system

> Derivado de `plan.md` (P1–P8) e `spec.md`. `[ ]` pendente · `[x]` concluído com evidência real.

## Fase 0 — Gates pré-código
- [x] T001 — `pre-implementation-check` (NORMAL) — `gates/1-7/pre-implementation-check.md` (APROVADO).
- [x] T002 — `context7-check` Tailwind 4 — `gates/1-7/context7-check.md` (APROVADO).

## Fase 1 — Design system base
- [x] T003 — Instaladas `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` no `@giraffe/web`.
- [x] T004 — Tokens em `app/globals.css` (`:root` + `@theme inline`, `DESIGN.md`); Inter via `next/font`. (FR-701)
- [x] T005 — `lib/utils.ts` com `cn()`. (P2)
- [x] T006 — `components/ui/button.tsx` (`cva`, 4 variantes, foco `ring`, `type` seguro) + `button.test.tsx`. (FR-702, SC-704)

## Fase 2 — Backend: papel no contexto
- [x] T007 — `/organizations/current` inclui `papel`; teste de contrato (API real) atualizado. (FR-706, SC-705)

## Fase 3 — Navegação adaptada
- [x] T008 — `lib/navegacao.ts`: `ItemNav`, `itensVisiveis`, `ehAtivo`; `navegacao.test.ts` (fase vermelha
  do item vetado). (FR-705, SC-703)

## Fase 4 — Casca
- [x] T009 — `lib/auth.ts`: `fetchOrgAtual` retorna `{orgId, orgNome, papel}`; `lib/contexto.ts`
  (`obterContexto` deduplicado por `cache`). (FR-703, FR-706)
- [x] T010 — `Sidebar.tsx` (item ativo `aria-current="page"` + `bg-accent`/ícone `primary`/peso) +
  `Topbar.tsx` (Org atual; Busca/Notificações/Perfil como marcadores reservados sem handler). (FR-703, FR-704, FR-707)
- [x] T011 — `app/painel/layout.tsx`: casca (Server Component) monta Sidebar+Topbar+children, filtra nav
  por papel, redireciona login se sem-sessão. (FR-703, FR-705)
- [x] T012 — `app/painel/page.tsx`: Dashboard dentro da casca, **sem indicadores FR-4**, estado honesto. (FR-707)
- [x] T013 — `casca.test.tsx`: Sidebar (`aria-current`, item filtrado ausente, nome acessível) + Topbar
  (Org atual; marcadores sem controle). (SC-701, SC-702, SC-706)

## Fase 5 — Responsividade
- [x] T014 — Sidebar `max-md:hidden` (recolhe em mobile/tablet), busca `max-md:hidden`, `min-w-0` anti-overflow,
  `motion-reduce:transition-none`. Sem hover-only para ações essenciais. (FR-708)

## Fase 6 — Conclusão
- [x] T015 — `security-check` + `observability-check` — `gates/1-7/` (ambos APROVADOS).
- [x] T016 — Gates de qualidade: typecheck (API+Web), format, lint, API 219/219, Web 46/46, build.
- [ ] T017 — Dev Agent Record, File List, Change Log; `commit-check` → commit.
