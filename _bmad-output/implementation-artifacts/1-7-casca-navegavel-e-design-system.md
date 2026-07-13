---
story_key: 1-7-casca-navegavel-e-design-system
epic: 1
status: review
release: CORE (Lote 1)
risco: NORMAL
baseline_commit: 549f18745a148642ba061faa426af7d1193402a5
gate_arquitetura: N/A — casca de frontend + design system. Sem migration, sem nova superfície de segurança (a autorização é do servidor, Stories 1.6/1.3). Esconder item de navegação é UX, não fronteira de segurança.
---

# Story 1.7 — Casca navegável e design system

**As a** usuário autenticado,
**I want** uma casca consistente que respeite minhas permissões e seja responsiva,
**So that** eu me oriente e navegue em qualquer largura de tela.

**Status: ready-for-dev.** Classificada **CORE** (Lote 1), risco **NORMAL** — é a casca de frontend
(Sidebar + Topbar + rota do Dashboard) e o **design system** (tokens visuais, botões, componentes
fundamentais). Não há migration, não há nova regra de negócio e **não há nova fronteira de segurança**:
a autorização efetiva é do **servidor** (Stories 1.6/1.3). Esconder um item de navegação é **UX**, não
segurança — mesmo que um item aparecesse indevidamente, o backend negaria a ação (1.6). Dependências
**1.4** (identidade/sessão) e **1.6** (papel efetivo) estão `done` e no `main`.

> **Por que NORMAL:** a superfície é visual e estrutural. O único acréscimo no backend é **aditivo e
> mínimo** — expor o `papel` já resolvido no contexto (1.6) no `GET /organizations/current`, para a
> topbar mostrar a Organização atual e a navegação se adaptar. Nenhuma regra de domínio migra para o
> frontend (CLAUDE.md): a casca **reflete** permissões, nunca as **decide**.

---

## Escopo (do épico, congelado)

Sidebar; Topbar; rota do Dashboard; **tokens visuais** (cores/tipografia/spacing/radius/elevation);
botões e **componentes fundamentais**; **navegação adaptada às permissões** (itens sem acesso
ocultos/desabilitados, **sem revelar recursos**); item ativo com **`aria-current`**; **espaços
estruturais reservados**; **comportamento responsivo** da casca.

**Rastreabilidade:** UX-DR1, DR2, DR3, DR4, DR17, DR18; NFR-4; parte de FR-4 (rota/casca, **não**
conteúdo). [Source: epics.md#Story-1.7; EXPERIENCE.md; DESIGN.md]

**Fora do escopo (do épico — Constitution II):**
- **Busca Global** e **Notificações** como controles **funcionais** (só nos Épicos respectivos — 7 e 5);
  na casca ficam **espaços estruturais reservados**, sem controle falso.
- **Indicadores do Dashboard** (FR-4): a rota do Dashboard entrega **só a casca**, sem indicadores.
- **Estados/acessibilidade transversais** completos (loading/vazio/erro/etc. e a11y aprofundada) →
  **Story 1.8**. Aqui só a base: `aria-current`, foco visível (`ring`), navegação por teclado do shell.
- Sem botões sem efeito, sem dados fictícios (INV-ADMIN-02 em espírito).

**Demonstração vertical (do épico):** casca navegável, responsiva, adaptada a permissões.

---

## Acceptance Criteria

1. **AC1 — casca + navegação adaptada.** *Given* um usuário autenticado *When* acessa *Then* vê
   **Sidebar + Topbar** e a navegação **se adapta às permissões** (itens sem acesso ocultos/
   desabilitados, **sem revelar recursos**).
2. **AC2 — item ativo acessível.** *Given* o item de navegação ativo *When* exibido *Then* usa
   **`aria-current`** e **não depende só de cor** (fundo `accent` + ícone laranja + peso, além do texto).
3. **AC3 — sem controle falso, sem dado fictício.** *Given* áreas ainda não entregues (Busca/
   Notificações) *When* a casca é exibida *Then* **não há controles funcionais falsos nem dados
   fictícios**; a rota do **Dashboard renderiza a casca sem indicadores de FR-4**.
4. **AC4 — responsivo.** *Given* os breakpoints suportados *When* a casca é acessada em diferentes
   larguras *Then* Sidebar, Topbar, navegação e conteúdo **permanecem utilizáveis**, sem sobreposição,
   corte de ações essenciais ou dependência **exclusiva de hover**.

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** `pre-implementation-check` (risco NORMAL; confirmar acréscimo aditivo
  do `papel` no endpoint); `context7-check` de **Tailwind 4** (config CSS-first `@theme`) e **Next 16**
  (App Router, layout aninhado por segmento `/painel`).
- [ ] **T2 — Tokens visuais (design system).** `globals.css` com `@theme` do Tailwind 4: paleta
  (primary `#FF7200`, accent `#FFF3E8`, ring `#CC5B00`, destructive `#D92D20`, warning `#A15C00`,
  neutros), radius (button/input 8px, card 12px), spacing base 8, fonte **Inter**. Fiel ao `DESIGN.md`. (AC2)
- [ ] **T3 — Componentes fundamentais.** `Botao` (primary/secondary/tertiary/destructive) com foco
  visível (`ring`), área de toque mínima e `aria` correto. Base reutilizável — sem componentes sem
  consumidor (Constitution II). (AC2, AC4)
- [ ] **T4 — Backend: expor `papel` no contexto atual.** `GET /organizations/current` passa a incluir
  `papel` (lido de `RequestContext.obter().papel`, já resolvido na 1.6). Aditivo; sem nova query. Teste
  de contrato atualizado. (AC1)
- [ ] **T5 — Casca: Sidebar + Topbar + layout `/painel`.** Layout aninhado do segmento autenticado com
  **Sidebar** (navegação primária, item ativo `aria-current`) e **Topbar** (contexto da Organização
  atual à direita; **espaços reservados** para Busca/Notificações/Perfil, **não funcionais**). (AC1, AC2, AC3)
- [ ] **T6 — Navegação adaptada às permissões.** Config declarativa de itens de navegação, cada um com
  visibilidade opcional por papel; a casca filtra pelo `papel` do servidor. Item oculto **não é
  renderizado** (sem revelar recurso). Hoje o único item real é o **Dashboard** (visível a toda
  Membership ativa); o mecanismo fica pronto para os Épicos de domínio. (AC1)
- [ ] **T7 — Rota do Dashboard (casca).** `/painel` (ou `/painel/dashboard`) renderiza a casca **sem
  indicadores de FR-4** — nada de dado fictício. (AC3)
- [ ] **T8 — Responsividade.** Desktop: sidebar + topbar. Tablet: **sidebar recolhível**. Mobile:
  navegação adaptada (menu/topbar). Sem sobreposição, sem corte de ação essencial, sem depender só de
  hover; `prefers-reduced-motion` respeitado em transições. (AC4)
- [ ] **T9 — Testes.** Unidade do mecanismo de navegação (dado papel + config → itens corretos; item
  oculto não aparece); render da casca (Sidebar/Topbar presentes; `aria-current` no ativo; Dashboard sem
  indicadores); contrato do endpoint com `papel`. (todos)
- [ ] **T10 — Gates de conclusão.** `security-check` leve (nenhuma regra de domínio no frontend; nav é
  UX), reexecução dos gates de qualidade, `commit-check`.

---

## Dev Notes

### Onde vive
- **Frontend em `apps/web`** (Next 16, App Router, React 19, Tailwind 4). A casca é o **layout aninhado**
  do segmento autenticado (`app/painel/layout.tsx`), envolvendo as rotas protegidas. **Nenhuma regra de
  domínio no frontend** (CLAUDE.md) — a casca reflete permissões vindas do servidor.
- **Backend:** único toque — `apps/api/src/organizations/organizations.controller.ts` passa a incluir o
  `papel` no retorno de `/organizations/current` (já disponível no `RequestContext`). Aditivo.

### Design system — tokens (fonte: `DESIGN.md`, autoritativa)
- **Cores:** `background #FFFFFF`, `surface-soft #FAFAFA`, `muted #F5F5F5`, `muted-foreground #707072`,
  `foreground #111111` (Ink — inclusive **texto sobre laranja**), `foreground-soft #39393B`,
  `disabled #9E9EA0`, `border #E5E5E5`; `primary #FF7200`, `primary-hover #F26A00`,
  `primary-pressed #CC5B00`, `accent #FFF3E8`, `accent-border #FFD0A8`; `ring #CC5B00`,
  `ring-soft #FFB066`; `destructive #D92D20`, `success #157A52`, `info #2563EB`, `warning #A15C00`.
- **Fonte:** Inter. **Radius:** button/input 8px, card 12px, modal 16px. **Spacing:** base 8 (4/8/12/16/24/32/48).
- **Regra de marca:** 85–90% neutros + 10–15% identidade/estados. O laranja **orienta, não domina**.
- **Sidebar item ativo:** `bg accent #FFF3E8` + `ícone laranja` + `weight 600` + **`aria-current`** —
  nunca só cor. Sidebar **nunca** inteira laranja. [Source: DESIGN.md; EXPERIENCE.md#Sidebar]
- **Tailwind 4** é **CSS-first**: tokens em `@theme` no `globals.css` (verificar no `context7-check`).

### Navegação adaptada = UX, não segurança
A autorização efetiva é **do servidor** (1.6, deny-by-default; 1.3, contexto). Ocultar um item que o
usuário não pode ver é **conveniência de UX** e evita ruído — **não** é a fronteira de segurança. Por
isso é seguro filtrar a nav pelo `papel` que o servidor informa: mesmo que um item vazasse, a ação seria
negada no backend. A regra "sem revelar recursos" (INV-REPORT-01) é honrada **não renderizando** o item
oculto (nada no DOM). Como os módulos de domínio ainda não existem, o único item real é o **Dashboard**
(visível a toda Membership ativa); o mecanismo de filtragem existe e é testado para os Épicos seguintes.

### Topbar — contexto da Organização atual
A topbar mostra a **Organização atual** (nome), vinda de `/organizations/current`. Busca e Notificações
são **espaços reservados** (estruturais), **sem** controle funcional — os Épicos 7 e 5 os preenchem. O
menu de Perfil idem (Story 1.11). Sem selo "Em breve" para API/Tokens/Webhooks (Non-Goals).

### Responsividade (EXPERIENCE.md §32)
Desktop (1024+): sidebar + topbar. Tablet (768–1023): **sidebar recolhível** + topbar. Mobile
(320–767): navegação adaptada (menu/topbar), uma coluna, ações principais acessíveis, **sem depender de
hover**. `prefers-reduced-motion` respeitado.

### Acessibilidade — base (o resto é 1.8)
Aqui: `aria-current` no item ativo, **foco visível** (`ring #CC5B00`) em todo controle, navegação por
teclado do shell, nomes acessíveis em controles só-ícone. O sistema **transversal** de estados e a
verificação de contraste completa do `ring` contra todos os fundos são da **Story 1.8** (dependente
desta). [Source: EXPERIENCE.md#Piso-de-Acessibilidade]

### Sistema de UI — shadcn/ui + Radix + Tailwind (decisão de arquitetura)
O `ui_system` é **shadcn/ui + Radix + Tailwind** [Source: ARCHITECTURE-SPINE.md#stack (linha 234);
DESIGN.md#ui_system (linha 6)] — **não** é escolha desta Story, é a stack congelada. A 1.7 **estabelece**
esse sistema (é o "design system" do escopo):
- Instala a base do padrão shadcn/ui: `class-variance-authority` (variantes), `clsx` + `tailwind-merge`
  (utilitário `cn`), `lucide-react` (ícones). Tokens como **CSS variables** no `globals.css` mapeadas
  ao tema do **Tailwind 4** via `@theme`/`@theme inline` (convenção shadcn/ui para Tailwind 4 —
  confirmar no `context7-check`).
- **Radix NÃO é instalado nesta Story:** nenhuma primitiva interativa (dropdown, dialog) tem consumidor
  aqui — Perfil, Busca e Notificações são **espaços reservados**. Radix entra na Story que introduzir a
  primeira primitiva (Constitution II — sem abstração especulativa).

### Project Structure Notes
- `app/painel/layout.tsx` (novo) — casca; `app/painel/page.tsx` (existente, de 1.5) vira o conteúdo do
  Dashboard dentro da casca. Componentes de UI em `components/ui/` (padrão shadcn/ui); `lib/utils.ts`
  com `cn()`; casca (Sidebar/Topbar) em `app/painel/_componentes/`. Tokens no `globals.css`.

### References
- [Source: epics.md#Story-1.7] — escopo, dependências, BDD.
- [Source: DESIGN.md] — tokens definitivos (paleta, radius, spacing, Inter, botões, sidebar ativa).
- [Source: EXPERIENCE.md#Chrome-Navegação; #Piso-de-Acessibilidade; #Responsividade-§32] — sidebar/topbar,
  a11y-piso, breakpoints.
- [Source: apps/web/app/painel/page.tsx; lib/auth.ts] — casca mínima atual (1.5) a evoluir.
- [Source: apps/api/src/organizations/organizations.controller.ts] — endpoint a estender com `papel`.

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code)

### Debug Log References

- Stack de UI: confirmado no SPINE/DESIGN.md que é **shadcn/ui + Radix + Tailwind** (não Tailwind puro).
  A 1.7 estabelece a base do padrão (cva/clsx/tailwind-merge/lucide); **Radix adiado** (sem consumidor —
  Constitution II).
- Testes de componente: o `vitest.config` do web era `environment: node` só para `.ts`. Adicionados
  `@vitejs/plugin-react`, `.tsx` no include, setup do jest-dom e `jsdom` por-arquivo (docblock), sem
  quebrar os testes de lógica da 1.5.
- Falha de acúmulo de DOM entre renders (sem `globals:true`, o auto-cleanup do Testing Library não roda)
  → `afterEach(cleanup)` explícito nos testes de componente.
- Contrato do `fetchOrgAtual` mudou (agora exige `id+name+papel`) → teste da 1.5 (`auth.test.ts`)
  atualizado, com caso adicional para contrato incompleto.

### Completion Notes List

- Design system (shadcn/ui + Tailwind 4): tokens do `DESIGN.md` em `globals.css` (`:root` + `@theme
  inline`), Inter via `next/font`, `cn()`, `Botao` (cva, 4 variantes, foco `ring`, `type` seguro).
- Casca do segmento autenticado: `app/painel/layout.tsx` (Server Component) monta **Sidebar** +
  **Topbar** + conteúdo; contexto deduplicado por `obterContexto` (React `cache`).
- Navegação adaptada às permissões (UX, não segurança): `itensVisiveis(papel, itens)` filtra; item
  vetado **fora do DOM** (não revela recurso). Item ativo com `aria-current="page"` + `bg-accent` +
  ícone `primary` + peso (não só cor). Hoje só o Dashboard; mecanismo pronto para os Épicos de domínio.
- Topbar mostra a Organização atual; Busca/Notificações/Perfil são **espaços reservados não-interativos**
  (sem controle falso). Dashboard **sem indicadores FR-4**, estado honesto preservado.
- Backend: `/organizations/current` agora inclui `papel` (do contexto da 1.6; aditivo, sem query nova).
- Responsividade: sidebar recolhe em telas estreitas (`max-md:hidden`), `min-w-0` anti-overflow,
  `motion-reduce`. Gates: security-check e observability-check **APROVADOS**. Qualidade verde:
  typecheck (API+Web), format, lint, **API 219/219**, **Web 46/46**, build.

### File List

**Web — novos:** `app/globals.css` (tokens), `lib/utils.ts`, `lib/navegacao.ts`, `lib/contexto.ts`,
`components/ui/button.tsx`, `app/painel/layout.tsx`, `app/painel/_componentes/Sidebar.tsx`,
`app/painel/_componentes/Topbar.tsx`, `test/setup.ts`, `test/navegacao.test.ts`, `test/button.test.tsx`,
`test/casca.test.tsx`.
**Web — modificados:** `app/layout.tsx` (Inter), `app/painel/page.tsx` (Dashboard na casca),
`lib/auth.ts` (`fetchOrgAtual` com `orgNome`/`papel`), `vitest.config.ts` (react/jsdom/setup),
`package.json` + `pnpm-lock.yaml` (deps), `test/auth.test.ts` (contrato atualizado).
**API — modificados:** `src/organizations/organizations.controller.ts` (`papel` no retorno),
`test/tenant-context-http.test.ts` (contrato com `papel`).
**Processo:** `specs/1-7-.../{spec,plan,tasks}.md`; `gates/1-7/*`; `sprint-status.yaml`.

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (create-story) a partir de `epics.md` (Story 1.7), `DESIGN.md` (tokens), `EXPERIENCE.md` (chrome/a11y/responsividade) e do estado atual do `apps/web` (casca mínima da 1.5). Classificada **CORE (Lote 1)**, risco **NORMAL** (casca/UX; sem migration; sem nova fronteira de segurança — autorização é do servidor). Único toque no backend: expor `papel` (já no contexto da 1.6) no `/organizations/current`. Dependências 1.4/1.6 `done`. Status → ready-for-dev. |
