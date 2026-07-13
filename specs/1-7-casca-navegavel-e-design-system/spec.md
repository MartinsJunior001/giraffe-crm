# Spec — Story 1.7: Casca navegável e design system

> Compacto (risco NORMAL — casca/UX). Fonte: `_bmad-output/implementation-artifacts/1-7-...md`.

## Contexto
O `apps/web` tem só a casca mínima da 1.5 (login, painel). A 1.7 estabelece o **design system**
(shadcn/ui + Tailwind 4) e a **casca navegável** (Sidebar + Topbar + Dashboard) do segmento autenticado.
A autorização é do servidor (1.6/1.3); a nav apenas **reflete** permissões. Único toque de backend:
expor `papel` no `/organizations/current`.

## Requisitos funcionais
- **FR-701** — Design tokens (cores, tipografia Inter, radius, spacing) definidos no `globals.css`
  (Tailwind 4 `@theme`/`@theme inline`, convenção shadcn/ui), fiéis ao `DESIGN.md`.
- **FR-702** — Componentes fundamentais: `Button` (primary/secondary/tertiary/destructive) via `cva`,
  com foco visível (`ring`) e `aria` correto.
- **FR-703** — Casca do segmento autenticado: **Sidebar** (navegação primária) + **Topbar** (contexto
  da Organização atual), como layout aninhado de `/painel`.
- **FR-704** — Item de navegação ativo usa **`aria-current="page"`** e **não depende só de cor** (fundo
  `accent` + ícone `primary` + peso, além do texto).
- **FR-705** — Navegação **adaptada às permissões**: config declarativa; item cujo papel não permite
  **não é renderizado** (sem revelar recurso). Filtragem pelo `papel` vindo do servidor.
- **FR-706** — `GET /organizations/current` inclui `papel` (do `RequestContext`, resolvido na 1.6);
  aditivo, sem query nova.
- **FR-707** — Busca, Notificações e Perfil são **espaços estruturais reservados** na topbar — **sem
  controle funcional falso**; o Dashboard renderiza a casca **sem indicadores de FR-4**; **sem dado
  fictício**.
- **FR-708** — Responsividade: desktop (sidebar+topbar), tablet (sidebar recolhível), mobile (nav
  adaptada), sem sobreposição, sem corte de ação essencial, **sem depender só de hover**;
  `prefers-reduced-motion` respeitado.

## Critérios de sucesso (verificáveis)
- **SC-701** — Render da casca mostra Sidebar + Topbar; teste confirma presença de ambos. (FR-703)
- **SC-702** — Item ativo tem `aria-current="page"` e classes de fundo/ícone/peso (não só cor). (FR-704)
- **SC-703** — Filtro de navegação: dado um `papel` e a config, os itens corretos aparecem; item vetado
  **não** está no DOM (fase vermelha: um item que deveria sumir e aparece falha o teste). (FR-705)
- **SC-704** — `Button` renderiza as 4 variantes com as classes esperadas e é focável com `ring`. (FR-702)
- **SC-705** — `/organizations/current` (API real) retorna `papel` além de `id/name/slug`; teste de
  contrato atualizado. (FR-706)
- **SC-706** — A topbar mostra o nome da Organização atual; Busca/Notificações/Perfil são marcadores sem
  handler (nenhum `onClick`/rota funcional). (FR-707)
- **SC-707** — A rota do Dashboard não renderiza nenhum indicador de FR-4 nem dado fictício. (FR-707)
- **SC-708** — Tokens: `bg-primary`/`text-foreground`/`ring-ring` etc. resolvem para os hex do
  `DESIGN.md` (teste de presença dos CSS vars/utilitários). (FR-701)

## Fora de escopo (Constitution II)
Busca/Notificações funcionais; indicadores do Dashboard (FR-4); estados/a11y transversais (1.8); Radix;
lib de UI além da base shadcn/ui. Sem migration.

## Invariantes materializados
Nenhuma regra de domínio no frontend · `aria-current` no ativo · não revelar recurso (item oculto fora do
DOM) · sem dado fictício apresentado como real (INV-ADMIN-02 em espírito).
