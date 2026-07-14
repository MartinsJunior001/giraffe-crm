# Tasks — Story 2.2: Papéis e acesso por Pipe

> Fonte: `spec.md` + `plan.md`. Risco CRÍTICO — revisão reforçada, revisão adversarial **independente**
> (não subagente do implementador — lição do PR #17).
>
> **Ordem:** empilha sobre a 2.1 (PR #17). Não abrir PR contra `main` antes do merge da 2.1; correções da
> 2.1 têm prioridade.
>
> **Progresso — incremento 1 (2026-07-13):** feita a camada de **gestão de concessões** (aditiva, sem tocar
> o comportamento de acesso a Pipe da 2.1). **Adiado para o incremento 2 (pós-merge da 2.1):** a **abertura
> de acesso** a MEMBER/GUEST (T004 + ajuste de `pipes.service`/`pipes.controller` em T006), que reescreve
> arquivos/testes da 2.1 sob revisão no PR #17. Ver a Story (`Completion Notes`) e `analyze.md` RV-3.

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

- [ ] **T004** `ability.factory.ts`: para MEMBER/GUEST, construir abilities de Pipe **a partir da concessão
  ACTIVE carregada** (VIEWER → `ler`; MEMBER → `ler`+`editar`; ADMIN do Pipe → `administrar` config, **sem**
  ciclo de vida). Admin da Org mantém acesso total (AC3). A checagem fina roda no **serviço** com o Pipe +
  concessão carregados — **não** como condition do guard (DBT-AUTHZ-01). `authz.guard.ts` **não muda**.
  [C3, AC1, AC2, AC3]

## Phase 3: Módulo de concessão + ajuste de acesso

- [x] **T005** `PipeGrantsService` (via `withTenantContext`): conceder (recusa 2ª ativa ao mesmo par),
  listar concessões do Pipe, alterar papel, revogar (soft-delete `state=REVOKED`). [AC2, SC-223, SC-225]
- [ ] **T006** `PipeGrantsController` com `@Requer` + DTOs. Ajustar `PipesService.listar/obter`:
  não-Admin vê **só os Pipes concedidos** (junção com `PipeGrant` ACTIVE); não-enumeração (404 para não
  concedido). `AppModule`/`PipesModule` registram. [AC1, AC3, SC-221, SC-227]

## Phase 4: Testes (PostgreSQL real)

- [x] **T007** RLS/isolamento de `PipeGrant`: outra Org não vê a concessão; INSERT/SELECT sem contexto
  NEGADO (fase vermelha); dono ≠ runtime; sem DELETE. [SC-226]
- [ ] **T008** Autorização por recurso: sem concessão → 404 (não-enumeração); com `VIEWER` lê e não edita;
  `MEMBER` edita; `ADMIN do Pipe` administra config e não controla ciclo de vida. Prova que o **serviço**
  nega mesmo quando o guard concede o tipo. [SC-221, SC-222]
- [x] **T009** Unicidade: 2ª concessão ativa ao mesmo (pipe, pessoa) é recusada pelo **banco** (índice
  parcial); revogar + re-conceder funciona (nova linha). [SC-223]
- [ ] **T010** Revogação corta acesso: após `REVOKED`, MEMBER volta a 404 no Pipe. [SC-225]
- [ ] **T011** Isolamento entre Pipes: MEMBER com papel no Pipe X **não** vê o Pipe Y (lista e id). [SC-227]
- [ ] **T012** Regressão da 2.1: Admin da Org acessa qualquer Pipe sem concessão; suíte da 2.1 verde. [SC-224]
- [x] **T013** Migration deploy (banco limpo) + rollback (sem tocar Pipe/Membership) + reaplicação
  (descartável). [SC-228]

## Phase 5: Documentação e gates finais

- [ ] **T014** Atualizar `CLAUDE.md` (bloco de estado) e docs técnicas. `safe-implementation`,
  `code-review` + **revisão adversarial independente** (não subagente do implementador), `security-check`
  final, `commit-check`. Após merge da 2.1: rebasear sobre `main`, revalidar diff/migration/CASL/RLS/testes,
  então abrir PR.
