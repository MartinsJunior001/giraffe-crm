# Tasks — Story 1.2 (modelo multi-tenant e isolamento por RLS)

Ordenadas por dependência. Cada task é pequena, verificável e vinculada a critérios de aceite (AC) e requisitos (FR/SC).
Nenhuma task genérica do tipo "configurar RLS" — cada uma nomeia o artefato e a prova.

## Phase 1: Gates pré-código

- [x] T001 Executar `context7-check`: fixar versão do PostgreSQL e do Prisma; confirmar a API atual de Client Extensions na versão fixada (a forma de injetar `set_config` na transação muda entre majors) — não decidir de memória (Constitution III)
- [x] T002 Decidir e registrar a estratégia de **PostgreSQL real nos testes** (container do Compose vs. Testcontainers). Testcontainers = dependência nova ⇒ exige aprovação explícita (SC-106)
- [x] T003 Executar `pre-implementation-check` e registrar GO / GO WITH CONDITIONS / NO-GO

## Phase 2: Infraestrutura de banco

- [x] T004 Adicionar serviço `db` (PostgreSQL) ao `docker-compose.yml` com healthcheck e volume nomeado; `api` com `depends_on: {db: {condition: service_healthy}}` (FR-212)
- [x] T005 Estender `apps/api/src/kernel/config/env.ts` com `DATABASE_URL` (papel de aplicação) e `MIGRATION_DATABASE_URL` (papel de migration), validadas com fail-fast sanitizado — reusar o mecanismo Zod existente, **não** criar segundo caminho de config (FR-208)
- [x] T006 Garantir que a string de conexão (contém senha) nunca apareça em log, erro ou payload — asserção de teste, não só cuidado (FR-213)
- [x] T007 Atualizar `.env.example` com as duas URLs, sem valor sensível real (FR-208)

## Phase 3: Papéis de banco e privilégios (AC4)

- [x] T008 Criar papel `giraffe_migrator` (dono do schema, executa migrations; nunca em requisição) — na migration, versionado (FR-208, FR-211)
- [x] T009 Criar papel `giraffe_app` **sem** `BYPASSRLS`, **sem** `SUPERUSER` e **não proprietário** das tabelas (o dono contorna RLS por padrão) (FR-208)
- [x] T010 Conceder `GRANT` mínimo a `giraffe_app` (SELECT/INSERT/UPDATE/DELETE nas tabelas; **sem** DDL) (FR-208)
- [x] T011 Teste que consulta `pg_roles` e **prova** que `giraffe_app` não tem `BYPASSRLS` nem `SUPERUSER`, e não é dono das tabelas (SC-104, AC4)

## Phase 4: Modelo de dados (AC1, AC2, AC3)

- [x] T012 Modelar `Account` em `prisma/schema.prisma`: identidade global, **sem `orgId`**, e-mail único **global**, uuid (FR-201)
- [x] T013 Modelar `Organization`: raiz do tenant, uuid, timestamps (FR-202)
- [x] T014 Modelar `Membership`: `accountId`, `orgId`, `role` enum (`ADMIN`/`MEMBER`/`GUEST` — NFR-4), `state` enum (`ACTIVE`/`SUSPENDED`/`REMOVED` — Épico 8), único `(accountId, orgId)`; **sem `deletedAt`** (o `state` é a fonte de verdade) (FR-202)
- [x] T015 `orgId` NOT NULL + FK em toda tabela organizacional; índice composto com `orgId` como **primeira** coluna (FR-203)

## Phase 5: Contexto de tenant (AC1, AC2, AC3, AC4)

- [x] T016 Definir o contrato `app.current_org_id` / `app.current_account_id` no kernel (`src/kernel/db/`) (FR-206)
- [x] T017 Implementar a Prisma Client Extension que executa `set_config(..., true)` **dentro da mesma transação** da query — transaction-local, nunca global no pool (FR-206)
- [x] T018 Teste: conexão devolvida ao pool **não** carrega o contexto da requisição anterior (edge case do Spec)
- [x] T019 **Proibir** qualquer policy/flag/caminho de bypass (`app.bypass_rls` ou equivalente) — o exemplo oficial do Prisma sugere um; **não** adotar (FR-209, AD-6)

## Phase 6: Políticas RLS (AC1, AC2, AC3, AC4)

- [x] T020 `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em `Organization` e `Membership` (FR-204)
- [x] T021 Policy `SELECT` de `Organization`: `USING (id = current_org)` (FR-205)
- [x] T022 Policies `INSERT`/`UPDATE`/`DELETE` de `Organization` com **`WITH CHECK`** — `USING` sozinho **não** protege INSERT (FR-205)
- [x] T023 Policy `SELECT` de `Membership`: `USING (orgId = current_org OR accountId = current_account)` — destrava o login da Story 1.4 sem afrouxar isolamento (FR-210)
- [x] T024 Policies `INSERT`/`UPDATE`/`DELETE` de `Membership`: `WITH CHECK (orgId = current_org)` — escrita **sempre** restrita ao contexto (FR-205, FR-210)
- [x] T025 `Account` **sem** RLS (identidade global, Plataforma — AD-10); justificar em comentário no schema/migration (FR-201)

## Phase 7: Migrations, seed, backup (AC2, AC4)

- [x] T026 Migration versionada contendo DDL **e** o SQL de RLS (policies, `FORCE`, `GRANT`, papéis) — nada aplicado à mão (FR-211)
- [x] T027 Migration como **etapa controlada**: não roda no entrypoint do container; documentar o comando de aplicação (FR-211, AD-32)
- [x] T028 Plano de **rollback** da migration, verificável na prática (não apenas descrito) (FR-211, SC-107)
- [x] T029 Seed de desenvolvimento com **duas Organizações**, Accounts e Memberships — é a fixture dos testes de isolamento; sem dado real de produção (LGPD)
- [x] T030 Executar e registrar `migration-check` (deixa de ser N/A neste projeto)
- [x] T031 Executar e registrar `backup-check`: backup/restore isolados, sem mistura entre Organizações; backup concluído **não** prova recuperabilidade — restore testado com evidência (AD-33)

## Phase 8: Testes de isolamento (AC1, AC2, AC3, AC4)

- [x] T032 Infra de teste contra **PostgreSQL real**, com fixture de duas Organizações (SC-106)
- [x] T033 **Positivo:** no contexto da Org A, leitura/criação/atualização/remoção lógica de dados da Org A funcionam (AC2)
- [x] T034 **Negativo — leitura cruzada:** contexto Org A ⇒ `SELECT` não retorna nenhuma linha da Org B (AC1, SC-101)
- [x] T035 **Negativo — `INSERT` forjado:** contexto Org A + `orgId` da Org B ⇒ **rejeitado** (prova o `WITH CHECK`) (AC2, AC3, SC-102)
- [x] T036 **Negativo — `UPDATE` cruzado:** contexto Org A sobre linha da Org B ⇒ **0 linhas** afetadas (AC2, SC-102)
- [x] T037 **Negativo — remoção lógica cruzada:** idem ⇒ **0 linhas** (AC2, SC-102)
- [x] T038 **Negativo — sem contexto:** transação sem `app.current_org_id` não lê nem escreve nenhuma linha organizacional (AC4, SC-103)
- [x] T039 **Positivo/negativo — Membership da própria conta:** a conta lê as **próprias** Memberships sem contexto de Org, e **não** lê as de outra conta (FR-210, SC-105)
- [x] T040 Todos os testes de RLS entram em `pnpm test` e são cobertos por `pnpm typecheck` (padrão da Story 1.1)

## Phase 9: Observabilidade, auditoria e segurança (AC4)

- [x] T041 Log estruturado inclui a Organização do contexto; sem PII desnecessária e **sem** a string de conexão (FR-213)
- [x] T042 Negação por contexto ausente/inválido é **visível** no log — falha honesta, não silenciosa (FR-213)
- [x] T043 Auditoria mínima de `Organization`/`Membership`: ator, Organização, ação, recurso, resultado, timestamp (FR-214)
- [x] T044 Executar e registrar `security-check`
- [x] T045 Executar e registrar `lgpd-check` — **primeira PII do projeto** (`Account.email`): minimização, base legal, retenção
- [x] T046 Executar e registrar `observability-check`

## Phase 10: Container, `/ready` e regressão da Story 1.1 (AC4) — trata CR2-09

- [x] T047 `prisma generate` no build da imagem da API; client gerado **e binários de engine** presentes na imagem final (o engine é nativo — esquecê-lo falha só em runtime)
- [x] T048 `/ready` passa a checar o banco: apto → `200 {status:"ok"}`; indisponível → **503**. Payload **sem** campos extras (preserva o AC2 da Story 1.1) (FR-212)
- [x] T049 `/health` (liveness) **não** checa o banco — continua respondendo enquanto o processo viver (FR-212)
- [x] T050 Atualizar os testes de `/ready` para cobrir **os dois** caminhos (200 e 503) — **sem afrouxar** a asserção de payload da Story 1.1 (FR-212)
- [x] T051 Atualizar `scripts/smoke.mjs` e o `HEALTHCHECK` para o novo contrato de `/ready`, mantendo o diagnóstico honesto (CR2-05)
- [x] T052 **Teste real de boot do container de produção**: a API sobe, conecta ao banco com `giraffe_app`, `/ready` responde 200 — build verde **não** prova boot (lição F2/F8 da Story 1.1) (SC-107)
- [x] T053 Verificar que **nenhum** `packages/` foi criado; se tiver sido, **resolver o CR2-09 nesta Story** (fechamento transitivo de deps internas no Dockerfile) — proibido adiar de novo
- [x] T054 Ciclo completo verde: `install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `test`, `build`, `docker compose up` (db+api healthy), `smoke`, `down`
- [ ] T055 `code-review` e `commit-check` antes de qualquer commit
