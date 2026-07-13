---
story_key: 1-8-estados-honestos-e-acessibilidade-transversal
epic: 1
status: done
release: CORE (Lote 1)
risco: NORMAL
baseline_commit: 4d862bf32ba41f248e7d992a63f8eee83879ba2d
gate_arquitetura: N/A — estados de UI + acessibilidade transversal sobre a casca (Story 1.7). Sem migration, sem toque no backend, sem nova superfície de segurança. O estado "sem permissão" é genérico e proposital não-revelador (INV-REPORT-01); a autorização efetiva permanece no servidor (1.6/1.3).
---

# Story 1.8 — Estados honestos e acessibilidade transversal

**As a** usuário,
**I want** estados claros e uma interface acessível em todos os breakpoints,
**So that** eu entenda o que acontece e opere por qualquer meio.

**Status: ready-for-dev.** Classificada **CORE** (Lote 1), risco **NORMAL** — é a camada
**transversal** de estados de sistema (carregando/vazio/erro/sem permissão/pendente/aguardando)
e o **piso de acessibilidade WCAG 2.2 AA**, testável sobre os componentes e a casca do Épico 1.
**Não há migration, não há toque no backend e não há nova fronteira de segurança.** Depende da
**1.7** (casca + design system), que está `done` e no `main`.

> **Por que NORMAL:** a superfície é visual, estrutural e de acessibilidade, sobre componentes
> que já existem. Não há regra de domínio, não há query nova, não há dado de terceiro. O estado
> "sem permissão" é **genérico e não-revelador** — não enumera recursos —, então **não depende**
> da matriz de permissões (OQ-1..4, ainda `PENDENTE`). Nenhuma decisão de contrato bloqueia o
> início.

---

## Escopo (do épico, congelado)

Estados **carregando / vazio útil / erro / indisponibilidade / acesso negado / pendente /
aguardando**; distinção **zero legítimo × falha**; estado **nunca só por cor** (semântica +
texto + ícone); **foco visível**; **ordem de teclado**; **nomes acessíveis**; **contraste**;
**piso WCAG 2.2 AA**. Testável sobre os componentes e a casca do Épico 1.

**Rastreabilidade:** UX-DR6, DR7 (base), DR8, DR9, DR18; NFR-4, NFR-27 (zero×falha);
INV-REPORT-01 (não revelar recurso). [Source: epics.md#Story-1.8; EXPERIENCE.md; DESIGN.md]

**Fora do escopo (do épico — Constitution II):**
- **Estados específicos de domínio** (Cards, Registros, e-mail, automações) → Épicos 2+.
- **Componentes de estado sem consumidor concreto** (ex.: `Pendente` isolado) — só se cria a
  variante que a casca/Dashboard de hoje efetivamente usa (sem abstração especulativa).
- **`jest-axe`/axe-core** e verificação de contraste **renderizado** — o unitário cobre roles,
  nomes e foco; contraste é provado por **cálculo puro** de razão WCAG. Tab real e pintura de
  pixels ficam para verificação manual/e2e (registrado, não simulado).
- **Correção do `text-red-700` cru do Login** (escopo 1.5) — aqui **não se replica** o padrão,
  mas também não se corrige o Login.

**Demonstração vertical (do épico):** estados e a11y testáveis sobre a casca.

---

## Acceptance Criteria

1. **AC1 — nunca só cor.** *Given* qualquer estado de sistema *When* exibido *Then* combina
   **cor semântica + texto + ícone** (nunca só cor). [UX-DR6/DR8; EXPERIENCE §89]
2. **AC2 — zero legítimo ≠ falha/carregamento.** *Given* um indicador/lista com valor **zero**
   *When* exibido *Then* é **distinguível** de falha e de carregamento (roles/semântica/texto
   distintos; "aguardando" não aparenta sucesso). [NFR-27; EXPERIENCE §99, §176]
3. **AC3 — "sem permissão" não revela o recurso.** *Given* um estado "sem permissão" *When*
   exibido *Then* usa mensagem **genérica**, **sem** nome/rota do recurso não autorizado e sem
   link para ele. [INV-REPORT-01; NFR-4]
4. **AC4 — a11y transversal (WCAG 2.2 AA).** *And* **foco visível**, **ordem de navegação**,
   **nomes acessíveis** e **acesso às ações** permanecem corretos nos breakpoints suportados,
   atendendo WCAG 2.2 AA (inclui contraste do `ring #CC5B00` contra todos os fundos onde aparece
   e dos tokens semânticos usados como texto). [UX-DR9; EXPERIENCE §130-146]

---

## Tasks / Subtasks

- [x] **T001 — Utilitário de contraste WCAG + teste (gate nomeado da Story).** `lib/contraste.ts`
  (função pura de razão de contraste) + `test/contraste.test.ts` (`environment: node`). Prova:
  `ring #CC5B00` ≥ **3:1** (indicador não-textual, WCAG 1.4.11) contra `background #FFFFFF`,
  `accent #FFF3E8`, `muted #F5F5F5`; tokens semânticos (`destructive/warning/success/info`) como
  **texto** ≥ **4,5:1** (1.4.3) sobre `background`. **Fase vermelha obrigatória** (Constitution):
  forçar um par reprovado e confirmar a falha. (AC4) ✅ 9 testes verdes.
- [x] **T002 — Componentes de estado honesto + testes.** `components/ui/estado.tsx`: base `Estado`
  (ícone `aria-hidden` + título + descrição + ação opcional) e variantes com **consumidor
  concreto**: `EstadoVazio`, `EstadoErro`, `SemPermissao`, `Carregando`. `test/estado.test.tsx`
  (`jsdom`). Prova por variante: ícone + texto + token semântico (AC1); `role` correto
  (`status`/`alert`); `EstadoVazio` ≠ `EstadoErro` e ≠ `Carregando` (AC2); `SemPermissao` sem
  nome de recurso e sem `href` (AC3). Reutiliza `cn`, `lucide-react`. (AC1, AC2, AC3) ✅ 5 testes.
- [x] **T003 — Consumir os estados no Dashboard (refactor; consumidor concreto).**
  `app/painel/page.tsx`: os ramos honestos usam `EstadoVazio` (sem-org) e `EstadoErro` (indisponível,
  com link de recuperação real). Prova sobre a casca real: "sem-organizacao" (vazio, `status`) é
  **distinguível** de "indisponivel" (falha, `alert`). (AC2) ✅ 3 testes (`dashboard.test.tsx`).
- [x] **T004 — Gate de a11y transversal sobre a casca.** `test/acessibilidade.test.tsx`. Prova: todo
  controle interativo (Botão + links da casca) tem `focus-visible:ring-2`; a `Navegacao` em **ambas**
  as orientações mantém nome acessível; links com nome acessível; **sem `tabindex` positivo**. (AC4)
  ✅ 5 testes.
- [x] **T005 — Gates.** `pre-implementation-check` **APROVADO**; `context7-check` **APROVADO** (token
  do Tailwind 4 confirmado no MCP Context7; WCAG 2.2 como baseline). `security-check` **APROVADO** e
  `observability-check` **N/A/APROVADO**. Qualidade verde (format/lint/typecheck/**Web 68/68**/build).
  `commit-check` na sequência.

---

## Dev Notes

### Onde vive
- **Somente `apps/web`** (Next 16, Tailwind 4 CSS-first). Componentes de estado em
  `components/ui/estado.tsx` (padrão shadcn/ui, vizinho de `button.tsx`); utilitário de contraste
  em `lib/contraste.ts`. **Nenhum toque no backend** e **nenhuma regra de domínio no frontend**
  (CLAUDE.md). Os estados **renderizam** o modelo já existente (`EstadoOrg`), não o redefinem.

### Decisões já resolvidas (não reabrir)
- **Paleta de estado congelada** (`DESIGN.md`/`globals.css`): erro `#D92D20`, sucesso `#157A52`,
  atenção/atraso `#A15C00`, info `#2563EB`, foco `ring #CC5B00`. **Regra dura:** o laranja
  `#FF7200` **nunca** significa erro/sucesso/alerta; texto sobre laranja é sempre Ink `#111111`.
- **"Nunca só cor"** é invariante transversal (EXPERIENCE §89): cor semântica + texto + ícone.
- **Catálogo de estados** fixado (EXPERIENCE §91-99): loading / vazio útil / erro (com
  recuperação) / sem permissão (não-revelador) / pendente / aguardando (nunca aparenta sucesso).
  A 1.8 implementa **exatamente** esse catálogo — nada de estados de domínio.
- **Estado honesto de contexto** herdado da 1.5/1.7 (`EstadoOrg` em `lib/auth.ts`, motivos
  `sem-sessao | sem-organizacao | indisponivel`) — o **consumidor concreto** que justifica os
  componentes (Constitution II).
- **Foco visível** = padrão `focus-visible:ring-2 ring-ring ring-offset` já convencionado no
  `Botao`/`Navegacao`. `prefers-reduced-motion` respeitado (`motion-reduce:transition-none`).

### Decisões em aberto / riscos (do relatório de preparação)
- **R1 (Médio) — estrutura dos componentes:** criar **só** as variantes com consumidor hoje
  (`EstadoVazio`/`EstadoErro`/`SemPermissao`/`Carregando`). Um base `Estado` é justificável (≥2
  consumidores reais); **não** criar `Pendente`/`Aguardando` isolados sem consumidor concreto —
  se um ramo do Dashboard precisar de "aguardando", aí sim. Sem abstração especulativa.
- **R2 (Alto) — gate de contraste:** jsdom não pinta pixels; axe não mede contraste sem layout.
  Provar por **cálculo puro** de razão WCAG. Preliminar: `ring #CC5B00` vs `accent #FFF3E8`
  ≈ **3,8:1** → passa o piso **3:1** de indicador não-textual, mas **< 4,5:1** → o `ring`
  permanece **borda/outline, nunca texto**.
- **R3 (Baixo/Médio) — `aria-live`:** os estados do Dashboard são render de servidor (não troca
  client-side). Usar `role="status"` (loading/vazio) e `role="alert"` (erro) — semântica correta
  e validável em jsdom. **Não** antecipar `aria-live` sem troca dinâmica real.
- **R4 (Médio) — ferramenta de a11y:** **não** adicionar `jest-axe`/axe-core de início (exigiria
  gate de dependência). Cobrir com `@testing-library` (roles/nomes/foco) + contraste calculado.
- **R5 (Baixo) — Login com cor crua** (`text-red-700` em `app/login/page.tsx:29`): fora de escopo;
  **não replicar** o padrão (estados usam sempre tokens), **não corrigir** aqui.
- **R6 (Baixo) — ordem de teclado real** não observável em jsdom: provar via ordem de DOM +
  ausência de `tabindex` positivo; tab nativo fica para verificação manual/e2e.

### Gate de acessibilidade (o que verificar)
1. **Contraste (gate nomeado):** `ring #CC5B00` ≥ 3:1 contra todos os fundos onde aparece;
   tokens semânticos como texto ≥ 4,5:1; contra UI/não-textual ≥ 3:1.
2. **Foco visível** em todo controle (1.4.11/2.4.7) — classe `focus-visible:ring-*`.
3. **Nome acessível** para controles só-ícone (4.1.2).
4. **Ordem de teclado** lógica (2.4.3) — ordem de DOM, sem `tabindex` positivo.

### Riscos de reinvenção (reutilizar, não recriar)
- **Tokens:** `app/globals.css` (`--destructive/--success/--warning/--info/--ring`). Nunca hex cru
  nem paleta Tailwind padrão (o `text-red-700` do Login é o antipadrão a evitar).
- **`cn`:** `lib/utils.ts`. **`Botao`:** `components/ui/button.tsx` (ação de recuperação do
  `EstadoErro`). **`lucide-react`** + padrão de ícone `aria-hidden`/`size-5` de `Navegacao.tsx`.
- **`EstadoOrg`/motivos:** `lib/auth.ts`, `lib/contexto.ts` — modelo de estado já existe.
- **`role="alert"`:** já usado em `app/login/page.tsx:29`. **Padrões de teste:**
  `test/casca.test.tsx`, `test/button.test.tsx` (mock `next/navigation`/`next/link`,
  `afterEach(cleanup)`, `@vitest-environment jsdom`).

### References
- [Source: epics.md#Story-1.8] — escopo, dependências (1.7), BDD, gate de contraste.
- [Source: DESIGN.md] — paleta de estado congelada, regra do laranja, foco.
- [Source: EXPERIENCE.md §89, §91-99, §130-146, §176] — "nunca só cor", catálogo de estados,
  piso de a11y, zero×falha.
- [Source: apps/web/lib/auth.ts; lib/contexto.ts; app/painel/page.tsx] — modelo de estado honesto
  e consumidor concreto.
- [Source: apps/web/app/globals.css; components/ui/button.tsx; app/painel/_componentes/Navegacao.tsx]
  — tokens, padrão de foco/ícone a reutilizar.

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code)

### Debug Log References

- Contraste provado por **cálculo puro** (ambiente `node`), não por axe — jsdom não pinta pixels. Os
  valores calculados foram confirmados por execução: `destructive` sobre branco ≈ 4,83:1 (passa 4,5),
  `ring` vs `accent` ≈ 3,8:1 (passa 3:1 não-textual, mas fica < 4,5 → `ring` é outline, nunca texto).
- Componentes de estado são compatíveis com Server Component (sem hooks). `Carregando` distingue-se de
  `EstadoVazio` (ambos `role="status"`) por `aria-busy` — provado em teste.
- `render(await DashboardPage())`: o Server Component async é testado renderizando o JSX devolvido, com
  `@/lib/contexto` e `next/link` mockados.

### Completion Notes List

- `lib/contraste.ts`: razão WCAG pura (`razaoContraste`/`atendeContraste`), pisos `PISO_TEXTO` (4,5) e
  `PISO_NAO_TEXTUAL` (3). Gate nomeado da Story satisfeito com fase vermelha.
- `components/ui/estado.tsx`: base `Estado` + `Carregando`/`EstadoVazio`/`EstadoErro`/`SemPermissao` —
  cada estado combina cor semântica (token) + texto + ícone (`aria-hidden`); nunca só cor.
  `SemPermissao` genérico e não-revelador (sem nome de recurso, sem `href`). Sem `Pendente`/`Aguardando`
  isolados (sem consumidor — Constitution II).
- `app/painel/page.tsx`: consumo dos estados; "sem Organização" (vazio/`status`) distinto de
  "indisponível" (falha/`alert`) com recuperação real (link `/painel`).
- A11y transversal: foco visível, nomes acessíveis nas duas orientações da nav, sem `tabindex` positivo.
- Sem dependência nova; sem toque no backend; sem migration. Gates de segurança/observabilidade e de
  qualidade verdes; code review **APROVADO** sem findings acionáveis.

### File List

**Web — novos:** `lib/contraste.ts`, `components/ui/estado.tsx`, `test/contraste.test.ts`,
`test/estado.test.tsx`, `test/dashboard.test.tsx`, `test/acessibilidade.test.tsx`.
**Web — modificados:** `app/painel/page.tsx` (consumo dos estados honestos).
**Processo:** `specs/1-8-.../{spec,plan,tasks}.md`; `gates/1-8/*`; `sprint-status.yaml`.

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (create-story) a partir de `epics.md` (Story 1.8), `DESIGN.md`/`EXPERIENCE.md` (estados, a11y), do relatório de preparação read-only (agente Plan) e do estado atual do `apps/web` (casca da 1.7 `done`). Classificada **CORE (Lote 1)**, risco **NORMAL** (frontend/UX/a11y; sem migration; sem toque no backend; sem nova fronteira de segurança). Sem bloqueio de contrato: o estado "sem permissão" é não-revelador e não depende da matriz de permissões (OQ-1..4). Dependência **1.7** `done`. Status → ready-for-dev. |
| 2026-07-13 | Implementação (T001–T005): `lib/contraste.ts` (razão WCAG pura + fase vermelha), `components/ui/estado.tsx` (`Estado` + 4 variantes honestas), consumo no Dashboard (vazio × falha distinguíveis), gate de a11y transversal. Gates **APROVADOS** (pre-implementation, context7, security, observability). Qualidade verde: format/lint/typecheck/**Web 68/68** (+22)/build. Code review **APROVADO** sem findings acionáveis. Status → review. |
| 2026-07-13 | Merge do PR #11 (`--no-ff`, commit `870745c`) com CI 100% verde nos 4 jobs. Encerramento administrativo: Status → **done**. Encerra o Lote 1 do Épico 1 (1.5→1.6→1.7→1.8). |
