# Tasks — Story 2.3: Gerenciamento de Fases

> Fonte: `spec.md` + `plan.md`. Risco **CRÍTICO** — nova entidade org-scoped + RLS + migration **e**
> ativação do poder diferencial por papel de Pipe (fecha DBT-2.2-ROLE-DORMENTE). Revisão adversarial
> **independente** (read-only, não subagente do implementador). Empilha sobre a 2.2 (na `main`).

## Phase 1: Schema, migration, RLS
- [x] **T001** `schema.prisma`: enum `PhaseState` (ACTIVE/ARCHIVED); model `Phase`
  (id/orgId/pipeId/name/state/`position` Decimal/timestamps/archivedAt); relações inversas em `Pipe` e
  `Organization`; índice `(orgId, pipeId, state, position)`. [D4]
- [x] **T002** Migration `<ts>_phases/migration.sql` (ts > `pipe_grants`): enum + tabela + índice + FKs
  (Pipe/Org, cascade) + **RLS ENABLE+FORCE** + 4 policies por `current_org_id()` (**WITH CHECK** no INSERT e
  UPDATE) + **GRANT SELECT/INSERT/UPDATE (sem DELETE)**. [SC-238]
- [x] **T003** Rollback `<ts>_phases.down.sql` (DROP policies/tabela/enum), **sem tocar**
  `Pipe`/`PipeGrant`/`Membership`. `prisma generate`. [SC-239]
- [x] **T004** `Phase` em `MODELOS_AUDITADOS` (`tenant-context.ts`).

## Phase 2: Autorização por recurso (serviço) — ATIVA o papel de Pipe
- [x] **T005** `PhasesService.resolverPoderNoPipe(pipeId) → 'gerenciar' | 'ler'` (ou 404): Admin da Org →
  gerenciar; senão carrega `PipeGrant` ACTIVE da Membership do principal **e** reconfere `Membership.state
  = ACTIVE`; `role = ADMIN` → gerenciar; grant não-ADMIN → ler; sem grant → 404. **Lê `role` + reconfere
  Membership.state** (fecha DBT-2.2-ROLE-DORMENTE + DBT-2.2-MEMBERSHIP-ADVISORY para esta superfície). Guard
  grosso = `@Requer('ler','Pipe')`; **não** `administrar`. [D5, SC-236, SC-237]

## Phase 3: Serviço de Fases + rotas
- [x] **T006** `PhasesService` (via `withTenantContext`): `listar` (ordem `position, id`; default ACTIVE),
  `criar` (append: `position = max ACTIVE + 1`), `renomear`, `mover` (1 UPDATE, `position` = ponto médio dos
  vizinhos), `arquivar` (bloqueia 409 se for a última ACTIVE; idempotente sem falso `denied`), `restaurar`
  (append ao final; idempotente). Cada gestão exige `resolverPoderNoPipe == 'gerenciar'` (senão 403); leitura
  exige ≥ `'ler'` (senão 404). [D1, D2, SC-231/232/233/234]
- [x] **T007** `PhasesController` sob `/pipes/:pipeId/phases` (+ DTOs): GET, POST, PATCH,
  POST `/reorder` (mover-um), POST `/:id/archive`, POST `/:id/restore`. Todas `@Requer('ler','Pipe')`; nenhuma
  aceita `orgId`; nenhuma troca `pipeId` (RN-030). Registrar no `PipesModule`. [D5, SC-235]

## Phase 4: Testes (PostgreSQL real)
- [x] **T008** `phases-rls.test.ts`: outra Org não vê; INSERT/SELECT/UPDATE sem contexto NEGADO (**fase
  vermelha**); dono ≠ runtime; **sem DELETE** (`permission denied`). [SC-238]
- [x] **T009** `phases-http.test.ts`: criar/renomear na ordem; mover intra-Pipe não afeta outro Pipe;
  arquivar/restaurar reversível (restaura ao final, dado preservado); **arquivar a última ativa → 409**;
  não-enumeração 404; RN-030 (sem rota que troca `pipeId`). [SC-231/232/233/234/235/237]
- [x] **T010** `phases-authz.test.ts` (**fecha DBT-2.2-ROLE-DORMENTE**): Admin da Org gerencia qualquer Pipe;
  **Admin do Pipe** (grant ADMIN + Membership ACTIVE) gerencia o seu; **MEMBER/VIEWER** concedidos leem mas
  **403** ao gerenciar; **Membership SUSPENDED + grant ADMIN → negado**; sem grant → 404. Provar a **fase
  vermelha** do diferencial. [SC-236]
- [x] **T011** Migration deploy (banco limpo) + rollback (sem tocar Pipe/PipeGrant/Membership) + reaplicação
  (descartável). [SC-239, migration-check]

## Phase 5: Documentação e gates finais
- [~] **T012** Atualizar `CLAUDE.md` (bloco de estado do Épico 2: agora existe `Phase` + o papel de Pipe
  deixa de ser dormente para config). `context7-check`, `safe-implementation`, `security-check`,
  `observability-check`, `lgpd-check`, `migration-check` + **revisão independente** (read-only), `commit-check`.
  Registrar débitos DBT-2.3-POSITION-RENORM e DBT-2.3-ULTIMA-FASE-TOCTOU.
