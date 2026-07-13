# Feature Specification: Modelo multi-tenant e isolamento por RLS (Story 1.2)

**Feature Branch**: `story/1-2-modelo-multi-tenant-e-isolamento-por-rls`

**Created**: 2026-07-12

**Status**: Ready

**Input**: Story BMAD 1.2 (`_bmad-output/implementation-artifacts/1-2-modelo-multi-tenant-e-isolamento-por-rls.md`, validada), `epics.md` §Story 1.2, Architecture Spine (AD-6, AD-7, AD-10, AD-11; correlatos AD-17, AD-32, AD-33), NFR-3, NFR-4, INV-ADMIN-01, Constitution v1.0.0, Story 1.1 (`done`).

> Esta Story materializa o **invariante-mãe** do produto. A partir dela, o banco nega por padrão: mesmo que a aplicação erre, dado de uma Organização não alcança outra.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Isolamento de leitura entre Organizações (Priority: P1)

Como **plataforma multi-inquilino**, quero que uma operação no contexto da Org A jamais enxergue dados da Org B, para que o vazamento entre clientes seja impossível por construção.

**Why this priority**: é o invariante-mãe (AD-6/NFR-3). Vazamento de tenant é a falha mais grave possível neste produto.

**Independent Test**: com duas Organizações populadas, abrir contexto da Org A e consultar dados organizacionais → nenhuma linha da Org B retorna, em nenhuma consulta.

**Acceptance Scenarios**:

1. **Given** dados de duas Organizações **When** opero no contexto da Org A em leitura **Then** recursos da Org B nunca aparecem.
2. **Given** o contexto da Org A **When** consulto contando linhas **Then** a contagem reflete somente a Org A (o RLS filtra, não apenas a cláusula da aplicação).

### User Story 2 — Isolamento de escrita e de escrita forjada (Priority: P1)

Como **plataforma**, quero que criação, atualização e remoção lógica afetem somente a Organização do contexto, **inclusive quando o `orgId` do payload for forjado**, para que o cliente não consiga escrever fora do seu tenant.

**Why this priority**: `USING` sozinho filtra leitura; sem `WITH CHECK` a escrita cruzada passa silenciosamente. É o furo mais provável desta Story.

**Independent Test**: no contexto da Org A, tentar `INSERT`/`UPDATE`/remoção lógica visando a Org B → rejeitado ou 0 linhas afetadas.

**Acceptance Scenarios**:

1. **Given** o contexto da Org A **When** executo criação, atualização e arquivamento/remoção lógica **Then** cada operação afeta somente dados da Org A.
2. **Given** o contexto da Org A **When** tento `INSERT` com `orgId` da Org B **Then** a operação é **rejeitada** (não grava linha invisível).
3. **Given** um `orgId` forjado no payload **When** usado numa operação **Then** não alcança dados de outra Organização.

### User Story 3 — Deny-by-default e papel de banco sem bypass (Priority: P1)

Como **operador**, quero que a ausência de contexto negue tudo e que o papel de banco da aplicação não possa contornar o RLS, para que nenhum caminho de código ou de operação abra uma porta dos fundos.

**Why this priority**: um bypass alcançável em runtime anula todo o resto.

**Independent Test**: abrir transação sem contexto de Organização → nenhuma leitura nem escrita organizacional é possível. Inspecionar `pg_roles` → papel da aplicação sem `BYPASSRLS`/`SUPERUSER` e não proprietário das tabelas.

**Acceptance Scenarios**:

1. **Given** uma transação sem contexto de Organização **When** consulto ou escrevo dado organizacional **Then** o acesso é negado (0 linhas / rejeição).
2. **Given** o papel de banco da aplicação **Then** ele não possui `BYPASSRLS` nem `SUPERUSER`, e não é proprietário das tabelas.
3. **Given** o schema **Then** não existe policy, flag ou caminho de bypass de RLS alcançável em runtime.

### Edge Cases

- Contexto ausente → acesso negado (não erro genérico silencioso; a negação é **visível** no log).
- Contexto inválido (uuid malformado, Organização inexistente) → acesso negado, sem vazar existência.
- `orgId` do payload divergente do contexto → rejeitado (`WITH CHECK`).
- Conexão devolvida ao pool **não** pode carregar contexto da requisição anterior.
- Consulta das próprias Memberships **antes** de haver contexto de Organização (login, Story 1.4) deve funcionar sem afrouxar o isolamento.
- Banco indisponível → `/ready` responde **503**; `/health` continua respondendo (liveness).
- String de conexão (contém senha) **nunca** em log, erro ou payload.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-201**: O sistema MUST modelar `Account` como identidade **global** da Plataforma, sem `orgId` e sem RLS, com e-mail único globalmente (AD-7/AD-10).
- **FR-202**: O sistema MUST modelar `Organization` como raiz do tenant, e `Membership` como vínculo `Account × Organization` com **papel único** (`ADMIN`/`MEMBER`/`GUEST` — NFR-4) e **estado** (`ACTIVE`/`SUSPENDED`/`REMOVED` — Épico 8), único por `(accountId, orgId)`.
- **FR-203**: Toda tabela organizacional MUST ter `orgId` **NOT NULL** com FK para `Organization`, e índice composto com `orgId` como primeira coluna.
- **FR-204**: O sistema MUST habilitar `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela organizacional.
- **FR-205**: As políticas RLS MUST ser explícitas por operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), com **`USING`** para linhas existentes **e `WITH CHECK`** para linhas novas/modificadas.
- **FR-206**: O contexto de tenant MUST ser definido **dentro da transação** via `set_config('app.current_org_id', …, true)` e `set_config('app.current_account_id', …, true)` — nunca global na conexão do pool (AD-6).
- **FR-207**: Sem contexto de Organização, o acesso a dado organizacional MUST ser negado (deny-by-default).
- **FR-208**: O papel de banco da aplicação MUST NOT possuir `BYPASSRLS` nem `SUPERUSER`, e MUST NOT ser proprietário das tabelas. Migrations MUST usar papel separado.
- **FR-209**: O sistema MUST NOT conter policy, flag ou caminho de bypass de RLS alcançável em runtime.
- **FR-210**: A leitura das **próprias** Memberships de uma conta MUST ser possível sem contexto de Organização (pré-requisito do login — Story 1.4), sem afrouxar o isolamento: `SELECT` de `Membership` permitido quando `orgId = contexto` **ou** `accountId = contexto da conta`; escrita permanece restrita a `orgId = contexto`.
- **FR-211**: Migrations MUST ser etapa controlada (não executadas por cada container no boot), versionadas, com plano de **rollback** verificável (AD-17/AD-32).
- **FR-212**: `/ready` MUST refletir a disponibilidade do banco (primeira dependência externa): apto → `200 {status:"ok"}`; indisponível → **503**. O payload MUST NOT ganhar campos além de `status`. `/health` MUST NOT checar o banco.
- **FR-213**: Logs MUST incluir a Organização do contexto e tornar **visível** a negação por contexto ausente/inválido, sem PII desnecessária e **sem** a string de conexão (AD-29).
- **FR-214**: Operações sobre `Organization` e `Membership` (criação, mudança de papel/estado) MUST registrar auditoria mínima: ator, Organização, ação, recurso, resultado, timestamp.

### Non-Functional / Constraints

- **NFR-3**: isolamento entre Organizações (o invariante-mãe). **NFR-4**: papel efetivo (Admin da Org / Membro / Convidado); Super Admin sem acesso automático a dados de Org.
- **AD-6, AD-7, AD-10, AD-11**; correlatos **AD-17** (migrations), **AD-32** (deploy/migration controlada), **AD-33** (backup/restore sem mistura entre Organizações).
- **INV-ADMIN-01**: Super Admin (Plataforma) ≠ Admin da Organização — simétrico, sem acesso implícito.

### Key Entities

- **`Account`** — identidade global (Plataforma). Sem `orgId`. Sem RLS.
- **`Organization`** — raiz do tenant. RLS: `id = contexto`.
- **`Membership`** — `Account × Organization`; papel único + estado. RLS conforme FR-210.

Nenhuma entidade de domínio (Pipe, Card, Database, Registro, Formulário) — criá-la seria antecipação de escopo (Constitution II).

## Success Criteria *(mandatory)*

- **SC-101**: Com duas Organizações populadas, **nenhuma** consulta no contexto da Org A retorna linha da Org B.
- **SC-102**: `INSERT` com `orgId` de outra Organização é **rejeitado**; `UPDATE`/remoção lógica cruzados afetam **0 linhas**.
- **SC-103**: Transação sem contexto de Organização não lê nem escreve nenhuma linha organizacional.
- **SC-104**: Consulta a `pg_roles` prova que o papel da aplicação não tem `BYPASSRLS` nem `SUPERUSER`; o papel não é proprietário das tabelas.
- **SC-105**: Uma conta lê as **próprias** Memberships sem contexto de Organização, e **não** lê as de outras contas.
- **SC-106**: Testes de isolamento rodam contra **PostgreSQL real** e entram em `pnpm test`; nenhum teste de RLS usa mock.
- **SC-107**: Migration aplica e reverte de forma verificável; `/ready` responde 200 com banco no ar e **503** com banco fora; container de produção **inicia de verdade** e conecta ao banco.

## Clarifications

Todas as questões levantadas foram fechadas **pelos artefatos aprovados**, sem decisão nova de Produto:

- **Papéis** → `ADMIN`/`MEMBER`/`GUEST` (NFR-4 canônico). `OQ-1..4` (aberta) é a matriz de Pipe/Card, insumo da Story 1.6 — **não** bloqueia esta Story.
- **Estados** → `ACTIVE`/`SUSPENDED`/`REMOVED` (Épico 8). `REMOVED` é a remoção lógica do AC2; sem `deletedAt` paralelo (fonte de verdade única — AD-14).
- **`Account`** → global, sem RLS, e-mail único global (AD-7/AD-10).
- **Bootstrap da primeira Organização** → nesta Story, seed via papel de migration. O fluxo real de provisionamento (signup → Org → Membership de ADMIN) é **contrato entregue à Story 1.4**, dona de login/identidade. Fronteira declarada, não omissão.
- **Versões (PostgreSQL, Prisma) e estratégia de PostgreSQL real em teste** → fixadas no `context7-check`; Testcontainers, se escolhido, é **dependência nova** e exige aprovação.

## Assumptions

- PostgreSQL compartilhado (não banco por tenant) — AD-6.
- Sem login/sessão nesta Story: o contexto é injetado pelos testes e pelo seed; a **propagação** real é a Story 1.3.
- Sem CASL: a autorização efetiva é a Story 1.6. Aqui há apenas tenancy.
- Prisma permanece **dentro de `apps/api`**; nenhum `packages/` é criado (ver tratamento do CR2-09 no `plan.md`).
