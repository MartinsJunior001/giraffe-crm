# Tasks — Story 2.1: Ciclo de vida e catálogo de Pipes

> Fonte: `spec.md` + `plan.md`. Risco CRÍTICO — revisão reforçada.
>
> Cada item marcado aponta para **evidência real** (código, migration, teste executado ou gate).
> Execuções de 2026-07-13: API **253/253** · Web **68/68** · typecheck/lint/`format:check` limpos ·
> **SC-206** verde em banco descartável.

## Phase 1: Schema, migration, RLS

- [x] **T001** `schema.prisma`: enum `PipeState`, model `Pipe` (id/orgId/name/state/locked/starred/
  timestamps/archivedAt), índice `(orgId, state)`, `Organization.pipes`. [FR-7]
  → `apps/api/prisma/schema.prisma`
- [x] **T002** Migration versionada `20260713120000_pipes/migration.sql`: enum + tabela + índices + FK org
  + RLS (ENABLE+FORCE, policies select/insert/update/delete por `orgId = current_org_id()`) + GRANT
  SELECT/INSERT/UPDATE (sem DELETE). [C4, AC3, AC4]
  → verificado **no banco** pelo SC-206 (`gates/2-1/migration-check.md`)
- [x] **T003** Rollback `20260713120000_pipes.down.sql` (DROP policies/table/type). `prisma generate`.
  [migration-check] → rollback **exercitado** (não só escrito): SC-206, passos 9–11

## Phase 2: Autorização (CASL)

- [x] **T004** `ability.ts`: sujeito `Pipe` + forma `{ orgId }` no `AppAbility`. `ability.factory.ts`:
  ADMIN → `ler`/`administrar` Pipe no `orgId`; MEMBER/GUEST nada. [C3, AC3]
  → `test/pipes-authz.test.ts` (7 casos). ⚠️ `authz.guard.ts` também foi tocado — desvio **D-1** em
  `analyze.md`, exige revisão independente.

## Phase 3: Módulo Pipes (runtime)

- [x] **T005** `PipesService` (via `withTenantContext`): criar, listar (ativo/arquivado), obter,
  renomear/atributos, arquivar, restaurar. [AC1, AC2] → `src/pipes/pipes.service.ts`
- [x] **T006** `PipesController` com `@Requer` + DTOs (validação). `AppModule` importa `PipesModule`.
  [AC1, AC3] → `src/pipes/pipes.controller.ts`, `dto/pipes.dto.ts`, `src/app.module.ts`.
  **Defeito corrigido aqui:** `archive`/`restore` devolviam 201 (default do `@Post`) → **200**
  (`@HttpCode(HttpStatus.OK)`); `POST /pipes` segue 201.

## Phase 4: Testes (PostgreSQL real)

- [x] **T007** RLS/isolamento: ADMIN da Org C cria Pipe; outro tenant não vê; INSERT/SELECT sem
  contexto NEGADO (fase vermelha). [SC-201, SC-204] → `test/pipes-rls.test.ts`
- [x] **T008** Autorização negativa: MEMBER/GUEST recebem 403 ao criar/arquivar; ADMIN concede. [SC-203]
  → `test/pipes-authz.test.ts` + `test/pipes-http.test.ts` (403 sobre HTTP, e 401 sem principal)
- [x] **T009** CRUD + archive/restore com dados preservados; catálogo ativo × arquivado. [SC-202]
  → `test/pipes-http.test.ts` (o nome renomeado sobrevive ao ciclo `ACTIVE → ARCHIVED → ACTIVE`)
- [x] **T010** GRANT: runtime não tem DELETE em Pipe. [SC-205] → `test/pipes-rls.test.ts` + SC-206
  (`permission denied for table "Pipe"` no banco descartável)
- [x] **T011** Migration deploy (banco limpo) + rollback (descartável). [SC-206]
  → **executado**: `gates/2-1/migration-check.md`, 13/13 passos (deploy → verificação de
  RLS/policies/GRANT → smoke de isolamento → rollback → remoção **cirúrgica** (L1 intacto) →
  reaplicação → smoke → destruição do ambiente).
  **Ressalva (R-3):** é procedimento reproduzível **executado**, não um teste do `pnpm test` — o CI
  exercita o `deploy`, mas **não** o rollback. Escalado como tarefa técnica própria.

## Phase 5: Documentação e gates finais

- [x] **T012** Atualizar `CLAUDE.md` (bloco de estado) e docs técnicas. `safe-implementation`,
  `security-check` final. → `CLAUDE.md` atualizado (deixou de afirmar que Pipes não existem);
  Spec Kit completado (`checklist.md`, `analyze.md`); 8 gates novos + `context7-check` e
  `pre-implementation-check` **revalidados** em `gates/2-1/`.
  - [x] `code-review` — **auto-revisão**, declarada como tal em `gates/2-1/code-review.md`
  - [ ] **Revisão adversarial independente** — pendência **P-1**: não é auto-atestável por quem
    implementou; é o propósito da entrega ao revisor
  - [ ] **`commit-check`** — pendência **P-2**: último gate, no momento do commit
