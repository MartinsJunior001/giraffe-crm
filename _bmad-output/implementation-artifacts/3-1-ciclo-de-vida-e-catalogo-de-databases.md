---
story_key: 3-1-ciclo-de-vida-e-catalogo-de-databases
epic: 3
status: ready-for-dev
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: CRÍTICO
baseline_commit: 65214b3
gate_arquitetura: Nova entidade organizacional (Database) com nova tabela + enum + RLS/FORCE + migration versionada + GRANT column-scoped (sem DELETE). Toca o invariante-mãe (isolamento por Organização) e estende o substrato CASL (novo sujeito Database). Consome os contratos congelados do L1/L2 (RLS, GRANT, CASL, guard) SEM alterá-los. Escopo congelado: SOMENTE ciclo de vida e catálogo de Databases (papéis/acesso por Database = 3.2; Formulário de Database = 3.3; Registros = 3.4). A "trava de somente-leitura integral sob arquivamento" é enforced-por-owner: os DADOS dependentes (Registro/Formulário/Campo/arquivo/vínculo) NÃO existem em 3.1 — a regra é contrato futuro consumido por 3.3/3.4/3.7/3.8/3.9 (AD-11, sem materializar relação para o futuro).
---

# Story 3.1 — Ciclo de vida e catálogo de Databases

**As a** Administrador da Organização,
**I want** criar, renomear, arquivar e restaurar Databases,
**So that** eu mantenha bases de dados estruturadas, separadas dos processos (Database ≠ Pipe).

**Status: ready-for-dev.** Primeira Story do **Épico 3** (Databases, Registros, Vínculos e Arquivos),
risco **CRÍTICO** — introduz a primeira entidade de domínio do E3 (`Database`) com **nova tabela, enum,
RLS+FORCE e migration versionada**, tocando o **invariante-mãe** (isolamento por Organização). É o **twin
estrutural da Story 2.1** (ciclo de vida e catálogo de Pipes): mesma forma de RLS/GRANT/CASL/guard, aplicada
a um domínio novo e **distinto** de Pipe (RN-061). Dependências **1.6** (autorização) e **1.7** (casca)
estão `done`; o Épico 2 está `done` (18/18) e fornece o padrão consolidado a replicar.

> **Escopo congelado:** **somente ciclo de vida e catálogo de Databases.** Papéis/acesso por Database são da
> **3.2**; o Formulário de Database (schema do Registro) é da **3.3**; Registros e seu Histórico são da **3.4**;
> arquivos são de **3.7/3.8**; vínculo Card↔Registro é da **3.9**. Não antecipar (Constitution II).

---

## Escopo (do épico, congelado)

Admin da Org **cria/renomeia/arquiva/restaura** Databases; **catálogo real da Org atual** (RN-131); Database é
**distinto de Pipe** (RN-061). **Arquivar coloca o Database integralmente em modo somente leitura** (ajuste 1
da epics): bloqueia novos Registros, submissões e vínculos; edição de Registros; publicação/despublicação/
alteração do Formulário/schema; criação/alteração/remoção de Campos; uploads/substituições/remoções de
arquivos; criação/alteração de relacionamentos. Registros, Campos, arquivos, vínculos e Históricos existentes
permanecem **consultáveis conforme as permissões atuais**. Arquivar é **reversível** e **não é bloqueado por
Registros vinculados a Cards**. Restaurar reabilita as operações **sem alterar identidades nem referências**.

**Rastreabilidade:** FR-18; RN-061/131; D3.4; NFR-3/4; AD-10/11.
[Source: epics.md#Story-3.1; ARCHITECTURE-SPINE.md#AD-10/AD-11]
**Dep.:** 1.6, 1.7. **Gates:** —

**Fora do escopo:**
- **Papéis e acesso por Database** (3.2) — em 3.1 só o **Admin da Org** administra/lê Databases;
  MEMBER/GUEST **não** têm acesso a Database (deny-by-default) até a 3.2.
- **Formulário de Database / schema do Registro** (3.3) — 3.1 **não** dá owner ao contexto `DATABASE` do
  `Form` (a coluna de owner `Form.databaseId` e a rota que cria `context = DATABASE` são da 3.3; hoje o enum
  `FormContext.DATABASE` existe **só como contrato**, sem owner — schema.prisma:94-100/473).
- **Registros** (3.4); **arquivos** (3.7/3.8); **vínculo Card↔Registro** (3.9).
- **Exclusão definitiva, duplicação, transferência entre Organizações** (do épico).

**Demonstração vertical:** Admin cria um Database; ele aparece no catálogo (escopo da Org), **distinto de
Pipe**; arquiva (entra em somente-leitura) e restaura preservando dados; outro tenant **não** vê o Database
(RLS).

---

## Acceptance Criteria

1. **AC1 — catálogo real, org-scoped, distinto de Pipe.** *Given* o Admin da Organização *When* cria/renomeia
   um Database *Then* ele aparece no **catálogo real da Org atual** (RN-131), **distinto de Pipe** (RN-061;
   tabela/catálogo/subject separados), e **nunca** em outra Organização (isolamento RLS).
2. **AC2 — arquivar = somente-leitura integral; não bloqueado por vínculos.** *Given* um Database (mesmo que,
   no futuro, tenha Registros vinculados a Cards) *When* é arquivado *Then* o arquivamento **não é bloqueado**
   e o Database entra em **modo somente leitura integral** — todas as operações de escrita listadas ficam
   bloqueadas. **Nota (AD-11 / Constitution II):** em 3.1 **não existem** Registro/Formulário-de-Database/
   Campo/arquivo/vínculo — a precondição "não bloqueado por Registros vinculados" é **vacuamente satisfeita** e
   a trava de somente-leitura sobre esses dados é **contrato futuro** consumido por 3.3/3.4/3.7/3.8/3.9; **não**
   se materializa tabela/relação alguma para preparar o futuro. O único write-side de Database que existe em
   3.1 — **renomear** — é **bloqueado** quando o Database está `ARCHIVED` (409), materializando a regra "somente
   leitura integral" com um consumidor **concreto** (ver Clarificação Q1).
3. **AC3 — restaurar preserva identidade e referências.** *Given* um Database arquivado *When* restaurado
   *Then* identidade (`id`), nome e (no futuro) Registros/Campos/arquivos/vínculos/Históricos são **preservados**
   e as operações de escrita são **reabilitadas sem alterar identidades ou referências**.
4. **AC4 — sem exclusão/duplicação/transferência; ciclo de vida é do Admin da Org.** *Given* qualquer ator
   *When* opera sobre Databases *Then* **não** há exclusão definitiva, duplicação nem transferência entre
   Organizações; um não-Admin (MEMBER/GUEST) **não** cria/renomeia/arquiva/restaura Databases (deny-by-default,
   provado por autorização negativa). O GRANT do runtime **não** inclui `DELETE` em `Database`.
5. **AC5 — isolamento (RLS) provado.** *Given* dois tenants *When* um lê/lista Databases *Then* vê **apenas**
   os da própria Organização; um INSERT/SELECT/UPDATE fora do contexto (ou com `orgId` alheio) é **negado pelo
   banco** (FORCE RLS + `WITH CHECK`), não só pela aplicação.

---

## Tasks / Subtasks

- [ ] **T1 — Gates pré-código.** Executar e registrar em `_bmad-output/implementation-artifacts/gates/3-1/`:
  `context7-check` (Prisma 6.19.3 — migration/enum/`create`/`update`/`updateMany`; NestJS 11 — DTO/exceptions/
  `@HttpCode`), `pre-implementation-check`, `security-check`, `lgpd-check` (confirmar: nome de Database é rótulo
  de base, **não** PII), `migration-check` (SC-206, banco descartável), `backup-check`, `observability-check`,
  `performance-check`. Só prosseguir se `APROVADO`/`APROVADO COM RESSALVAS`.
- [ ] **T2 — Schema + migration + rollback.** `prisma/schema.prisma` (enum `DatabaseState`, model `Database`,
  `Organization.databases`); `prisma/migrations/<timestamp>_databases/migration.sql` (enum, tabela, índice
  `(orgId, state)`, FK → `Organization`, RLS **ENABLE + FORCE**, 4 policies por `current_org_id()` com
  `WITH CHECK` no INSERT **e** no UPDATE, GRANT `SELECT/INSERT/UPDATE` **sem DELETE**); rollback
  `prisma/rollback/<timestamp>_databases.down.sql`. Verificar no banco pelo **SC-206** → `gates/3-1/migration-check.md`.
- [ ] **T3 — Auditoria.** Adicionar `Database` a `MODELOS_AUDITADOS` em `kernel/db/tenant-context.ts`
  (mutação de entidade organizacional entra na trilha; caminhos idempotentes não emitem `updateMany`).
- [ ] **T4 — Autorização (CASL).** `kernel/authz/ability.ts` (novo sujeito `Database`, forma `{ id, orgId }`),
  `ability.factory.ts` (ADMIN da Org → `ler`/`administrar` Database da própria Org; MEMBER/GUEST **nada**).
  **NÃO** tocar `authz.guard.ts** — desde a 2.1 o guard já escopa sujeitos de domínio por `{ id, orgId }` (C3
  congelado). Provado em `test/databases-authz.test.ts`.
- [ ] **T5 — Módulo Databases (runtime).** `src/databases/` (`databases.module`, `databases.service`,
  `databases.controller`, `dto/databases.dto`, e o núcleo puro `database-lifecycle.ts` — ver Dev Notes),
  registrado no `AppModule`. **6 rotas**, todas com `@Requer`, todas sob `withTenantContext`. **Sem rota de
  exclusão.** `renomear` bloqueia (409) quando `state = ARCHIVED`. Provado em `test/databases-http.test.ts`.
- [ ] **T6 — Testes (PostgreSQL real).** `test/databases-rls.test.ts` (isolamento; `WITH CHECK` sem RETURNING
  via `createMany`; contexto ausente negado; UPDATE cross-tenant negado; **sem DELETE**; **fase vermelha**),
  `test/databases-authz.test.ts` (negativa MEMBER/GUEST), `test/databases-http.test.ts` (ciclo completo,
  catálogo distinto de Pipe, 404 cross-tenant, 400 sanitizado, **renomear em arquivado → 409**, idempotência de
  arquivar/restaurar). Escrever na **Org C** com contas descartáveis (`randomUUID`). **SC-206** (deploy +
  rollback + reaplicação) em banco descartável.
- [ ] **T7 — Documentação + gates finais.** Atualizar `CLAUDE.md` (bloco de estado: `Database` existe; E3
  iniciado); Spec Kit completo (`spec.md`, `checklists/requirements.md`, `research.md`, `data-model.md`,
  `contracts/`, `plan.md`, `tasks.md`, `analyze` opcional); `safe-implementation` e `code-review` em
  `gates/3-1/`.
  - [ ] **Revisão adversarial independente** — não auto-atestável por quem implementou.
  - [ ] **`commit-check`** — último gate, no momento do commit.

---

## Dev Notes

### Modelo de dados (AD-10/AD-11) — twin de `Pipe` (2.1)
- `Database` é **dado operacional da Organização** (AD-10): `orgId` FK → `Organization` (`onDelete: Cascade`,
  como `Pipe`). É **distinto de Pipe** (RN-061): tabela própria, catálogo próprio, subject CASL próprio — nunca
  reutilizar a tabela/rota/subject de `Pipe`.
- Campos: `id` (uuid, ref estável), `orgId`, `name` (String), `state` (`DatabaseState` = `ACTIVE`/`ARCHIVED`),
  `archivedAt` (DateTime?), `createdAt`, `updatedAt`. **Sem `locked`/`starred`** — a epics da 3.1 **não** os
  menciona para Database; não inventar (Constitution II). Diverge de `Pipe`, que os tinha por RN/D2.1 próprios.
- **Sem unicidade de nome** (`name`): o identificador estável é o `id` (AD-11). Nome único org-scoped criaria
  colisão no **restaurar** (arquiva "X", cria novo "X", restaura o antigo → conflito). RN-131 ("catálogo real")
  é sobre listar o real da Org, **não** unicidade de nome. Mesma decisão da 2.1.
- `state` `ACTIVE`/`ARCHIVED` (arquivamento = mudança de estado, **não** DELETE). `archivedAt` registra o
  momento. Restaurar zera `archivedAt` e volta a `ACTIVE`.

### Isolamento (AD-6, invariante-mãe) — replica o padrão de `Pipe`/`Membership`
- `Database` recebe **ENABLE + FORCE ROW LEVEL SECURITY**; 4 policies (`select/insert/update/delete`) por
  `orgId = current_org_id()`, com **`WITH CHECK` no INSERT e no UPDATE** — sem o `WITH CHECK` do UPDATE um
  UPDATE poderia **mover** a linha para outra Organização; sem o do INSERT, um INSERT com `orgId` alheio seria
  aceito e ficaria invisível. Toda query passa por `withTenantContext` (contexto por transação, `set_config
  (..., true)`); **nenhum `where orgId` manual** — a policy não esquece.
- **GRANT do runtime:** `SELECT, INSERT, UPDATE` — **sem DELETE** (o épico proíbe exclusão definitiva; o GRANT
  é a fronteira, como em `Pipe`/`Organization`/`Account`). Prova: teste de que o runtime não apaga Database.
  Uma rota de DELETE acrescentada por engano bateria em `permission denied`.

### Autorização (C3) — estende o catálogo de sujeitos, sem alterar o contrato
- Novo sujeito `Database` no substrato CASL. Em 3.1: **ADMIN da Org** administra/lê Databases da própria Org;
  MEMBER/GUEST **negados** (deny-by-default) — papéis por Database chegam na **3.2**. Isto **consome** C3, não o
  altera (cada domínio adiciona seus sujeitos). **O `authz.guard.ts` NÃO é tocado**: desde a 2.1 o guard já
  trata sujeitos de domínio pela forma `{ id, orgId }` — esta Story herda o comportamento pronto (mais limpo
  que a 2.1, que precisou generalizar o guard e declarou o desvio D-1). Se, durante a implementação, o guard
  **precisar** ser tocado, declarar como desvio no `analyze.md` e escalar.

### Somente-leitura integral sob arquivamento = regra do `state` + **contrato futuro** (3.3/3.4/3.7/3.8/3.9)
- A epics manda que arquivar coloque o Database "integralmente em modo somente leitura", listando operações
  sobre **Registro, Formulário/schema, Campo, arquivo e vínculo**. **Nenhuma dessas entidades existe em 3.1.**
  Por **AD-11** ("nenhuma relação é materializada só para preparar o futuro") e **Constitution II**, 3.1 **não**
  cria Registro/Form-Database-owner/Field-file/vínculo só para poder bloqueá-los.
- O que 3.1 **materializa**: `Database.state` como **fonte de verdade única** do eixo somente-leitura. O que 3.1
  **documenta como contrato**: todo write-side futuro do domínio Database (3.3 publicar/alterar schema; 3.4
  criar/editar/arquivar Registro; 3.7/3.8 upload/substituir/remover arquivo; 3.9 criar/alterar vínculo) **deve**
  checar `Database.state === ACTIVE` (deny quando `ARCHIVED`) **antes** de escrever. É o mesmo padrão da 2.1,
  onde "não arquivar Pipe com Cards ativos" nasceu como **contrato futuro** enforced pela 2.11.
- **Consumidor concreto agora:** o único write-side de Database em 3.1 é **`renomear`**. Ele **consome** a regra:
  renomear é **bloqueado (409)** quando `state = ARCHIVED`. Isso dá à regra um consumidor real (evita abstração
  especulativa) e materializa "somente leitura integral" já na 3.1 — a única escrita permitida sobre um Database
  arquivado é **`restaurar`** (a transição de des-arquivamento). Ver Clarificação **Q1**.
- **Núcleo puro `database-lifecycle.ts`:** função(ões) pura(s) que decidem a transição — `planejarArquivamento`/
  `planejarRestauracao` (idempotência: arquivar já-arquivado / restaurar já-ativo = no-op 200) e o predicado
  **`assertDatabaseEditavel(state)`** (ou `podeEditarDatabase`) consumido por `renomear`. Sem I/O. É o **ponto de
  extensão** que 3.4+ reusam para o gate de somente-leitura (espelha `card-lifecycle.transitions.ts` e
  `phase-milestones.core.ts` do E2 — núcleo puro decide, serviço aplica).

### Runtime (padrão do L1/E2)
- Controller injeta `RequestContext` + `PrismaService` + `PinoLogger`; `contexto = requestContext.obter()`
  (lança sem contexto); queries por `withTenantContext(prisma, contexto, logger)`. Operações são **únicas**
  (create/update únicos) — `withTenantContext` **recusa** `$transaction`, e nenhuma operação de 3.1 precisa de
  transação multi-statement (não há evento na mesma transação em 3.1 — Histórico do Registro é 3.4). A trilha de
  auditoria vem de `MODELOS_AUDITADOS` (T3), não de escrita manual.
- **Status HTTP (lição da 2.1):** `POST /databases` → **201** (cria); `POST /:id/archive` e `POST /:id/restore`
  → **200** via `@HttpCode(HttpStatus.OK)` (transição de estado, **não** cria) — o default do `@Post` é 201 e
  seria um defeito de contrato. `PATCH /:id` (renomear) → **200**.

### Contexto `DATABASE` do `Form` — NÃO tocar em 3.1
- O enum `FormContext.DATABASE` já existe (schema.prisma:94-100) como **contrato** do E3, **sem** coluna de
  owner e **sem** rota que crie `context = DATABASE`. **3.1 não wire nada disso** — dar owner ao Formulário de
  Database é a **3.3**. Materializar `Form.databaseId` aqui seria antecipar escopo (AD-11).

### Observabilidade / LGPD
- Logs estruturados (Pino) sanitizados; **nome de Database não é PII** de pessoa (é rótulo de base). Sem segredo.
  Campos mínimos (Org, ator, operação, recurso, resultado) conforme AD-31/FR-214.

### References
- [Source: epics.md#Story-3.1] — escopo, AC, ajuste 1 (somente-leitura integral), dependências, "fora".
- [Source: epics.md#Épico-3] — objetivo, ordem interna 3.1→3.10, "fora do escopo do épico".
- [Source: ARCHITECTURE-SPINE.md#AD-10/AD-11/AD-13/AD-14] — propriedade do dado, referência estável +
  integridade dupla (nada materializado para o futuro), mutação pelo domínio dono, fonte única.
- [Source: _bmad-output/implementation-artifacts/2-1-ciclo-de-vida-e-catalogo-de-pipes.md] — **twin estrutural**:
  schema/migration/RLS/GRANT, CASL (novo sujeito), módulo com 6 rotas, `@HttpCode` em archive/restore, SC-206,
  decisão "sem unicidade de nome", trava-por-uso como contrato futuro.
- [Source: apps/api/prisma/schema.prisma#Pipe/Form/FormContext] — padrão de model org-owned a replicar; enum
  `DATABASE` como contrato sem owner (não tocar).
- [Source: apps/api/src/kernel/db/tenant-context.ts] — `withTenantContext`, `MODELOS_AUDITADOS`, recusa de
  `$transaction` no client estendido.
- [Source: CLAUDE.md] — invariantes (Pipe ≠ Database), RLS/FORCE/WITH CHECK, GRANT como fronteira, "sem
  antecipar escopo", regra de ouro dos testes (Org C + contas descartáveis; `test:ci` serial).

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
| 2026-07-16 | Story criada (E3, Wave 4) a partir de `epics.md` (Story 3.1) e da Spine (AD-10/AD-11), como **twin estrutural da 2.1**. Risco **CRÍTICO** (nova tabela + enum + RLS/FORCE + migration + GRANT sem DELETE). Escopo **congelado**: só ciclo de vida e catálogo de Databases (3.2 papéis / 3.3 Formulário / 3.4 Registros fora). Decisões-chave: `Database` distinto de `Pipe` (tabela/catálogo/subject próprios, RN-061); sem `locked`/`starred` (não na epics de 3.1); sem unicidade de nome (restaurar sem colisão; id é ref estável, AD-11); somente-leitura integral sob arquivamento = regra do `state` + **contrato futuro** consumido por 3.3/3.4/3.7/3.8/3.9 (AD-11 — não materializar relação para o futuro), com **renomear** como consumidor concreto (bloqueado em `ARCHIVED` → 409); runtime sem DELETE em Database; guard **não** tocado (herda o `{ id, orgId }` da 2.1). Dependências 1.6/1.7 `done`. Status → **ready-for-dev**. |
