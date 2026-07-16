---
description: "Task list — Story 2.18 (Integração FR-32 — Pipes relacionados no Perfil)"
---

# Tasks: Integração FR-32 — Pipes relacionados no Perfil (Story 2.18)

**Tests**: REQUERIDOS (PostgreSQL real). **US1** = única user story. **Sem migration, sem GRANT novo**.

## Phase 1: Setup
- [ ] T001 Gate `pre-implementation-check` (read-side; reusa PipesService/PipeGrant).

## Phase 2: US1 — Pipes relacionados (P1)
- [ ] T002 [US1] `PipesService.listarRelacionados()` + `PipeRelacionadoVisao` + `poderDoRole` (Admin→todos/gerenciar; não-Admin→PipeGrant ACTIVE com papel efetivo; vazio quando nenhum).
- [ ] T003 [US1] `GET /pipes/related` em `PipesController` (antes de `:id`), `@Requer('ler','Pipe')`.

## Phase 3: Testes (PostgreSQL real; Org A/C + fixtures)
- [ ] T004 [US1] `pipes-related-http.test.ts`: Admin vê todos (gerenciar); VIEWER-concedido vê só o seu (ler); sem grant → []; Pipe sem acesso não aparece e segue 404 em obter (CA3); orgId não vaza.

## Phase 4: Polish
- [ ] T005 `typecheck` + `lint` + `format` verdes.
- [ ] T006 `test:ci` (serial) — CI runner limpo é o gate autoritativo.
- [ ] T007 Gates de conclusão: `security-check`, `observability-check`.
- [ ] T008 `commit-check` → commits → push → PR → CI → merge → closure (BMAD).

## Dependencies
Setup → US1 (T002-T003) → Testes (T004) → Polish. T002 bloqueia T003/T004.
