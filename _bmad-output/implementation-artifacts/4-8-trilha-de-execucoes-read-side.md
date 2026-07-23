---
story_key: 4-8-trilha-de-execucoes
epic: 4
status: ready-for-qa
release: E4 (Automação)
risco: ALTO
baseline_commit: 20f05ae
gate_arquitetura: Superfície de **LEITURA** (aba "Execuções") sobre `AutomationExecution` (4.6) + `AutomationActionResult` + metadados de `DomainEvent`/cadeia (4.7) já materializados — **sem migration e sem GRANT novo** (o runtime já tem `SELECT`). Projeção **allowlist** (AD-30/NFR-1/8/16 — nunca payload/segredo/token/URL/stack/prompt/`valores`/PII), `orgId` fora da fronteira, cursor determinístico `[createdAt,id]` (teto 100). Autorização = **operar o Pipe** (`pipe-authz`): Admin da Org/Admin do Pipe/Membro; Somente-leitura e Convidado → 403; sem acesso → 404 não-enumerante. Membro `restritoAoProprio` vê só as Execuções dos recursos que acessa; referências inacessíveis (`targetResourceId`) mascaradas (§1447). Filtros período/estado/Evento (fail-closed → 400) + paginação. 4.6/4.7 intocados; guard C3 congelado. FORA: resultado por-Condição (não persistido — `DEB-4-8-CONDICOES-POR-CONDICAO`); árvore da cadeia (`DEB-4-8-CHAIN-TREE`); observabilidade técnica (Pino/Sentry).
decisions_doc: _bmad-output/implementation-artifacts/decisions/execution-trail-4-8.md
spec_kit: specs/4-8-trilha-de-execucoes/
---

# Story 4.8 — Trilha de Execuções (read-side)

**As a** Administrador,
**I want** uma aba "Execuções" completa e sanitizada,
**So that** eu entenda e diagnostique avaliações, execuções, cadeias e interrupções sem vazar dados sensíveis.

Oitava Story do **Épico 4**, risco **ALTO** (toca autz/isolamento/sanitização). Abre a superfície de **LEITURA**
sobre as Execuções que o motor (4.6) e a prevenção de ciclos (4.7) materializaram — **read-side puro, sem
migration e sem GRANT novo**. Espelha o rigor do Histórico do Registro (3.6) e do Kanban read (2.9).

## Invariantes do dono (não erodir)

- **Read-side puro:** sem migration, sem GRANT novo, sem mutação/reexecução/agendador/efeito colateral. O runtime
  já lê `AutomationExecution`/`AutomationActionResult`/`DomainEvent`/`AutomationChainVisit` via `SELECT`.
- **Sanitização (AD-30):** projeção por allowlist em `execution-view.ts`. Nunca payload/senha/token/segredo/chave
  de API/URL assinada/chave de storage/prompt/resposta de IA/stack/`valores`/PII. `lastErrorCode`/`errorCode` =
  enums estruturais (`^[A-Z_]+$`) + `motivoLegivel` derivado (mapa estático), nunca texto livre.
- **Autorização (deny-by-default):** operar o Pipe (`pipe-authz`, DBT-AUTHZ-01, sem tocar `ability.ts`). Membro
  restrito vê só recursos que acessa; referências inacessíveis restritas sem revelar existência/conteúdo;
  Convidado não acessa; inexistente/inacessível → 404 não-enumerante.
- **Isolamento:** toda query por `withTenantContext`; `orgId` fora da fronteira e nunca aceito do cliente.
- **4.6/4.7 preservados:** nenhuma linha de `engine/`/`chain-guard.core.ts` alterada.

## Superfície entregue

- `GET /pipes/:pipeId/automation-executions` — lista (filtros `estado`/`eventType`/`de`/`ate` + `cursor`/`limite`).
- `GET /pipes/:pipeId/automation-executions/:executionId` — detalhe (resumo + Ações na ordem + cadeia).

Segmento estático `automation-executions` (evita colisão com `automations/:automationId`).

## Arquivos

- `apps/api/src/pipes/automations/executions/execution-view.ts` (núcleo puro)
- `apps/api/src/pipes/automations/executions/executions.dto.ts`
- `apps/api/src/pipes/automations/executions/executions-read.service.ts`
- `apps/api/src/pipes/automations/executions/executions.controller.ts`
- `apps/api/src/pipes/pipes.module.ts` (wiring)
- Testes: `apps/api/test/execution-view.core.test.ts`, `apps/api/test/execution-trail-http.test.ts`

## Débitos (AD-11, todos com consumidor futuro)

`DEB-4-8-CONDICOES-POR-CONDICAO` · `DEB-4-8-CHAIN-TREE` · `DEB-4-8-TARGET-CROSS-DOMAIN` · `DEB-4-8-INDEX-LISTAGEM`.
