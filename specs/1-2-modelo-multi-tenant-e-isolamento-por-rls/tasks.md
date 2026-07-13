# Tasks — Story 1.2 (modelo multi-tenant e isolamento por RLS)

Ordenadas por dependência. Cada task é pequena, verificável e vinculada a critérios de aceite (AC) e requisitos (FR/SC).
Nenhuma task genérica do tipo "configurar RLS" — cada uma nomeia o artefato e a prova.

## Phase 1: Gates pré-código

- [x] T001 Executar `context7-check`: fixar versão do PostgreSQL e do Prisma; confirmar a API atual de Client Extensions na versão fixada (a forma de injetar `set_config` na transação muda entre majors) — não decidir de memória (Constitution III)
- [x] T002 Decidir e registrar a estratégia de **PostgreSQL real nos testes** (container do Compose vs. Testcontainers). Testcontainers = dependência nova ⇒ exige aprovação explícita (SC-106)
- [x] T003 Executar `pre-implementation-check` e registrar GO / GO WITH CONDITIONS / NO-GO

## Phase 2: Infraestrutura de banco

- [x] T004 Adicionar serviço `db` (PostgreSQL) ao `docker-compose.yml` com healthcheck e volume nomeado; `api` com `depends_on: {db: {condition: service_healthy}}` (FR-212)
- [x] T005 Estender `apps/api/src/kernel/config/env.ts` com `DATABASE_URL` (papel de aplicação), validada com fail-fast sanitizado, reusando o mecanismo Zod existente. `MIGRATION_DATABASE_URL` fica **deliberadamente fora** do env do runtime e é validada em `scripts/db-migrate.mjs` (FR-208) — **ver Divergência D1**
- [x] T006 Garantir que a string de conexão (contém senha) nunca apareça em log, erro ou payload — asserção de teste, não só cuidado (FR-213)
- [x] T007 Atualizar `.env.example` com as duas URLs, sem valor sensível real (FR-208)

## Phase 3: Papéis de banco e privilégios (AC4)

- [x] T008 Criar papel `giraffe_migrator` (dono do schema, executa migrations; nunca em requisição) — versionado em `prisma/bootstrap/00-roles.sql`, **não** na migration (FR-208, FR-211) — **ver Divergência D2**
- [x] T009 Criar papel `giraffe_app` **sem** `BYPASSRLS`, **sem** `SUPERUSER` e **não proprietário** das tabelas (o dono contorna RLS por padrão) (FR-208)
- [x] T010 Conceder `GRANT` mínimo a `giraffe_app`; **sem** DDL (FR-208). Mínimo de verdade, por tabela: `Account` só `SELECT`; `Organization` `SELECT`/`UPDATE`; `Membership` CRUD — **ver Divergência D3**
- [x] T011 Teste que consulta `pg_roles` e **prova** que `giraffe_app` não tem `BYPASSRLS` nem `SUPERUSER`, e teste que consulta `pg_class.relowner` e **prova** que ele não é dono das tabelas (SC-104, AC4)

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
- [x] T023 Policy `SELECT` de `Membership`: `USING (orgId = current_org OR (current_org IS NULL AND accountId = current_account))` — destrava o login da Story 1.4 sem afrouxar isolamento (FR-210). O `OR` **solto**, como escrito originalmente aqui, VAZAVA: ver **T056** — havendo Organização ativa, ela é a única fronteira
- [x] T024 Policies `INSERT`/`UPDATE`/`DELETE` de `Membership`: `WITH CHECK (orgId = current_org)` — escrita **sempre** restrita ao contexto (FR-205, FR-210)
- [x] T025 `Account` **sem** RLS (identidade global, Plataforma — AD-10); justificar em comentário no schema/migration (FR-201)

## Phase 7: Migrations, seed, backup (AC2, AC4)

- [x] T026 Migration versionada contendo DDL **e** o SQL de RLS (policies, `FORCE`, `GRANT`) — nada aplicado à mão (FR-211). Os **papéis** ficam no bootstrap versionado, que precede as migrations — **ver Divergência D2**
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
- [x] T055 `code-review` e `commit-check` antes de qualquer commit

## Phase 11: Code Review (findings CR3) — correções da revisão adversarial

- [x] T056 **CR3-01 (CRITICAL)** `membership_select` vazava entre Organizações: `USING ("orgId" = current_org_id() OR "accountId" = current_account_id())` faz o ramo da conta casar com o vínculo dela em OUTRA Org quando os dois contextos estão definidos — e `withTenantContext` define os dois. Corrigido para exclusão mútua (`current_org_id() IS NULL AND ...`) + teste de regressão com a conta que pertence a duas Orgs (AC1, FR-210)
- [x] T057 **CR3-02 (CRITICAL)** `GRANT DELETE ON "Account"` permitia escrita cross-tenant POR BAIXO da RLS: `Account` não tem policy, e a cascata da FK `Membership_accountId_fkey` roda com bypass de row security. Reduzido para `GRANT SELECT` + testes de negação de INSERT/UPDATE/DELETE (AC1, AD-6)
- [x] T058 **CR3-03 (HIGH)** Runtime conseguia criar/apagar `Organization`, contradizendo a fronteira documentada (`org_insert` com `WITH CHECK (id = current_org_id())` é auto-satisfazível). `GRANT` reduzido a `SELECT, UPDATE` + testes (AC2)
- [x] T059 **CR3-04 (HIGH)** Tentativa cruzada filtrada pelo `USING` era auditada como `allowed`: `updateMany`/`deleteMany` retornam `{count: 0}` sem lançar, e `update`/`delete` lançam `P2025` (não reconhecido). Auditoria passa a cobrir as três formas de negação + testes de regressão (FR-213, FR-214)
- [x] T060 **HIGH** Papéis existiam só no `docker-entrypoint-initdb.d` (roda uma vez, só com volume vazio) — a migration concedia privilégio a papéis que ela não cria, e o deploy em banco gerenciado quebraria. Extraídos para `prisma/bootstrap/00-roles.sql`, idempotente, versionado, mesmo arquivo em todos os ambientes; runbook do README atualizado (FR-211, AD-32)
- [x] T061 **HIGH** `logger` era opcional em `withTenantContext`/`withAccountContext`, com default no-op: o primeiro chamador que esquecesse o argumento perderia a trilha de auditoria em silêncio. Passou a ser obrigatório (FR-214)
- [x] T062 **HIGH** `$transaction` no client estendido corrompia o contexto em silêncio (o gancho fecha sobre o client raiz ⇒ segunda transação, outra conexão, sem contexto, atomicidade perdida). Caminho FECHADO com erro de compilação e de runtime; transação com contexto é escopo da Story 1.3
- [x] T063 **MEDIUM** Sonda de `/ready` provava só o socket (`SELECT 1`): banco de pé com migrations não aplicadas respondia `200 ok`. Passou a ler uma tabela do schema (`LIMIT 0`) — prova conexão, schema e GRANT — com deadline próprio e log sanitizado da causa (o 503 era mudo)
- [x] T064 **MEDIUM** Senhas do Compose com default (`${VAR:-senha}`): ambiente sem a variável subia com credencial conhecida e versionada. Trocado por `${VAR:?}` (Constitution VI)
- [x] T065 **MEDIUM** `EXCEPTION WHEN others` nas funções de contexto engolia falha real de infraestrutura e a transformava em "sem contexto" ⇒ negação silenciosa. Restrito a `invalid_text_representation`
- [x] T066 **MEDIUM** Caminho POSITIVO do AC2 (update e remoção lógica DENTRO da própria Org) não tinha asserção nenhuma — uma policy que negasse toda escrita passaria na suíte. Teste adicionado
- [x] T067 **MEDIUM** Corrida entre arquivos de teste paralelos (um escrevia na Org A enquanto o outro afirmava a contagem dela). Org C, vazia, criada no seed como área de escrita; suíte estável em 3 execuções consecutivas
- [x] T068 **LOW** `db:rollback` era citado na documentação e não existia; o caminho do arquivo era fixo (reverteria a migration errada assim que houvesse uma segunda); falha de spawn saía 1 sem imprimir nada. Os três corrigidos
- [x] T069 **LOW** Asserções `rejects.toThrow()` sem padrão passavam com qualquer erro; consulta a `pg_class` sem filtro de schema/`relkind`; `health.test.ts` restaurava só uma das três variáveis de ambiente. Corrigidos
- [x] T070 `CLAUDE.md` descrevia um estado que deixou de existir ("sem banco", "`/ready` equivalente a `/health`", "kernel só `config/`") e não avisava que `pnpm test` passou a exigir PostgreSQL no ar. Atualizado
- [x] T071 Gates re-executados com evidência real e registrados em `_bmad-output/implementation-artifacts/gates/1-2/`; `checklist.md` preenchido

## Divergências do plano (registradas, não silenciosas)

- **D1 — `MIGRATION_DATABASE_URL` fora do kernel de config (T005).** O plano (D3) pedia as duas
  URLs validadas no `env.ts`. Implementado de forma diferente e mais restritiva: o schema Zod do
  runtime **não conhece** a variável, e há teste que exige a ausência dela. Motivo: o processo que
  atende requisição não pode ter em mãos a credencial do dono do schema, capaz de contornar o RLS.
  A validação da variável vive em `scripts/db-migrate.mjs`, que é quem a usa. O Compose não a passa
  ao serviço `api`.
- **D2 — Papéis fora da migration (T008/T009).** As tasks pediam "na migration, versionado".
  Impossível como escrito: `CREATE ROLE` exige privilégio administrativo, que o `giraffe_migrator`
  (quem roda as migrations) não tem — a migration falharia. Versionado em
  `prisma/bootstrap/00-roles.sql`, idempotente, executado por papel administrativo antes das
  migrations. O requisito de fundo (papéis versionados, reprodutíveis, não presos ao Compose) está
  atendido; o mecanismo é outro.
- **D3 — `GRANT` mínimo por tabela (T010).** A task pedia "SELECT/INSERT/UPDATE/DELETE nas tabelas".
  Concedido menos que isso, por segurança: ver T057 e T058 — o privilégio uniforme abria dois
  caminhos de escrita cross-tenant que a RLS não alcança.
