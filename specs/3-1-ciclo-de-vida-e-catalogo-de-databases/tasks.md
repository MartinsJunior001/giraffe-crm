---
description: "Task list — Story 3.1 (Ciclo de vida e catálogo de Databases)"
---

# Tasks: Ciclo de vida e catálogo de Databases (Story 3.1)

**Input**: Design documents from `specs/3-1-ciclo-de-vida-e-catalogo-de-databases/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅ (1 contrato), quickstart.md ✅

**Tests**: REQUERIDOS — a story md (T6) e o quickstart exigem teste de integração contra **PostgreSQL real**, com
prova da **fase vermelha** do GRANT e do isolamento (RLS). Testes fazem parte do escopo obrigatório desta Story.

**Organization**: uma única user story (US1 — "manter o catálogo de Databases"), cujos 5 critérios de aceite
(CA1–CA5, + CA6 de isolamento) são testáveis independentemente. Migration + schema + núcleo puro + CASL são
pré-requisitos bloqueantes (Foundational).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[US1]**: única user story desta Story
- Caminhos de arquivo são **relativos à raiz do repositório** (app em `apps/api/`)

## Path Conventions

Web service — Story inteiramente em `apps/api`. Novo módulo `apps/api/src/databases/` (espelha `src/pipes/`);
testes em `apps/api/test/`. `apps/web` **não** é tocado.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar o terreno; nenhuma dependência nova.

- [ ] T001 Executar o **gate pré-código** (`skills/pre-implementation-check.md`) e o **`context7-check`** para Prisma 6.19.3 (migration SQL crua: enum + tabela + RLS + GRANT; `create`/`update`/`findMany`/`updateMany`→`{count}`; `@db.Uuid`/`@db.Timestamptz`) e NestJS 11 (`@HttpCode(HttpStatus.OK)`, `ConflictException`/`ForbiddenException`/`NotFoundException`, DTO/class-validator). Registrar o relatório e a fonte em `gates/3-1/`. Só prosseguir se `APROVADO`/`APROVADO COM RESSALVAS`.
- [ ] T002 Criar o diretório do módulo `apps/api/src/databases/` (espelha `apps/api/src/pipes/`, sem reutilizar suas entidades — Pipe ≠ Database).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: banco, schema, auditoria, autorização e núcleo puro — bloqueiam TODAS as tasks de US1.

**⚠️ Concluir Phase 2 antes de iniciar a Phase 3.**

- [ ] T003 Atualizar `apps/api/prisma/schema.prisma`: enum `DatabaseState { ACTIVE ARCHIVED }`; model `Database` (`id @db.Uuid`, `orgId @db.Uuid`, `name`, `state @default(ACTIVE)`, `archivedAt @db.Timestamptz?`, `createdAt`, `updatedAt`, `@@index([orgId, state])`, `@@map("Database")`); relação `Organization.databases Database[]`. **Sem `locked`/`starred`; sem unicidade de nome** (research D4).
- [ ] T004 Criar a migration `apps/api/prisma/migrations/<timestamp>_databases/migration.sql`: `CREATE TYPE "DatabaseState"`; `CREATE TABLE "Database"` + índice `(orgId, state)` + FK → `Organization` (`ON DELETE CASCADE`); **`ALTER TABLE "Database" ENABLE ROW LEVEL SECURITY; ... FORCE ROW LEVEL SECURITY`**; **4 policies** (`database_select/insert/update/delete`) por `orgId = current_org_id()` com **`WITH CHECK`** no INSERT e no UPDATE; **`GRANT SELECT, INSERT, UPDATE ON "Database" TO giraffe_app`** (**sem DELETE**). Comentar o *porquê* de cada fronteira (WITH CHECK do UPDATE = não mover linha entre Orgs; sem DELETE = sem exclusão definitiva).
- [ ] T005 Criar o rollback `apps/api/prisma/rollback/<timestamp>_databases.down.sql` (drop simétrico: policies → tabela → tipo). Comentar o aviso: ⚠️ destrutivo — apaga Databases; exige backup verificado em produção.
- [ ] T006 Aplicar e verificar: `pnpm --filter @giraffe/api db:migrate` e `db:status`; conferir no banco (RLS habilitada+forçada, 4 policies, GRANT sem DELETE, índice). **SC-206** (deploy → verificação → rollback → reaplicação) em banco descartável → `gates/3-1/migration-check.md`. NÃO commitar ainda.
- [ ] T007 Adicionar `Database` a `MODELOS_AUDITADOS` em `apps/api/src/kernel/db/tenant-context.ts` (mutação org-scoped entra na trilha; caminho idempotente não emite `updateMany`).
- [ ] T008 [P] Autorização em `apps/api/src/kernel/authz/ability.ts` (novo subject `Database` na forma `{ id, orgId }`) e `ability.factory.ts` (**ADMIN da Org** → `ler`/`administrar` Database da própria Org; **MEMBER/GUEST → nada**). **NÃO** tocar `authz.guard.ts` (herda `{ id, orgId }` da 2.1 — research D6). Se precisar tocar, declarar desvio e escalar.
- [ ] T009 [P] Implementar o núcleo **puro** `apps/api/src/databases/database-lifecycle.ts`: `planejarArquivamento(state)` / `planejarRestauracao(state)` (idempotentes — `aplicar:false` quando já no estado-alvo) e `assertDatabaseEditavel(state)` / `podeEditarDatabase(state)` (gate de renomear; ponto de extensão para 3.4+). Sem I/O, sem Prisma/Nest. Espelha `card-lifecycle.transitions.ts`.

---

## Phase 3: User Story 1 — Manter o catálogo de Databases (Prioridade: P1)

**Goal**: Admin da Org cria/renomeia/arquiva/restaura Databases; catálogo real org-scoped, distinto de Pipe;
arquivar = somente-leitura integral; restaurar preserva identidade; sem exclusão.

**Independent Test**: rodar os Cenários 1–4 do `quickstart.md` (criar/catalogar; arquivar → renomear 409;
restaurar; MEMBER/GUEST 403).

### Implementação

- [ ] T010 [US1] Criar os DTOs `apps/api/src/databases/dto/databases.dto.ts`: `CriarDatabaseDto { name: string }` e `RenomearDatabaseDto { name: string }` (class-validator: não vazio, trim, tamanho máximo; **nenhum `orgId`**). Padrão de `pipes/dto`.
- [ ] T011 [US1] Implementar `apps/api/src/databases/databases.service.ts` — todas as queries por `withTenantContext(prisma, contexto, logger)` (sem `where orgId` manual): `criar(name)`, `listar(filtroState?)`, `obter(id)` (404 se inexistente/cross-tenant), `renomear(id, name)` (lê `state`; se `ARCHIVED` → **409** via `assertDatabaseEditavel`; senão UPDATE), `arquivar(id)` / `restaurar(id)` (via núcleo puro; idempotente — caminho no-op **não** emite `updateMany`). Sem `$transaction` (escrita única).
- [ ] T012 [US1] Criar o controller `apps/api/src/databases/databases.controller.ts` — 6 rotas conforme `contracts/databases.http.md`: `POST /databases` (201), `GET /databases` (200), `GET /databases/:id` (200/404), `PATCH /databases/:id` (200/409), `POST /databases/:id/archive` e `POST /databases/:id/restore` (**200 via `@HttpCode(HttpStatus.OK)`**). Cada rota com `@Requer(<ação>, 'Database')` (`administrar` para mutações, `ler` para consultas). **Sem rota de DELETE.** Nunca aceitar `orgId` do cliente.
- [ ] T013 [US1] Criar `apps/api/src/databases/databases.module.ts` e registrá-lo no `apps/api/src/app.module.ts`.

---

## Phase 4: Testes (PostgreSQL real — fase vermelha e isolamento provados)

**⚠️ Regra de ouro:** escrever na **Org C** com contas descartáveis (`randomUUID`). **Nunca** reusar
Ana/Bruno/Carla/Eva em `membership.create` persistente ([[test-iso-01-causa-raiz]]).

- [ ] T014 [P] [US1] `apps/api/test/databases-rls.test.ts` (segurança): isolamento (Org C invisível a A/B); **`WITH CHECK` sem RETURNING** via `createMany` (INSERT `orgId` alheio negado); UPDATE cross-tenant negado (WITH CHECK do UPDATE); contexto ausente negado (FORCE RLS); **fase vermelha** do GRANT (sem GRANT → `permission denied` em INSERT/UPDATE); **sem DELETE** (DELETE → `permission denied`). Provar a fase vermelha quebrando a policy/GRANT de propósito.
- [ ] T015 [P] [US1] `apps/api/test/databases-authz.test.ts`: ADMIN da Org cria/lê/muta; **MEMBER e GUEST negados** em todas as rotas (deny-by-default); recurso de outra Org → 404 não-enumerante.
- [ ] T016 [US1] `apps/api/test/databases-http.test.ts` (integração HTTP, AppModule em porta efêmera): CA1 (criar 201; catálogo distinto de Pipe; renomear ativo 200); CA2/CA3 (arquivar 200; **renomear em arquivado → 409**; consulta 200; arquivar idempotente 200); CA4 (restaurar 200, `id`/`name` preservados; restaurar idempotente 200); 404 cross-tenant; 400 nome inválido (sanitizado). PostgreSQL real, escrita na Org C.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T017 Atualizar `CLAUDE.md` (bloco de estado da implementação: `Database` existe; Épico 3 iniciado; a somente-leitura integral sobre dados dependentes é contrato futuro de 3.3/3.4/3.7/3.8/3.9).
- [ ] T018 Rodar `pnpm --filter @giraffe/api typecheck` (cobre `src` + `test`) e `pnpm lint` — verdes.
- [ ] T019 Rodar a suíte cheia como no CI: `pnpm --filter @giraffe/api test:ci` (serial) — verde.
- [ ] T020 Gates finais de conclusão de Story (skills): `security-check`, `observability-check`, `migration-check` (há migration nova), `backup-check` (rollback destrutivo), `lgpd-check` (nome de Database não é PII) e, se aplicável, `performance-check`. Registrar evidência de execução real em `gates/3-1/`.
- [ ] T021 `commit-check` → `commit` (mensagem em pt, atômica). **Não** commitar config local (`.vscode/`, `.mcp.json.example`, `.python-version`, tooling de agente). **Sem push/merge sem autorização explícita.**

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US1)** → **Phase 4 (Testes)** → **Phase 5 (Polish)**.
- **T001 (gate) bloqueia tudo** — nenhum código antes do gate aprovado.
- **T003–T006 (schema+migration+GRANT)** bloqueiam T011, T014, T016 (dependem da tabela e do GRANT).
- **T007 (auditoria)** e **T008 (CASL)** e **T009 (núcleo puro)** são independentes entre si (arquivos distintos)
  e podem rodar em paralelo após T003/T006.
- **T009 (núcleo puro)** bloqueia T011.
- **T008 (CASL)** bloqueia T012/T015.
- **T010 → T011 → T012 → T013** em sequência (mesmo módulo).
- **T014 e T015** independentes; **T016** depende de T010–T013 + T006.

## Parallel Opportunities

- **T008** (CASL) ‖ **T009** (núcleo puro) ‖ **T007** (auditoria) — arquivos disjuntos, após T003/T006.
- **T014** (RLS) ‖ **T015** (authz) — após suas dependências.

## Implementation Strategy (MVP)

- **MVP = US1 completa** (Phases 1–4): a entidade `Database` isolada por RLS, o ciclo de vida idempotente, a
  somente-leitura sob arquivamento (renomear 409) e os testes reais (fase vermelha + isolamento) são a entrega
  mínima íntegra — não há sub-fatia menor que preserve os invariantes (isolamento + sem exclusão).
- Entrega incremental interna: Foundational (schema/migration/GRANT/CASL/núcleo puro) → service/rotas → testes;
  cada camada verificável isoladamente (RLS e núcleo puro antes do HTTP).

## Format Validation

Todas as tasks seguem `- [ ] TID [P?] [US1?] descrição com caminho`. Setup/Foundational/Polish **sem** label de
story; tasks de US1 **com** `[US1]`. 21 tasks, IDs sequenciais T001–T021.
