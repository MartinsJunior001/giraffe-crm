# Tasks — Story 2.9

> Escopo comprometido = leitura (epics.md). **Bloqueado até Q1 decidida** (ver checklist). Se Q1 = leitura, seguir
> abaixo. Se Q1 = movimentação, o `epics.md` precisa ser reescopado pelo workflow oficial e as tasks passam a
> incluir o Apêndice A da spec (GRANT UPDATE + teste de escopo + evento `MOVED` + tx atômica).

0. **Gate de decisão:** resolver Q1–Q7 (spec.md §Questões). Rodar `pre-implementation-check` → APROVADO.
1. **Schema/migration:** **nenhum** (fatia read-only). Confirmar que `Card`/`Phase` já têm os índices e o `SELECT`
   necessários; confirmar que o runtime **não** ganha `GRANT UPDATE`.
2. **`KanbanReadService`** (`pipes/cards/kanban-read.service.ts`): `verKanban(pipeId)` e `verCard(pipeId, cardId)`;
   `resolverPoderNoPipe` (404) → leitura org-scoped de Fases ativas + Cards → agrupamento por Fase → projeção
   enxuta. Sem transação (leitura simples). `orgId` fora da fronteira.
3. **Contrato de capacidades:** derivar do `poder` (Q5); não revelar administrativas; Viewer só leitura.
4. **DTO/rota** (`KanbanController` ou estender `CardsController`): `GET pipes/:pipeId/cards` e
   `GET pipes/:pipeId/cards/:cardId`, `@Requer('ler','Pipe')`; `validarIdRota` para `:pipeId`/`:cardId`. Registrar
   no `pipes.module.ts`.
5. **Testes:**
   - `kanban-http`: agrupamento por Fase (ordem de `position`); Fase sem Card → coluna vazia; detalhe com
     `valores`+Fase+capacidades; Card fora do Pipe → 404; nenhuma movimentação executada.
   - `kanban-rls`: leitura cross-tenant não retorna; sem contexto → negado; **UPDATE em `Card` ainda `permission
     denied`** (regressão do invariante read-only da 2.7).
   - `kanban-authz`: Admin/Membro/Viewer leem; sem concessão → 404; capacidades por `poder` (Viewer sem flags
     operacionais).
6. **Observabilidade/segurança:** `valores` nunca em log; respostas sanitizadas (sem `orgId`/URL interna/stack).
7. **Gates:** typecheck/format/lint/build/testes verdes; suíte 2.1–2.7 intocada; `security-check` +
   `observability-check`. **Sem migration → `migration-check` não se aplica** (registrar).
8. **(Opcional, se Q3 = sim) Frontend** (`apps/web`): três painéis Contexto|Execução|Ações (UX-DR10); consome a API;
   ocultar/desabilitar por capacidades; estados honestos (loading/vazio/erro/acesso negado); responsividade
   (não comprimir os três painéis — UX-DR18). **Nenhuma regra de domínio no frontend.**
9. `commit-check` → `commit` → PR → CI verde → (merge sob autorização) → closure.

## Fora destas tasks (Stories próprias)
Movimentação/GRANT UPDATE/evento `MOVED`/posição (2.14 — Apêndice A); ciclo de vida (2.11); Formulário de Fase
(2.15); Histórico read-side (2.17); acesso/Responsável (2.10); saúde/marcos (2.12/2.13).
