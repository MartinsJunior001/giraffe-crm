# Plan — Story 4.8: Trilha de Execuções

> Detalha o `plan` do Spec Kit. Decisões duráveis: `_bmad-output/implementation-artifacts/decisions/execution-trail-4-8.md`.

## Arquivos (novos, `apps/api/src/pipes/automations/executions/`)

| Arquivo | Responsabilidade |
|---|---|
| `execution-view.ts` | Núcleo PURO: projeção allowlist (`projetarExecucao`/`projetarResultadoAcao`/`projetarCadeia`), `motivoLegivel` (mapa estático), `avaliacaoCondicoes` (agregado do estado), `duracaoMs`, mascaramento. Sem banco. |
| `executions.dto.ts` | Validação manual fail-closed dos filtros (`estado`/`eventType`/`de`/`ate`) + `cursor`/`limite`. Sem `class-validator`. |
| `executions-read.service.ts` | Resolve escopo (`GERENCIAR`/`MEMBRO_TODAS`/`MEMBRO_RESTRITO`) via `pipe-authz`; monta `where`; pagina por cursor `[createdAt,id]`; batch-load (DomainEvent/Automation/ActionResults); mapeia pela projeção pura. Toda query por `withTenantContext`. |
| `executions.controller.ts` | `GET pipes/:pipeId/automation-executions` (lista) e `.../:executionId` (detalhe). `@Requer('ler','Automacao')`. |

Alterados: `pipes.module.ts` (registra controller + service). **Nada mais.** Sem migration, sem GRANT, sem tocar
`engine/`, `chain-guard.core.ts`, `ability.ts`, `pipe-authz.ts` (só CONSUMIDO).

## Fluxo da listagem

1. `resolverEscopo` → 404 (sem acesso), 403 (Viewer/Convidado), ou escopo.
2. Conjuntos de `eventId` a interseccionar: escopo restrito + filtro `eventType`. Vazio ⇒ página vazia.
3. `where = { pipeId, state?, createdAt range?, eventId in? }`.
4. Cursor `[createdAt asc, id asc]`, `take = min(limite,100)+1`.
5. Batch-load Eventos (por `eventId`) e nomes de Automação (por `id`).
6. Projeta cada linha (allowlist).

## Fluxo do detalhe

1. `resolverEscopo`.
2. `findFirst({ id, pipeId })` → 404 se ausente. Restrito: 404 se `eventId` não acessível.
3. Batch-load Evento + Automação + `ActionResults` (ordem por `actionIndex`).
4. Predicado de alvo (GERENCIAR = tudo; Membro = Card in-Pipe acessível — batch `card.findMany`).
5. Projeta resumo + `acoes` (com mascaramento) + `cadeia`.

## Trade-offs (registrados no decision doc)

- Cursor sem `total` (padrão 3.6) — navegação, não relatório.
- Prisma nativo (colunas escalares), sem `$queryRaw` (contraste com 3.5/JSON).
- Sem índice novo (read-side sem migration) — `DEB-4-8-INDEX-LISTAGEM`.
- Sem resultado por-Condição (não persistido) — `DEB-4-8-CONDICOES-POR-CONDICAO`.
- Sem árvore de cadeia — `DEB-4-8-CHAIN-TREE`.
- Mascaramento cross-domínio fail-closed — `DEB-4-8-TARGET-CROSS-DOMAIN`.

## Risco: ALTO (autz/isolamento/sanitização) — gates completos de integração PG real.
