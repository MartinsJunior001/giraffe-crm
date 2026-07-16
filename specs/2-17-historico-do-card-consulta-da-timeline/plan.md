# Plano — Histórico do Card: consulta da timeline (Story 2.17)

## Contexto técnico

- **Stack:** NestJS 11 · Prisma 6 · PostgreSQL 16 · Vitest 4. Read-side puro sobre `CardHistory` (append-only; GRANT SELECT/INSERT já existente desde 2.7). **Sem migration, sem GRANT novo.**
- **Padrão de referência:** `KanbanReadService` (2.9) — leitura paginada por cursor determinístico, `withTenantContext`, `orgId` fora da fronteira.

## Autorização

- `exigirLerCard(db, contexto, cardId)` (pipe-authz, 2.10) — acesso **atual** ao Card; **404** sem acesso (`podeLer` é o piso). Creator/histórico **não** concedem (SC-2105). Guarda grossa `@Requer('ler','Pipe')` → 403.

## Serviço

- `card-history-read.service.ts` — `verHistorico(cardId, cursor, limite): PaginaHistorico`.
  - `exigirLerCard`; ler `CardHistory where cardId` com `orderBy [createdAt asc, id asc]`, cursor `{ id }`, `take = min(limite,100)+1`.
  - **Projeção allowlist:** `{ id, type, summary, actorId, occurredAt: createdAt }`. Nada de `orgId`/`cardId` interno/`MovementEvent`.

## Controller/DTO

- `card-history.controller.ts` — `@Controller('cards/:cardId')`, `GET history`, `@Requer('ler','Pipe')`. Reusa `parseCursor`/`parseLimite` (kanban.dto) e `validarIdRota` (cards.dto).
- Registrar em `pipes.module.ts`.

## Testes (PostgreSQL real)

- `card-history-rls.test.ts`: `CardHistory` read-only — runtime lê; UPDATE/DELETE negados (fase vermelha do GRANT); cross-tenant (0 linhas).
- `card-history-http.test.ts`: CA1 (timeline cronológica projetada, sem `orgId`/payload interno), paginação por cursor determinística, CA2 (correção = novo evento), CA3 (acesso atual vê; revogado → 404; histórico não concede).

## Gates

`pre-implementation-check` · `security-check` · `observability-check` · `commit-check`.
