---
description: "Task list — Story 2.14 (Movimentação e regras de transição)"
---

# Tasks: Movimentação e regras de transição (Story 2.14)

**Input**: Design documents from `specs/2-14-movimentacao-e-regras-de-transicao/`

**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅ (2 contratos), quickstart.md ✅

**Tests**: REQUERIDOS — a spec/story md (T5) e o quickstart exigem teste de integração contra **PostgreSQL real**,
com prova da **fase vermelha** do GRANT. Testes fazem parte do escopo obrigatório desta Story.

**Organization**: uma única user story (US1 — "mover Card para outra Fase"), cujos 4 critérios de aceite (CA1–CA4)
são testáveis independentemente. Migration e núcleo puro são pré-requisitos bloqueantes (Foundational).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos distintos, sem dependência pendente)
- **[US1]**: única user story desta Story
- Caminhos de arquivo são **absolutos ao repositório** (raiz `apps/api/`)

## Path Conventions

Web service — Story inteiramente em `apps/api`. Novo subdomínio `apps/api/src/pipes/cards/movement/`; testes em
`apps/api/test/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: preparar o terreno; nenhuma dependência nova.

- [ ] T001 Executar o **gate pré-código** (`skills/pre-implementation-check.md`) e o **`context7-check`** para Prisma 6.19.3 (`updateMany`→`{count}`, `$transaction` interativa no client raiz, `P2002`/`P2028`, `Prisma.TransactionClient`) e NestJS 11 (exceptions/DTO); registrar o relatório e a fonte. Só prosseguir se `APROVADO`/`APROVADO COM RESSALVAS`.
- [ ] T002 Criar o diretório do subdomínio `apps/api/src/pipes/cards/movement/` (espelha `lifecycle/`, `phase-entry/`, `access/`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: infraestrutura de banco e o núcleo puro — bloqueiam TODAS as tasks de US1.

**⚠️ Concluir Phase 2 antes de iniciar a Phase 3.**

- [ ] T003 Criar a migration `apps/api/prisma/migrations/<timestamp>_card_movement/migration.sql` com **`GRANT UPDATE ("phaseId") ON "Card" TO giraffe_app`** — **additivo** ao column-scoped da 2.11. **NÃO** usar `GRANT UPDATE ON "Card"` (blanket). Sem enum (`CardHistory.type` é `String`), sem policy nova (`card_update` existe desde 2.7). Comentar o *porquê* (invariante `valores`/`orgId` sem UPDATE).
- [ ] T004 Aplicar e verificar a migration: `pnpm --filter @giraffe/api db:migrate` e `db:status`; confirmar que o schema Prisma **não** mudou (só GRANT em SQL). NÃO commitar ainda.
- [ ] T005 [P] Implementar o núcleo **puro** `apps/api/src/pipes/cards/movement/transition-preflight.ts` conforme `contracts/transition-preflight.contract.md`: tipos `ContextoDeTransicao`, `MotivoBloqueio`, `ResultadoPreflight`, `ValidadorDeTransicao`; validadores built-in (`validarCicloAberto`, `validarFaseDestinoAtiva`, `validarMesmoPipe`, `validarDestinoDiferente`, `validarConfirmacao`); `VALIDADORES_PADRAO`; `executarPreflight` (ordem + curto-circuito). Sem I/O, sem Prisma/Nest.

---

## Phase 3: User Story 1 — Mover Card para outra Fase (Prioridade: P1)

**Goal**: um usuário autorizado move um Card para outra Fase ativa do mesmo Pipe, atômico e auditado; bloqueio ⇒
nada muda.

**Independent Test**: rodar o Cenário 1 do `quickstart.md` (mover → 200, `phaseId` novo, `MOVED`, nova
`CardPhaseEntry`) e o Cenário 2 (bloqueio ⇒ nada muda).

### Implementação

- [ ] T006 [US1] Criar o DTO `apps/api/src/pipes/cards/movement/card-movement.dto.ts`: `{ destinoPhaseId: string (uuid), confirmado: boolean, idempotencyKey?: string }` com validação (class-validator, padrão dos DTOs existentes). Nenhum campo `orgId`/`phaseId` de origem vindo do cliente.
- [ ] T007 [US1] Autorização em `apps/api/src/pipes/pipe-authz.ts` — extrair **`exigirMoverCard`** compondo `exigirOperarCard` (404 sem acesso / 403 só-leitura) + capacidade `podeMover` (para acesso por `CardGrant`; Admin da Org/Pipe/Membro no escopo já têm). Guarda fina no serviço; **não** tocar guard/`ability.ts` (C3 congelado, DBT-AUTHZ-01).
- [ ] T008 [US1] Implementar `apps/api/src/pipes/cards/movement/card-movement.service.ts` — `moverCard(principal, cardId, dados)`: (1) `exigirMoverCard`; (2) sob `withTenantContext`, ler Card (`id`, `lifecycleState`, `phaseId`) + Fase origem + Fase destino (`id`, `pipeId`, `archivedAt`); (3) montar `ContextoDeTransicao` e rodar `executarPreflight`; bloqueio ⇒ **409** com `motivo` (sem persistir); origem==destino ⇒ **200** no-op (D4).
- [ ] T009 [US1] No mesmo serviço, o **efeito atômico** (sem bloqueio): **transação interativa no client raiz** com `definirContextoOrg` — (i) `updateMany` de `Card.phaseId` com **guarda otimista** (`where id AND phaseId=<origem lida>`; `count===0` → reconsulta → idempotente 200 ou **409**); (ii) `registrarEntradaNaFase(tx, {orgId}, { cardId, phaseId: destino, origin: 'MOVE' })`; (iii) INSERT `CardHistory { type: 'MOVED', actorId, cardId, ... }`. Tratar `P2002`/`P2028` → **409**, **nunca 500**. Auditoria manual (FR-214) na mesma tx.
- [ ] T010 [US1] Criar o controller `apps/api/src/pipes/cards/movement/card-movement.controller.ts` — `POST /cards/:cardId/move` conforme `contracts/move-card.http.md` (200 sucesso/no-op/idempotente; 409 bloqueio/conflito; 403 só-leitura; 404 sem acesso). Nunca aceitar `orgId` do cliente.
- [ ] T011 [US1] Registrar service + controller em `apps/api/src/pipes/pipes.module.ts`.

---

## Phase 4: Testes (PostgreSQL real — fase vermelha provada)

**⚠️ Regra de ouro:** escrever na **Org C** com contas descartáveis (`randomUUID`). **Nunca** reusar
Ana/Bruno/Carla/Eva em `membership.create` persistente ([[test-iso-01-causa-raiz]]).

- [ ] T012 [P] [US1] `apps/api/test/transition-preflight.test.ts` (unit puro): cada validador built-in; composição/ordem; curto-circuito no 1º bloqueio; extensão por `[...VALIDADORES_PADRAO, fake]` (CA4). Sem tocar banco.
- [ ] T013 [P] [US1] `apps/api/test/card-move-rls.test.ts` (segurança): **fase vermelha** — sem o GRANT, UPDATE de `phaseId` → `permission denied`; **depois** — UPDATE funciona no contexto e é **negado cross-tenant** (WITH CHECK); `valores`/`orgId` seguem sem UPDATE; sem DELETE.
- [ ] T014 [US1] `apps/api/test/card-move-http.test.ts` (integração HTTP, AppModule em porta efêmera): CA1 (feliz — 200, `MOVED`, nova `CardPhaseEntry`, `phaseId` novo); CA2 (bloqueio ⇒ nada muda); CA3 (Observador/Viewer 403; sem acesso 404; Fase arquivada/outro Pipe 409; ciclo não-aberto 409); concorrência (`Promise.all` ⇒ 1 vence, sem 500); idempotência (`idempotencyKey`); no-op mesma Fase (D4).

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T015 Rodar `pnpm --filter @giraffe/api typecheck` (cobre `src` + `test`) e `pnpm lint` — verdes.
- [ ] T016 Rodar a suíte cheia como no CI: `pnpm --filter @giraffe/api test:ci` (serial) — verde.
- [ ] T017 Gates finais de conclusão de Story (skills): `security-check`, `observability-check`, `migration-check` (há migration nova) e, se aplicável, `lgpd-check`/`performance-check`. Registrar evidência de execução real.
- [ ] T018 `commit-check` → `commit` (mensagem em pt, atômica). **Não** commitar config local (`.vscode/`, `.mcp.json.example`, `.python-version`) nem tocar `sprint-status.yaml`/status da Story fora do workflow BMAD. **Sem push/merge sem autorização explícita.**

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** → **Phase 3 (US1)** → **Phase 4 (Testes)** → **Phase 5 (Polish)**.
- **T001 (gate) bloqueia tudo** — nenhum código antes do gate aprovado.
- **T003/T004 (migration+GRANT)** bloqueiam T009, T013, T014 (dependem do GRANT de `phaseId`).
- **T005 (núcleo puro)** bloqueia T008 e T012.
- **T007 (authz)** bloqueia T008.
- **T008 → T009 → T010 → T011** em sequência (mesmo serviço/módulo).
- **T012 e T013** são independentes entre si e podem rodar em paralelo assim que suas dependências (T005; T003) estejam prontas. **T014** depende de T006–T011 + T003.

## Parallel Opportunities

- **T005** (núcleo puro) em paralelo com **T003/T004** (migration) — arquivos disjuntos.
- **T012** (unit puro) em paralelo com **T013** (RLS) após suas dependências.

## Implementation Strategy (MVP)

- **MVP = US1 completa** (Phases 1–4): a movimentação atômica com preflight, autz e testes reais é a entrega mínima
  íntegra — não há sub-fatia menor que preserve os invariantes (atomicidade + fase vermelha do GRANT).
- Entrega incremental interna: Foundational (GRANT + núcleo puro) → serviço/rota → testes; cada camada verificável
  isoladamente (unit puro e RLS antes do HTTP).

## Format Validation

Todas as tasks seguem `- [ ] TID [P?] [US1?] descrição com caminho`. Setup/Foundational/Polish **sem** label de
story; tasks de US1 **com** `[US1]`. 18 tasks, IDs sequenciais T001–T018.
