---
story_key: 3-2-papeis-e-acesso-por-database
epic: 3
status: ready-for-dev
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: CRÍTICO
baseline_commit: 29cf323
gate_arquitetura: Nova entidade organizacional (DatabaseGrant) com nova tabela + 2 enums + RLS/FORCE + migration versionada + índice único PARCIAL (WHERE state='ACTIVE') + GRANT column-scoped (sem DELETE). Toca o invariante-mãe (isolamento por Organização) e ABRE o sujeito CASL `ler Database` de Admin-da-Org-only (3.1) para qualquer Membership ativa (grossa), com a guarda FINA no serviço (DBT-AUTHZ-01) — espelha exatamente a abertura de `ler Pipe` na 2.2, sem tocar `authz.guard.ts` (C3 congelado). Modifica o `DatabasesService` da 3.1 (listar/obter passam a resolver acesso fino por concessão para não-Admin). Introduz a AUTORIDADE HIERÁRQUICA de concessão (nova regra sem precedente na 2.2, que era Admin-da-Org-only): Admin do Database concede/revoga SOMENTE Membro/Somente-leitura; só o Admin da Org concede/remove Admin do Database. Escopo congelado: SOMENTE papéis e acesso por Database (Formulário de Database = 3.3; Registros = 3.4; permissões por Campo = FORA da Fase 1). O poder DIFERENCIAL de Membro vs Somente-leitura sobre Registros/schema NÃO é materializado aqui (não há Registro/schema em 3.2) — é contrato futuro consumido por 3.3/3.4 (AD-11), análogo ao "role dormente" da 2.2 (SC-222=B).
---

# Story 3.2 — Papéis e acesso por Database

**As a** Administrador (da Organização ou do Database),
**I want** conceder e revogar papéis por Database,
**So that** cada pessoa acesse apenas as bases autorizadas, com o poder correto (Database ≠ Pipe).

**Status: ready-for-dev.** Segunda Story do **Épico 3** (Databases, Registros, Vínculos e Arquivos),
risco **CRÍTICO** — introduz a autorização **fina por Database** sobre o substrato materializado pela 3.1,
com **nova entidade** (`DatabaseGrant`), **nova tabela + 2 enums + RLS/FORCE + migration versionada + índice
único parcial**, tocando o **invariante-mãe** (isolamento por Organização) e abrindo o sujeito CASL
`Database`. É o **twin estrutural da Story 2.2** (papéis e acesso por Pipe): mesma forma de
`Grant`/RLS/GRANT/índice-parcial/resolução-fina-no-serviço, aplicada ao domínio **distinto** de Pipe
(RN-061). Dependências **3.1** (entidade `Database`, `done`) e **1.6** (autorização, `done`) estão prontas;
o Épico 2 está `done` (18/18) e fornece o padrão consolidado a replicar — em especial `PipeGrant` (2.2) e
`pipe-authz.ts` (DBT-AUTHZ-01).

> **Escopo congelado:** **somente papéis e acesso por Database.** O Formulário de Database (schema do
> Registro) é da **3.3**; Registros e seu Histórico são da **3.4**; **permissões por Campo estão FORA da
> Fase 1** (declaração explícita da epics). O **poder diferencial** de Membro vs Somente-leitura sobre
> Registros/schema **não** é materializado aqui — não existe Registro nem schema em 3.2; é contrato futuro
> consumido por 3.3/3.4 (AD-11, sem antecipar — Constitution II). Ver Dev Notes → "Role dormente".

---

## Escopo (do épico, congelado)

Papéis **Admin do Database / Membro do Database / Somente leitura**, por **concessão explícita por Database**;
**Admin da Org acessa todos**; **ausência de papel = sem acesso** (sem revelar o recurso — 404
não-enumerante); **no máximo um papel efetivo por Database**; **papel de Database nunca supera o da
Organização** (AD-9); **Convidado só recebe Somente leitura** (Fase 1).

**Autoridade para conceder (ajuste 2 da epics — a regra distintiva desta Story):**
- **Admin da Org** concede/altera/revoga **qualquer** papel de Database (ADMIN/MEMBER/VIEWER).
- **Admin do Database** concede/revoga **apenas** `Membro do Database` e `Somente leitura`, **exclusivamente**
  para **Memberships ativas da mesma Organização**.
- **Somente o Admin da Org** concede/remove `Admin do Database`.
- **Admin do Database não** cria, convida, remove nem altera Memberships da Organização (isso é do E8).
- **Revogar o papel remove o acesso imediatamente**, preservando **autoria e Histórico anteriores**.

**Permissões por Campo estão FORA da Fase 1** (declaração explícita).

**Rastreabilidade:** FR-18; D3.4; NFR-4; AD-9. **Consome:** Membership (E8, já existente como substrato).
[Source: epics.md#Story-3.2; ARCHITECTURE-SPINE.md#AD-9]
**Dep.:** 3.1, 1.6. **Gates:** —

**Fora do escopo:**
- **Formulário de Database / schema do Registro** (3.3) — 3.2 **não** dá poder de configurar/publicar schema;
  concede/resolve papéis, mas o consumidor "Admin do Database / Membro configuram schema" é da 3.3.
- **Registros e seu Histórico** (3.4) — 3.2 **não** materializa Registro. Logo o **poder diferencial** de
  Membro (edita Registros) vs Somente-leitura (só consulta) **não** tem consumidor em 3.2 e **não** é
  implementado (role dormente — ver Dev Notes).
- **Permissões por Campo** (FORA da Fase 1) — declaração explícita da epics.
- **Ciclo de vida do Database** (criar/renomear/arquivar/restaurar) — é da **3.1** e permanece do **Admin da
  Org** (o Admin do Database administra CONFIG, não o ciclo de vida — espelha `PipeRole.ADMIN`, que
  "administra a config do Pipe, não o ciclo de vida"). Ver Clarificação **Q3**.
- **Exclusão de concessão** — revogar é `state = REVOKED` (soft), nunca DELETE (runtime sem GRANT de DELETE).

**Demonstração vertical:** o Admin da Org concede `Admin do Database` a alguém; esse Admin do Database
concede `Somente leitura` a um Membro da Org e é **bloqueado** ao tentar conceder `Admin do Database`; um
usuário sem papel **não** vê o Database (404 não-enumerante); revogar corta o acesso na hora; outra Org
**não** vê a concessão (RLS).

---

## Acceptance Criteria

1. **AC1 — sem papel = sem acesso, sem revelar o recurso.** *Given* um usuário (não-Admin da Org) **sem**
   concessão ativa num Database *When* tenta acessá-lo (listar não o inclui; obter/gerir) *Then* o acesso é
   **negado sem revelar o recurso** — **404 não-enumerante** (indistinguível de "não existe"), nunca 403 que
   confirmaria a existência. [Source: epics.md#Story-3.2 AC1]
2. **AC2 — Admin do Database concede só Membro/Somente-leitura, e só a Memberships ativas da mesma Org.**
   *Given* um Admin do Database *When* tenta conceder `Admin do Database` **ou** mexer em Memberships da Org
   *Then* é **bloqueado (403)**; ele só concede/revoga `Membro do Database`/`Somente leitura` a **Memberships
   ATIVAS da mesma Org** (alvo inválido/inativo/de outra Org → 400/404 conforme a fronteira). [Source:
   epics.md#Story-3.2 AC2]
3. **AC3 — Convidado só recebe Somente leitura (AD-9, papel da Org é o teto).** *Given* um Convidado (Membership
   `role = GUEST`) *When* recebe acesso a um Database *Then* só pode ser **Somente leitura** — conceder
   `Admin`/`Membro do Database` a um GUEST é recusado (o papel de Database **nunca supera** o papel da Org).
   [Source: epics.md#Story-3.2 AC3; AD-9]
4. **AC4 — revogar corta o acesso imediatamente; autoria/Histórico preservados.** *Given* um papel concedido
   *When* a revogação é aplicada *Then* o acesso **cessa imediatamente** (a resolução lê só concessões ACTIVE)
   e a **autoria/Histórico anteriores são preservados** (soft-delete: `state = REVOKED`; a linha e a trilha
   permanecem; o runtime **não** tem GRANT de DELETE). [Source: epics.md#Story-3.2 AC4]
5. **AC5 — no máximo um papel efetivo por Database; teto da Org; Campo fora da Fase 1.** *Given* concessões a
   um Database *When* resolvidas *Then* há **no máximo um papel efetivo por (Database, pessoa)** (índice único
   parcial `WHERE state='ACTIVE'` — segunda concessão ativa → 409); o **papel de Database não supera o da
   Organização**; **permissões por Campo ficam fora da Fase 1**. [Source: epics.md#Story-3.2 AC5]
6. **AC6 — isolamento (RLS) provado.** *Given* dois tenants *When* um lê/lista concessões de Database *Then* vê
   **apenas** as da própria Organização; um INSERT/SELECT/UPDATE fora do contexto (ou com `orgId` alheio) é
   **negado pelo banco** (FORCE RLS + `WITH CHECK`), não só pela aplicação. [Source: AD-6; twin de 2.2]

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** Executar e registrar em `_bmad-output/implementation-artifacts/gates/3-2/`:
  `context7-check` (Prisma 6.19.3 — migration/enum/índice parcial via raw SQL/`create`/`updateMany`/P2002;
  NestJS 11 — DTO/exceptions/`@HttpCode`/params de rota), `pre-implementation-check`, `security-check`,
  `lgpd-check` (confirmar: `membershipId` é id interno, **não** PII — não é e-mail/nome; papel não é dado
  sensível), `migration-check` (SC-206, banco descartável — apply/rollback/reapply removendo só
  `DatabaseGrant`+enums+policies), `backup-check`, `observability-check`, `performance-check`. Só prosseguir se
  `APROVADO`/`APROVADO COM RESSALVAS`.
- [ ] **T2 — Schema + migration + rollback.** `prisma/schema.prisma`: enums `DatabaseRole { ADMIN, MEMBER,
  VIEWER }` e `DatabaseGrantState { ACTIVE, REVOKED }`; model `DatabaseGrant` (`id`, `orgId`, `databaseId`,
  `membershipId`, `role`, `state`, `createdAt`, `updatedAt`, `revokedAt`; relations → `Organization`,
  `Database`, `Membership` com `onDelete: Cascade`; `@@index([orgId, databaseId])`, `@@index([orgId,
  membershipId])`); back-relations em `Database`/`Membership`/`Organization`.
  `prisma/migrations/<timestamp>_database_grants/migration.sql`: enums, tabela, índices, FKs, **RLS ENABLE +
  FORCE**, 4 policies por `current_org_id()` com `WITH CHECK` no INSERT **e** no UPDATE, **índice único PARCIAL**
  `CREATE UNIQUE INDEX ... ON "DatabaseGrant" ("databaseId", "membershipId") WHERE state = 'ACTIVE'` (raw SQL —
  o Prisma 6.19.3 não o expressa), GRANT `SELECT/INSERT/UPDATE` **sem DELETE**; rollback
  `prisma/rollback/<timestamp>_database_grants.down.sql`. Verificar pelo **SC-206** → `gates/3-2/migration-check.md`.
- [ ] **T3 — Auditoria.** Adicionar `DatabaseGrant` a `MODELOS_AUDITADOS` em `kernel/db/tenant-context.ts`
  (mutação de concessão entra na trilha; caminhos idempotentes/leituras-antes-de-escrever não emitem
  `updateMany`, para não registrar falso `denied` — mesma correção de 2.1/2.2).
- [ ] **T4 — Autorização (CASL) — abrir `ler Database` grossa.** `kernel/authz/ability.factory.ts`: mover
  `can('ler', 'Database', { orgId })` de dentro do ramo `if (papel === 'ADMIN')` para **qualquer Membership
  ativa** (grossa), espelhando `ler Pipe` (2.2). **Manter** `administrar Database` **só** para o ADMIN da Org
  (ciclo de vida da 3.1 + conceder `Admin do Database`). **NÃO** tocar `authz.guard.ts` (C3 congelado — o
  guard já escopa `{ id, orgId }` desde a 2.1). Provar a fase vermelha em `test/databases-authz.test.ts`.
- [ ] **T5 — Resolução fina `database-authz.ts`.** Novo `src/databases/database-authz.ts` — twin de
  `pipe-authz.ts`. `resolverPoderNoDatabase(db, principal, databaseId): Poder` (Admin da Org → `gerenciar`;
  senão `DatabaseGrant` ACTIVE + `Membership.state = ACTIVE`: ADMIN → `gerenciar`, MEMBER → `operar`, VIEWER →
  `ler`; sem acesso → **404 não-enumerante**). `exigirLerDatabase` / `exigirGerenciarDatabase`. E o núcleo da
  autoridade de concessão: `exigirConcederPapel(db, principal, databaseId, roleAlvo)` — Admin da Org → qualquer
  papel; Admin do Database (`gerenciar` via grant, **não** Admin da Org) → **só** MEMBER/VIEWER (ADMIN → 403);
  sem poder de gerenciar → 403; sem acesso ao Database → 404. **Não** toca o guard/`ability.ts`.
- [ ] **T6 — Subdomínio `databases/grants/` (runtime).** `database-grants.module`, `database-grants.service`,
  `database-grants.controller`, `dto/database-grants.dto` — twin de `pipes/grants/`. **4 rotas** sob
  `@Controller('databases/:databaseId/grants')`, coarse guard `@Requer('ler','Database')` (grossa; a autoridade
  real é fina, no serviço via T5): `POST` (conceder, 201), `GET` (listar ativas), `PATCH /:grantId`
  (alterar papel), `DELETE /:grantId` (revogar, **200**, soft-delete). Serviço: valida Database da Org
  (404 cross-tenant), Membership alvo ATIVA da Org (400), **teto da Org** (GUEST → só VIEWER, senão 409/400 —
  AC3), autoridade por `exigirConcederPapel` (AC2), unicidade por P2002 → 409 (AC5), revogar/alterar sem
  emitir falso `denied`. `orgId` nunca do cliente; `orgId` fora do payload.
- [ ] **T7 — Modificar `DatabasesService` (3.1) — acesso fino para não-Admin.** `listar`/`obter` passam a
  resolver acesso por `DatabaseGrant` para não-Admin (Admin da Org segue vendo TODOS): `listar` só inclui os
  Databases com concessão ACTIVE (ou todos, se Admin da Org); `obter` de um Database sem concessão → **404
  não-enumerante** (AC1). `criar`/`renomear`/`arquivar`/`restaurar` seguem **Admin da Org** (guard
  `administrar Database`; ciclo de vida é 3.1 congelado — Q3). Provar em `test/databases-http.test.ts` que o
  não-Admin com concessão vê só o concedido.
- [ ] **T8 — Testes (PostgreSQL real).** `test/database-grants-rls.test.ts` (isolamento; `WITH CHECK` sem
  RETURNING via `createMany`; contexto ausente negado; UPDATE cross-tenant negado; **sem DELETE**; índice único
  parcial; **fase vermelha**), `test/databases-authz.test.ts` (ampliar: `ler Database` grossa concede a
  MEMBER/GUEST o TIPO, negativa fina no serviço), `test/database-grants-http.test.ts` (conceder/listar/alterar/
  revogar; **Admin do Database concede MEMBER/VIEWER**; **Admin do Database → 403 ao conceder ADMIN**; **GUEST
  só VIEWER**; sem-papel → 404; revogar corta acesso; 409 de unicidade; cross-tenant → 404; 400 sanitizado).
  Escrever na **Org C** com contas descartáveis (`randomUUID`). **SC-206** em banco descartável.
- [ ] **T9 — Documentação + gates finais.** Atualizar `CLAUDE.md` (bloco de estado: `DatabaseGrant` existe;
  acesso fino por Database; `ler Database` grossa); Spec Kit completo (`spec.md`, `checklists/requirements.md`,
  `research.md`, `data-model.md`, `contracts/`, `plan.md`, `tasks.md`, `analyze`); `safe-implementation` e
  `code-review` em `gates/3-2/`.
  - [ ] **Revisão adversarial independente** — não auto-atestável por quem implementou.
  - [ ] **`commit-check`** — último gate, no momento do commit.

---

## Dev Notes

### Modelo de dados (AD-7/AD-10) — twin de `PipeGrant` (2.2)
- `DatabaseGrant` é **dado operacional da Organização** (AD-10). Liga-se a **`Membership`** (não a `Account`):
  o papel por Database vive DENTRO de uma Organização, e a Membership é o vínculo Account×Org que carrega
  `orgId` e estado (AD-7). Ligar à Account global reabriria a porta de uma concessão "sem Org". **Distinto de
  `PipeGrant`** (RN-061): tabela/enums/subject próprios; **nunca** reutilizar `PipeGrant`/`PipeRole`.
- Campos: `id` (uuid), `orgId`, `databaseId` (FK → `Database`, `onDelete: Cascade`), `membershipId` (FK →
  `Membership`, `onDelete: Cascade`), `role` (`DatabaseRole` = `ADMIN`/`MEMBER`/`VIEWER`), `state`
  (`DatabaseGrantState` = `ACTIVE`/`REVOKED`), `createdAt`, `updatedAt`, `revokedAt` (DateTime?, null quando
  ativa). **Sem `reviewPublicSubmissions`/`restritoAoProprio`** — são capacidades de Pipe (2.8/2.10), não da
  epics de Database; não inventar (Constitution II).
- **No máximo um papel efetivo por (Database, pessoa):** índice único **PARCIAL** `(databaseId, membershipId)
  WHERE state='ACTIVE'`, criado por raw SQL na migration (o Prisma 6.19.3 não expressa índice parcial — é
  v7.4+). Uma concessão revogada não colide com uma re-concessão. Segunda concessão ativa colide no INSERT →
  P2002 → 409, sem leitura-antes-de-escrever, sem corrida (idêntico a `PipeGrant`).
- **Revogar é `state = REVOKED`** (+ `revokedAt = now`), **não** DELETE. Preserva a trilha e a autoria; o
  runtime **não** tem GRANT de DELETE.

### Isolamento (AD-6, invariante-mãe) — replica `PipeGrant`/`Membership`
- `DatabaseGrant` recebe **ENABLE + FORCE ROW LEVEL SECURITY**; 4 policies (`select/insert/update/delete`) por
  `orgId = current_org_id()`, com **`WITH CHECK` no INSERT e no UPDATE** — sem o do UPDATE, um UPDATE poderia
  **mover** a concessão para outra Org; sem o do INSERT, um INSERT com `orgId` alheio seria aceito e ficaria
  invisível. Toda query por `withTenantContext` (contexto por transação); **nenhum `where orgId` manual**.
- **GRANT do runtime:** `SELECT, INSERT, UPDATE` — **sem DELETE** (o épico proíbe exclusão; revogar é `state`).
  A policy `delete` existe por simetria/defesa em profundidade, mas quem barra o runtime é o **GRANT**.

### Autorização — a AUTORIDADE HIERÁRQUICA de concessão é o coração da 3.2
Esta é a diferença real frente à 2.2 (que era **Admin-da-Org-only** em toda rota de grant). A 3.2 abre a
concessão ao **Admin do Database**, com **teto de papel**. Três camadas, coerentes com DBT-AUTHZ-01:

1. **Guarda GROSSA (guard/CASL):** rotas de grant declaram `@Requer('ler','Database')`. Para isso, a 3.2 **abre**
   `ler Database` de Admin-da-Org-only (3.1) para **qualquer Membership ativa** (grossa) — espelhando `ler Pipe`
   (2.2). A ability confirma só o TIPO ("pode ler *algum* Database nesta Org"); **qual** Database e **qual**
   autoridade é a guarda fina. `administrar Database` **continua** só do Admin da Org (não usar em grant, senão
   Admin do Database seria barrado no guard).
2. **Guarda FINA de acesso (`database-authz.ts`):** `resolverPoderNoDatabase` → `gerenciar` (Admin da Org ou
   Admin do Database) > `operar` (Membro) > `ler` (Somente leitura); sem acesso → **404 não-enumerante**
   (AC1). Reconfere `Membership.state = ACTIVE` (defesa em profundidade).
3. **Guarda FINA de autoridade de concessão (`exigirConcederPapel`):** encapsula o ajuste 2 —
   - **Admin da Org** (`principal.papel === 'ADMIN'`): concede/altera/revoga **qualquer** papel.
   - **Admin do Database** (poder `gerenciar` via `DatabaseGrant role=ADMIN`, **não** Admin da Org): concede/
     revoga **só** MEMBER/VIEWER; tentar ADMIN → **403** (AC2). Alterar uma concessão ADMIN existente ou revogar
     um ADMIN → **403** (só Admin da Org mexe em ADMIN do Database).
   - Demais (Membro/Somente-leitura/sem acesso): **403/404**.
- **Teto da Org (AD-9, AC3):** o serviço carrega o `Membership.role` do **alvo**; se `GUEST`, só `VIEWER` é
  aceito (ADMIN/MEMBER do Database → recusa). Espelha "papel da Org é o teto" da `ability.factory` (RN-150). A
  decisão de qual código (400 vs 409) segue a convenção da 2.2 (`exigirMembershipAtivaDaOrg` → 400 por alvo
  inválido); tratar "GUEST não pode ADMIN/MEMBER" como **400** (corpo inválido para o alvo) — ver Q2.
- **O `authz.guard.ts` NÃO é tocado** (C3 congelado). Se durante a implementação o guard **precisar** mudar,
  declarar desvio no `analyze.md` e escalar.

### Role dormente: o poder DIFERENCIAL de Membro vs Somente-leitura é contrato futuro (3.3/3.4)
- A epics distingue os três papéis, mas o **poder concreto** que separa `Membro do Database` (edita Registros)
  de `Somente leitura` (só consulta) **age sobre Registros e schema** — que **não existem em 3.2** (são 3.3/3.4).
  Por **AD-11** e **Constitution II**, a 3.2 **não** materializa esse diferencial nem inventa uma superfície para
  exercê-lo. É **exatamente** a situação da 2.2 (`SC-222=B`, "role dormente"): o papel é **armazenado e
  resolvido**, mas o poder diferencial fica **inerte** até o consumidor concreto (3.3 schema; 3.4 Registros).
  Ver [[sc-222-b-role-dormente]] como precedente.
- **O que 3.2 materializa (consumidores concretos, sem antecipar):**
  1. **Acesso de leitura ao catálogo** — a concessão abre `listar`/`obter` do Database ao não-Admin (T7); sem
     concessão → 404 não-enumerante (AC1). É o consumidor concreto de "ter papel = ter acesso".
  2. **Autoridade de concessão** — Admin do Database concede MEMBER/VIEWER (T5/T6). Consumidor concreto de
     "Admin do Database gere o roster do Database".
- **O que 3.2 documenta como contrato futuro:** todo poder de **escrita** do domínio Database (3.3 publicar/
  alterar schema — Admin/Membro; 3.4 criar/editar/arquivar Registro — Membro) **deve** resolver
  `resolverPoderNoDatabase` e exigir o poder adequado (`gerenciar` para schema; `operar` para editar Registro),
  respeitando o `Database.state = ACTIVE` da 3.1. `database-authz.ts` é o **ponto de extensão** (espelha
  `pipe-authz.ts`, cujo `exigirOperarPipe` nasceu latente na 2.2 e ativou na 2.7).

### Modificação do `DatabasesService` (3.1) — leitura fina para não-Admin
- **Ler o arquivo antes de mudar (feito):** hoje (3.1) `listar` devolve TODOS os Databases da Org e `obter`
  devolve qualquer um por `id`; a autorização é **grossa** (só Admin da Org passa o guard `administrar`/`ler`
  Database, pois ambos eram Admin-only). Em 3.2, com `ler Database` grosseiro aberto, **não-Admins entram** —
  então `listar`/`obter` **precisam** resolver acesso fino, senão vazariam o catálogo inteiro a qualquer Membro.
- **O que muda:** para **Admin da Org**, comportamento idêntico (vê todos). Para **não-Admin**, `listar` filtra
  aos Databases com `DatabaseGrant` ACTIVE do próprio (via `resolverPoderNoDatabase`/lista de ids concedidos) e
  `obter` de um Database sem concessão → **404 não-enumerante**. Padrão idêntico ao que `PipesService` faz para
  Pipe desde a 2.2 (não-enumeração por 404).
- **O que NÃO muda:** `criar`/`renomear`/`arquivar`/`restaurar` seguem **Admin da Org** (guard `administrar
  Database`). O ciclo de vida do Database é 3.1 congelado; a 3.2 **não** o amplia ao Admin do Database (Q3).

### Runtime (padrão do L1/E2)
- Controller injeta `RequestContext` + serviço; serviço injeta `RequestContext` + `PrismaService` +
  `PinoLogger`; queries por `withTenantContext`. Operações **single-statement** (`withTenantContext` recusa
  `$transaction`); nenhuma operação de 3.2 precisa de transação multi-statement (não há evento na mesma
  transação — Histórico do Registro é 3.4). Auditoria vem de `MODELOS_AUDITADOS` (T3).
- **Status HTTP (lição da 2.2):** `POST /databases/:id/grants` → **201** (cria concessão); `PATCH /:grantId`
  → **200**; `DELETE /:grantId` (revogar soft) → **200** via `@HttpCode(HttpStatus.OK)` (transição de estado,
  não exclusão — devolve a concessão revogada, não 204). `GET` → 200.

### Observabilidade / LGPD
- Logs estruturados (Pino) sanitizados. `membershipId` é **id interno**, **não** PII (não é e-mail/nome); `role`
  não é sensível. Campos mínimos (Org, ator, operação, recurso, alvo, resultado) conforme AD-31/FR-214. **Não**
  logar payloads de corpo com dados de pessoa.

### Clarificações pendentes (para o `clarify` do Spec Kit resolver)
- **Q1 — Admin do Database pode se AUTO-revogar / revogar outro Admin do Database?** Proposta: **não** — só o
  Admin da Org mexe em concessões `ADMIN` (conceder, alterar, revogar). Admin do Database só toca MEMBER/VIEWER.
  Confirmar na epics ("somente Admin da Org concede/remove Admin do Database" → sim, inclui revogar).
- **Q2 — código HTTP para "GUEST não pode receber ADMIN/MEMBER".** Proposta: **400** (corpo inválido para o
  alvo), coerente com `exigirMembershipAtivaDaOrg` da 2.2. Alternativa: 409 (conflito de regra). Decidir e fixar.
- **Q3 — Admin do Database renomeia/arquiva o Database?** Proposta: **não** — ciclo de vida é 3.1 (Admin da
  Org); Admin do Database administra CONFIG (grants/3.2, schema/3.3), espelhando `PipeRole.ADMIN`. Confirmar que
  a epics de 3.2 não estende o ciclo de vida.
- **Q4 — auto-concessão / Admin da Org sem `DatabaseGrant`.** Admin da Org acessa todos **sem** concessão (como
  na 2.1/2.2). Confirmar que não se cria linha de grant para o Admin da Org (seria dado redundante e enganoso).

### References
- [Source: epics.md#Story-3.2] — escopo, ajuste 2 (autoridade hierárquica), AC, dependências, "fora".
- [Source: epics.md#Épico-3] — objetivo, ordem interna 3.1→3.10, "permissões por Campo fora da Fase 1".
- [Source: ARCHITECTURE-SPINE.md#AD-9] — **papel da Organização é o teto** (Convidado só Somente-leitura).
- [Source: ARCHITECTURE-SPINE.md#AD-6/AD-7/AD-10/AD-11] — isolamento pelo banco; Grant liga a Membership; dado
  org-owned; nada materializado para o futuro (role dormente).
- [Source: _bmad-output/implementation-artifacts/2-2-papeis-e-acesso-por-pipe.md] — **twin estrutural**:
  `Grant` ligado a Membership, índice único parcial `WHERE state='ACTIVE'`, revogar = `state` (sem DELETE),
  resolução fina no serviço, 409 por P2002, `@HttpCode` no revogar, role dormente (SC-222=B).
- [Source: _bmad-output/implementation-artifacts/3-1-ciclo-de-vida-e-catalogo-de-databases.md] — entidade
  `Database`, RLS/GRANT/CASL de Database, `database-lifecycle.ts`, contexto congelado (papéis = 3.2).
- [Source: apps/api/src/pipes/grants/pipe-grants.service.ts] — padrão de serviço de concessão a replicar
  (validar recurso/alvo, P2002→409, soft-revoke sem falso `denied`).
- [Source: apps/api/src/pipes/pipe-authz.ts] — `resolverPoderNoPipe`/`exigir*` — padrão de resolução fina
  (Poder gerenciar > operar > ler; 404 não-enumerante) a espelhar em `database-authz.ts`.
- [Source: apps/api/src/kernel/authz/ability.factory.ts] — abrir `ler Database` grossa (como `ler Pipe`);
  manter `administrar Database` Admin-only; papel da Org é o teto.
- [Source: apps/api/src/databases/databases.service.ts] — arquivo a MODIFICAR (listar/obter finos p/ não-Admin).
- [Source: apps/api/prisma/schema.prisma#PipeGrant/Database] — padrão de model org-owned a replicar.
- [Source: apps/api/src/kernel/db/tenant-context.ts] — `withTenantContext`, `MODELOS_AUDITADOS`, recusa de
  `$transaction`.
- [Source: CLAUDE.md] — invariantes (Pipe ≠ Database), RLS/FORCE/WITH CHECK, GRANT como fronteira, DBT-AUTHZ-01,
  "sem antecipar escopo", regra de ouro dos testes (Org C + contas descartáveis; `test:ci` serial).

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-16 | Story criada (E3, Wave 4) a partir de `epics.md` (Story 3.2) e da Spine (AD-9), como **twin estrutural da 2.2** (`PipeGrant`). Risco **CRÍTICO** (nova tabela `DatabaseGrant` + 2 enums + RLS/FORCE + migration + índice único parcial + GRANT sem DELETE; abre o sujeito CASL `ler Database`; modifica o `DatabasesService` da 3.1). Escopo **congelado**: só papéis e acesso por Database (3.3 Formulário / 3.4 Registros / permissões por Campo fora da Fase 1). Decisões-chave: `DatabaseGrant` distinto de `PipeGrant` (RN-061); autoridade hierárquica de concessão (Admin do Database só concede MEMBER/VIEWER; só Admin da Org concede/remove ADMIN do Database — ajuste 2) resolvida em `database-authz.ts` (`exigirConcederPapel`); `ler Database` aberto grossa (twin de `ler Pipe`) com guarda fina no serviço (DBT-AUTHZ-01, guard não tocado); teto da Org (GUEST só VIEWER — AD-9); no máximo um papel ativo por (Database, pessoa) via índice único parcial; revogar = `state` (sem DELETE, corta acesso na hora); **role dormente** — poder diferencial Membro vs Somente-leitura sobre Registros/schema é contrato futuro 3.3/3.4 (AD-11), consumidores concretos em 3.2 = acesso ao catálogo + autoridade de concessão. Q1–Q4 abertas para o `clarify`. Dependências 3.1/1.6 `done`. Status → **ready-for-dev**. |
