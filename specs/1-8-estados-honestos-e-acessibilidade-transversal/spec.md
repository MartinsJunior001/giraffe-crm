# Spec — Story 1.8: Estados honestos e acessibilidade transversal

> Compacto (risco NORMAL — frontend/UX/a11y, sem migration, sem backend).
> Fonte: `_bmad-output/implementation-artifacts/1-8-estados-honestos-e-acessibilidade-transversal.md`.

## Contexto
A casca da 1.7 (`done`) já tem tokens, `Botao`, `Navegacao`, `Topbar` e um Dashboard com estado
honesto de contexto (`EstadoOrg`: `sem-sessao | sem-organizacao | indisponivel`). A 1.8 dá **forma
visual e acessível** a esses estados de sistema e estabelece o **piso WCAG 2.2 AA** transversal.
Somente `apps/web`; nenhum toque no backend; nenhuma regra de domínio no frontend.

## Requisitos funcionais
- **FR-801** — Utilitário puro de **razão de contraste WCAG** (`lib/contraste.ts`), sem dependência
  externa, para provar o gate de contraste da Story.
- **FR-802** — Componentes de **estado honesto** (`components/ui/estado.tsx`): base `Estado` (ícone +
  título + descrição + ação opcional) e variantes com consumidor concreto — `EstadoVazio`,
  `EstadoErro`, `SemPermissao`, `Carregando`. Cada estado combina **cor semântica + texto + ícone**
  (nunca só cor) e usa **tokens** (nunca hex cru).
- **FR-803** — Semântica de `role`: `role="status"` para carregando/vazio; `role="alert"` para erro.
  Estado "aguardando/vazio" **não** aparenta sucesso (sem token `success`).
- **FR-804** — `SemPermissao` usa mensagem **genérica**, **sem** nome/rota do recurso e **sem** `href`
  para ele (não revela recurso — INV-REPORT-01).
- **FR-805** — O Dashboard (`app/painel/page.tsx`) consome `Estado*` nos três ramos honestos; "sem
  organização" (zero legítimo) é **distinguível** de "indisponível" (falha).
- **FR-806** — Piso de a11y na casca: **foco visível** (`focus-visible:ring-*`) em todo controle;
  **nome acessível** em controles só-ícone; **ordem de foco** = ordem de DOM (sem `tabindex` positivo);
  navegação utilizável nos breakpoints (ambas as orientações da `Navegacao`).

## Critérios de sucesso (verificáveis)
- **SC-801** — `contraste.ts`: `ring #CC5B00` ≥ **3:1** contra `#FFFFFF`, `#FFF3E8`, `#F5F5F5`;
  `destructive/warning/success/info` como texto ≥ **4,5:1** sobre `#FFFFFF`. **Fase vermelha:** um par
  forçado abaixo do piso falha o teste. (FR-801)
- **SC-802** — Cada variante de `Estado*` renderiza ícone `aria-hidden` + texto + classe de token
  semântico; teste afirma que remover a cor ainda deixa texto+ícone (não só cor). (FR-802)
- **SC-803** — `Carregando`/`EstadoVazio` têm `role="status"`; `EstadoErro` tem `role="alert"` e token
  `destructive`; `EstadoVazio` **não** usa `role="alert"` nem token destructive. (FR-803)
- **SC-804** — `SemPermissao`: o texto não contém identificador de recurso; não há `a[href]` para o
  recurso; teste confirma. (FR-804)
- **SC-805** — No Dashboard, "sem-organizacao" e "indisponivel" produzem `role`/texto **distintos**
  (zero legítimo ≠ falha). (FR-805)
- **SC-806** — Todo controle interativo da casca tem `focus-visible:ring-*`; a `Navegacao` em ambas as
  orientações expõe nome acessível; controles só-ícone têm nome; nenhum `tabindex` positivo. (FR-806)

## Fora de escopo
Estados de domínio (Épicos 2+); `Pendente`/`Aguardando` sem consumidor; `jest-axe`/axe-core;
contraste renderizado e tab nativo (verificação manual/e2e); correção do Login (1.5).

## Notas de segurança / observabilidade
Sem backend, sem migration, sem PII. "Sem permissão" é não-revelador; autorização real é do servidor
(1.6/1.3). Nenhum log novo. Nenhuma regra de domínio no frontend.
