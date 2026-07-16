---
description: "Task list — Story 3.2 (Papéis e acesso por Database)"
---

# Tasks: Papéis e acesso por Database (Story 3.2)

**Input**: Design documents from `specs/3-2-papeis-e-acesso-por-database/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅ (1 contrato), quickstart.md ✅

**Tests**: REQUERIDOS — a story md e o quickstart exigem teste de integração contra **PostgreSQL real**, com prova
da **fase vermelha** do GRANT, do isolamento (RLS), do índice único parcial e da **autoridade hierárquica** de
concessão. Testes fazem parte do escopo obrigatório desta Story.

**Organization**: uma única user story (US1 — "conceder e revogar papéis por Database, com a autoridade correta"),
cujos 6 critérios de aceite (CA1–CA6) são testáveis independentemente. Migration + schema + índice parcial +
resolução fina + abertura de CASL são pré-requisitos bloqueantes (Foundational).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[US1]**: única user story desta Story
- Caminhos de arquivo são **relativos à raiz do repositório** (app em `apps/api/`)

## Path Conventions

Web service — Story inteiramente em `apps/api`. Novo subdomínio `apps/api/src/databases/grants/` (espelha
`src/pipes/grants/`) + novo `apps/api/src/databases/database-authz.ts` (espelha `pipe-authz.ts`); modificação em
`databases.service.ts`/`ability.factory.ts`/`tenant-context.ts`; testes em `apps/api/test/`. `apps/web` **não** é tocado.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar o terreno; nenhuma dependência nova.

- [ ] T001 Executar o **gate pré-código** (`skills/pre-implementation-check.md`) e o **`context7-check`** para Prisma 6.19.3 (migration SQL crua: 2 enums + tabela + índice único parcial via raw SQL + RLS + GRANT; `create` com P2002 em índice parcial; `findUnique`/`updateMany`→`{count}`; `@db.Uuid`/`@db.Timestamptz`; FKs `onDelete: Cascade`) e NestJS 11 (`@HttpCode(HttpStatus.OK)` no DELETE, `ConflictException`/`ForbiddenException`/`NotFoundException`/`BadRequestException`, DTO/class-validator). Registrar o relatório e a fonte em `gates/3-2/`. Só prosseguir se `APROVADO`/`APROVADO COM RESSALVAS`.
- [ ] T002 Criar o diretório do subdomínio `apps/api/src/databases/grants/` (espelha `apps/api/src/pipes/grants/`, sem reutilizar suas entidades — Pipe ≠ Database).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: banco, schema, auditoria, resolução fina e abertura de CASL — bloqueiam TODAS as tasks de US1.

**⚠️ Concluir Phase 2 antes de iniciar a Phase 3.**

- [ ] T003 Atualizar `apps/api/prisma/schema.prisma`: enums `DatabaseRole { ADMIN MEMBER VIEWER }` e `DatabaseGrantState { ACTIVE REVOKED }`; model `DatabaseGrant` (`id @db.Uuid`, `orgId @db.Uuid`, `databaseId @db.Uuid`, `membershipId @db.Uuid`, `role`, `state @default(ACTIVE)`, `createdAt`, `updatedAt`, `revokedAt @db.Timestamptz?`, `@@index([orgId, databaseId])`, `@@index([orgId, membershipId])`, `@@map("DatabaseGrant")`); back-relations `Organization.databaseGrants`, `Database.grants`, `Membership.databaseGrants` (FKs `onDelete: Cascade`). **Sem `reviewPublicSubmissions`/`restritoAoProprio`** (capacidades de Pipe — data-model). O índice único parcial **não** vai no schema (raw SQL na migration).
- [ ] T004 Criar a migration `apps/api/prisma/migrations/<timestamp>_database_grants/migration.sql`: `CREATE TYPE "DatabaseRole"`/`"DatabaseGrantState"`; `CREATE TABLE "DatabaseGrant"` + índices `(orgId, databaseId)`/`(orgId, membershipId)` + FKs → `Organization`/`Database`/`Membership` (`ON DELETE CASCADE`); **`ENABLE`+`FORCE ROW LEVEL SECURITY`**; **4 policies** (`database_grant_select/insert/update/delete`) por `orgId = current_org_id()` com **`WITH CHECK`** no INSERT e no UPDATE; **índice único PARCIAL** `CREATE UNIQUE INDEX "DatabaseGrant_active_unique" ON "DatabaseGrant" ("databaseId", "membershipId") WHERE state = 'ACTIVE'`; **`GRANT SELECT, INSERT, UPDATE ON "DatabaseGrant" TO giraffe_app`** (**sem DELETE**). Comentar o *porquê* de cada fronteira (WITH CHECK do UPDATE = não mover concessão entre Orgs; índice parcial = 1 papel ativo por par; sem DELETE = revogar é `state`).
- [ ] T005 Criar o rollback `apps/api/prisma/rollback/<timestamp>_database_grants.down.sql` (drop simétrico: policies → índice parcial → tabela → 2 tipos). **Sem tocar** `Database`/`Membership`/`PipeGrant`. Comentar o aviso: ⚠️ destrutivo — apaga concessões; exige backup verificado em produção.
- [ ] T006 Aplicar e verificar: `pnpm --filter @giraffe/api db:migrate` e `db:status`; conferir no banco (RLS habilitada+forçada, 4 policies, índice único parcial, GRANT sem DELETE, índices). **SC-206** (deploy → verificação → rollback → reaplicação) em banco descartável → `gates/3-2/migration-check.md`. NÃO commitar ainda.
- [ ] T007 Adicionar `DatabaseGrant` a `MODELOS_AUDITADOS` em `apps/api/src/kernel/db/tenant-context.ts` (conceder/alterar/revogar entram na trilha — PRD §1073; leitura-antes-de-escrever e caminho idempotente não emitem `updateMany`).
- [ ] T008 [P] Abrir `ler Database` grosseiro em `apps/api/src/kernel/authz/ability.factory.ts`: mover `can('ler', 'Database', { orgId })` de dentro do ramo `if (papel === 'ADMIN')` para **qualquer Membership ativa** (como `ler Pipe`); **manter** `administrar Database` **só** para ADMIN da Org. **NÃO** tocar `authz.guard.ts` (C3 congelado — research D6). Se precisar tocar, declarar desvio e escalar. Provar a fase vermelha em `databases-authz.test.ts` (T015).
- [ ] T009 [P] Implementar `apps/api/src/databases/database-authz.ts` (twin de `pipe-authz.ts`): `resolverPoderNoDatabase(db, principal, databaseId): Poder` (Admin da Org → `gerenciar`; senão `DatabaseGrant` ACTIVE + `Membership.state = ACTIVE`: ADMIN→`gerenciar`, MEMBER→`operar`, VIEWER→`ler`; sem acesso → 404 não-enumerante); `exigirLerDatabase`/`exigirGerenciarDatabase`; `exigirConcederPapel(db, principal, databaseId, roleAlvo)` (Admin da Org → qualquer; Admin do Database → só MEMBER/VIEWER, ADMIN→403; demais→403; sem acesso→404). Recebe `db` já com contexto; **não** toca guard/`ability.ts`.

---

## Phase 3: User Story 1 — Conceder e revogar papéis por Database (Prioridade: P1)

**Goal**: Admin da Org / Admin do Database concedem papéis por Database com a autoridade correta; acesso por
concessão (não-enumerante); teto da Org; revogar corta o acesso na hora; no máximo um papel efetivo.

**Independent Test**: rodar os Cenários 1–6 do `quickstart.md` (conceder/acessar; autoridade hierárquica; teto da
Org; revogar corta; unicidade; deny-by-default/não-enumeração).

### Implementação

- [ ] T010 [US1] Criar os DTOs `apps/api/src/databases/grants/dto/database-grants.dto.ts`: `ConcederPapelDto { membershipId: uuid; role: DatabaseRole }` e `AlterarPapelDto { role: DatabaseRole }` (class-validator: uuid válido, enum fechado; **nenhum `orgId`**) + validador de id de rota. Padrão de `pipes/grants/dto`.
- [ ] T011 [US1] Implementar `apps/api/src/databases/grants/database-grants.service.ts` — todas as queries por `withTenantContext` (sem `where orgId` manual): `conceder(databaseId, membershipId, role)` (valida Database da Org → 404; alvo Membership ATIVA da Org → 400; **teto da Org**: carrega `Membership.role` do alvo, GUEST→só VIEWER senão 400; `exigirConcederPapel(...role)`; `create` → P2002 do índice parcial → **409**), `listar(databaseId)` (`exigirGerenciarDatabase`; concessões ACTIVE), `alterarPapel(databaseId, grantId, role)` (leitura-antes-de-escrever sem falso `denied`; se concessão atual é ADMIN exige Admin da Org; `exigirConcederPapel(...role)`; teto da Org; `updateMany where state='ACTIVE'` → 404 se `count 0`), `revogar(databaseId, grantId)` (`exigirConcederPapel` para o papel-alvo; `updateMany state='REVOKED', revokedAt=now`; soft-delete). Sem `$transaction`.
- [ ] T012 [US1] Criar o controller `apps/api/src/databases/grants/database-grants.controller.ts` — 4 rotas conforme `contracts/database-grants.http.md`, base `@Controller('databases/:databaseId/grants')`, todas `@Requer('ler', 'Database')` (grossa; a fina é do serviço): `POST` (201), `GET` (200), `PATCH /:grantId` (200), `DELETE /:grantId` (**200 via `@HttpCode(HttpStatus.OK)`** — soft-revoke, não 204). **Sem rota de exclusão física.** Nunca aceitar `orgId` do cliente.
- [ ] T013 [US1] Modificar `apps/api/src/databases/databases.service.ts` (3.1): `listar`/`obter` resolvem acesso fino para **não-Admin** (por `DatabaseGrant` ACTIVE via `resolverPoderNoDatabase`/lista de ids concedidos; `obter` sem concessão → **404 não-enumerante**); **Admin da Org inalterado** (todos). `criar`/`renomear`/`arquivar`/`restaurar` **inalterados** (Admin da Org; ciclo de vida 3.1 congelado). Criar `apps/api/src/databases/grants/database-grants.module.ts` e registrá-lo (importado pelo `DatabasesModule`/`AppModule`).

---

## Phase 4: Testes (PostgreSQL real — fase vermelha, isolamento e autoridade provados)

**⚠️ Regra de ouro:** escrever na **Org C** com contas descartáveis (`randomUUID`). **Nunca** reusar
Ana/Bruno/Carla/Eva em `membership.create` persistente ([[test-iso-01-causa-raiz]]).

- [ ] T014 [P] [US1] `apps/api/test/database-grants-rls.test.ts` (segurança): isolamento (Org C invisível a A/B); **`WITH CHECK` sem RETURNING** via `createMany` (INSERT `orgId` alheio negado); UPDATE cross-tenant negado (WITH CHECK do UPDATE); contexto ausente negado (FORCE RLS); **índice único parcial** (2º ACTIVE ao mesmo par negado; após revogar, novo ACTIVE aceito); **fase vermelha** do GRANT (sem GRANT → `permission denied` em INSERT/UPDATE); **sem DELETE** (DELETE → `permission denied`). Provar a fase vermelha quebrando a policy/GRANT/índice de propósito.
- [ ] T015 [P] [US1] Ampliar `apps/api/test/databases-authz.test.ts`: `ler Database` grosseiro concede o **TIPO** a MEMBER/GUEST (passa o guard); a negativa fina é do serviço (sem concessão → 404; Membro/Somente-leitura → 403 ao conceder); ADMIN da Org administra e concede qualquer papel. Provar a fase vermelha da abertura (regressão da 3.1: com `ler Database` só-ADMIN, MEMBER concedido seria barrado no guard).
- [ ] T016 [US1] `apps/api/test/database-grants-http.test.ts` (integração HTTP, AppModule em porta efêmera): CA1 (conceder 201; MEMBER concedido acessa só o concedido; sem-papel 404); CA2 (Admin do DB concede MEMBER/VIEWER 201; **conceder/alterar/revogar ADMIN → 403**); CA3 (**GUEST só VIEWER**; ADMIN/MEMBER a GUEST → 400); CA4 (revogar 200; MEMBER volta a 404; concessão preservada); CA5 (2ª concessão ativa → 409; PATCH altera; re-conceder após revogar → 201); cross-tenant 404; 400 alvo/role inválido (sanitizado). PostgreSQL real, escrita na Org C.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T017 Atualizar `CLAUDE.md` (bloco de estado da implementação: `DatabaseGrant` existe; acesso fino por Database; `ler Database` grosseiro aberto; autoridade hierárquica de concessão; poder diferencial MEMBER vs VIEWER = contrato futuro 3.3/3.4).
- [ ] T018 Rodar `pnpm --filter @giraffe/api typecheck` (cobre `src` + `test`) e `pnpm lint` — verdes.
- [ ] T019 Rodar a suíte cheia como no CI: `pnpm --filter @giraffe/api test:ci` (serial) — verde (incl. regressão da 3.1: Admin da Org acessa todos; 3.1 authz segue).
- [ ] T020 Gates finais de conclusão de Story (skills): `security-check`, `observability-check`, `migration-check` (há migration nova), `backup-check` (rollback destrutivo), `lgpd-check` (`membershipId` é id interno, não PII; papel não é sensível) e, se aplicável, `performance-check`. Registrar evidência de execução real em `gates/3-2/`.
- [ ] T021 `commit-check` → `commit` (mensagem em pt, atômica). **Não** commitar config local/tooling de agente. **Sem push/merge sem autorização explícita.**

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US1)** → **Phase 4 (Testes)** → **Phase 5 (Polish)**.
- **T001 (gate) bloqueia tudo** — nenhum código antes do gate aprovado.
- **T003–T006 (schema+migration+índice parcial+GRANT)** bloqueiam T011, T013, T014, T016.
- **T007 (auditoria)**, **T008 (CASL)** e **T009 (resolução fina)** são independentes entre si (arquivos distintos)
  e podem rodar em paralelo após T003/T006.
- **T009 (resolução fina)** bloqueia T011 e T013.
- **T008 (CASL)** bloqueia T012/T015 (o guard grosso precisa deixar MEMBER/GUEST passar).
- **T010 → T011 → T012 → T013** em sequência (mesmo subdomínio + modificação do service).
- **T014 e T015** independentes; **T016** depende de T010–T013 + T006.

## Parallel Opportunities

- **T007** (auditoria) ‖ **T008** (CASL) ‖ **T009** (resolução fina) — arquivos disjuntos, após T003/T006.
- **T014** (RLS) ‖ **T015** (authz) — após suas dependências.

## Implementation Strategy (MVP)

- **MVP = US1 completa** (Phases 1–4): a `DatabaseGrant` isolada por RLS, a autoridade hierárquica de concessão, o
  teto da Org, o corte imediato na revogação, a unicidade parcial e os testes reais (fase vermelha + isolamento +
  autoridade) são a entrega mínima íntegra — não há sub-fatia menor que preserve os invariantes (isolamento + sem
  exclusão + autoridade correta).
- Entrega incremental interna: Foundational (schema/migration/índice parcial/GRANT/CASL/resolução fina) →
  service/rotas + leitura fina do catálogo → testes; cada camada verificável isoladamente (RLS e resolução fina
  antes do HTTP).

## Format Validation

Todas as tasks seguem `- [ ] TID [P?] [US1?] descrição com caminho`. Setup/Foundational/Polish **sem** label de
story; tasks de US1 **com** `[US1]`. 21 tasks, IDs sequenciais T001–T021.
