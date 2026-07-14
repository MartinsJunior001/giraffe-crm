# Tasks — Story 2.2: Papéis e acesso por Pipe

> Fonte: `spec.md` + `plan.md`. Risco CRÍTICO — revisão reforçada, revisão adversarial **independente**
> (não subagente do implementador — lição do PR #17).
>
> **Ordem:** empilha sobre a 2.1 (PR #17). Não abrir PR contra `main` antes do merge da 2.1; correções da
> 2.1 têm prioridade.
>
> **Progresso — incremento 1 (2026-07-13):** feita a camada de **gestão de concessões** (aditiva, sem tocar
> o comportamento de acesso a Pipe da 2.1). Adiada para o incremento 2 a **abertura de acesso** a MEMBER/GUEST.
>
> **Progresso — incremento 2 (2026-07-13, PR #20):** entregue o **acesso por concessão** — toda Membership
> ativa passa a poder o TIPO `ler Pipe` (guarda grossa); o `PipesService` faz a guarda FINA (QUAL Pipe) pela
> concessão `PipeGrant` ACTIVE, com não-enumeração (404). Fecha **T006, T010, T011, T012** (SC-221/224/225/227).
> **Ainda deferido — T004 (metade diferencial) e T008:** o **poder diferencial por papel** do SC-222 (VIEWER
> lê / MEMBER edita / Admin do Pipe administra config) permanece fora — decisão **SC-222=(B)** do Acceptance
> Auditor, fundamentada em PRD §7/§15 + non-objetivos da 2.2 (as superfícies editáveis do Pipe — Fases 2.3,
> Cards 2.7+ — não existem nesta Story). Rastreado por **DBT-2.2-ROLE-DORMENTE** em `revisao-independente.md`,
> que vincula a ativação a 2.3/2.7 com critério e gate. Por ora `role` é armazenado mas **inerte** no caminho
> de acesso (toda concessão ACTIVE dá leitura; ciclo de vida/config só Admin da Org — deny-by-default).

## Phase 1: Schema, migration, RLS

- [x] **T001** `schema.prisma`: enums `PipeRole` (ADMIN/MEMBER/VIEWER) e `PipeGrantState` (ACTIVE/REVOKED);
  model `PipeGrant` (id/orgId/pipeId/membershipId/role/state/timestamps/revokedAt); relações inversas em
  `Pipe`, `Membership`, `Organization`. [D1.4]
- [x] **T002** Migration `<ts>_pipe_grants/migration.sql` (ts > o da 2.1): enums + tabela + índices
  `(orgId,pipeId)` e `(orgId,membershipId)` + **índice único parcial** `(pipeId,membershipId) WHERE state='ACTIVE'`
  + FKs (Pipe/Membership/Org, cascade) + RLS (ENABLE+FORCE, 4 policies por `current_org_id()`) + GRANT
  SELECT/INSERT/UPDATE (sem DELETE). [SC-223, SC-226, AC4]
- [x] **T003** Rollback `<ts>_pipe_grants.down.sql` (DROP policies/table/enums), **sem tocar** `Pipe`/
  `Membership`. `prisma generate`. [SC-228, migration-check]

## Phase 2: Autorização (CASL) — por recurso, no serviço

- [~] **T004** `ability.factory.ts`: **parte entregue** — MEMBER/GUEST passam a poder o TIPO `ler Pipe`
  (guarda grossa); a checagem fina (QUAL Pipe) roda no **serviço** pela concessão ACTIVE, não como condition
  do guard (DBT-AUTHZ-01); `authz.guard.ts` **não muda**; Admin da Org mantém acesso total (AC3). **Parte
  deferida** — o poder DIFERENCIAL por papel (VIEWER `ler` / MEMBER `ler`+`editar` / ADMIN do Pipe
  `administrar` config sem ciclo de vida) fica para 2.3/2.7 (SC-222=B; DBT-2.2-ROLE-DORMENTE). [C3, AC1, AC3]

## Phase 3: Módulo de concessão + ajuste de acesso

- [x] **T005** `PipeGrantsService` (via `withTenantContext`): conceder (recusa 2ª ativa ao mesmo par),
  listar concessões do Pipe, alterar papel, revogar (soft-delete `state=REVOKED`). [AC2, SC-223, SC-225]
- [x] **T006** `PipeGrantsController` com `@Requer` + DTOs. Ajustar `PipesService.listar/obter`:
  não-Admin vê **só os Pipes concedidos** (junção com `PipeGrant` ACTIVE); não-enumeração (404 para não
  concedido). `AppModule`/`PipesModule` registram. [AC1, AC3, SC-221, SC-227]

## Phase 4: Testes (PostgreSQL real)

- [x] **T007** RLS/isolamento de `PipeGrant`: outra Org não vê a concessão; INSERT/SELECT sem contexto
  NEGADO (fase vermelha); dono ≠ runtime; sem DELETE. [SC-226]
- [~] **T008** Autorização por recurso: **parte entregue** (`pipe-access-http.test.ts`) — sem concessão → 404
  (não-enumeração); com concessão o não-Admin lê só aquele Pipe; o **serviço** nega o ciclo de vida mesmo quando
  o guard concede o tipo `ler`. **Parte deferida** (SC-222=B): as asserções de poder diferencial (`VIEWER` lê e
  não edita vs `MEMBER` edita vs `ADMIN do Pipe` config) só existem quando houver recurso editável do Pipe
  (2.3/2.7); DBT-2.2-ROLE-DORMENTE. [SC-221, SC-227]
- [x] **T009** Unicidade: 2ª concessão ativa ao mesmo (pipe, pessoa) é recusada pelo **banco** (índice
  parcial); revogar + re-conceder funciona (nova linha). [SC-223]
- [x] **T010** Revogação corta acesso: após `REVOKED`, MEMBER volta a 404 no Pipe. [SC-225]
- [x] **T011** Isolamento entre Pipes: MEMBER com papel no Pipe X **não** vê o Pipe Y (lista e id). [SC-227]
- [x] **T012** Regressão da 2.1: Admin da Org acessa qualquer Pipe sem concessão; suíte da 2.1 verde. [SC-224]
- [x] **T013** Migration deploy (banco limpo) + rollback (sem tocar Pipe/Membership) + reaplicação
  (descartável). [SC-228]

## Phase 5: Documentação e gates finais

- [ ] **T014** Atualizar `CLAUDE.md` (bloco de estado) e docs técnicas. `safe-implementation`,
  `code-review` + **revisão adversarial independente** (não subagente do implementador), `security-check`
  final, `commit-check`. Após merge da 2.1: rebasear sobre `main`, revalidar diff/migration/CASL/RLS/testes,
  então abrir PR.
