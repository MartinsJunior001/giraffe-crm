---
description: "Task list — Story 2.17 (Histórico do Card — consulta da timeline)"
---

# Tasks: Histórico do Card — consulta da timeline (Story 2.17)

**Tests**: REQUERIDOS (PostgreSQL real). **US1** = única user story. **Sem migration, sem GRANT novo** (read-side).

## Phase 1: Setup
- [ ] T001 Gate `pre-implementation-check` (read-side puro; reusa `CardHistory` SELECT).

## Phase 2: US1 — Timeline (P1)
- [ ] T002 [US1] `cards/history/card-history-read.service.ts`: `verHistorico(cardId, cursor, limite)` — `exigirLerCard` (404 sem acesso); projeção allowlist (`id/type/summary/actorId/occurredAt`); cursor `[createdAt, id]`; teto 100.
- [ ] T003 [US1] `cards/history/card-history.controller.ts`: `GET /cards/:cardId/history?cursor=&limite=`; `@Requer('ler','Pipe')` (grossa → 403); reusa `parseCursor`/`parseLimite`/`validarIdRota`.
- [ ] T004 [US1] Registrar em `pipes.module.ts`.

## Phase 3: Testes (PostgreSQL real; Org C + randomUUID)
- [ ] T005 [P] [US1] `card-history-rls.test.ts`: `CardHistory` read-only — runtime lê; UPDATE/DELETE negados; cross-tenant (0 linhas).
- [ ] T006 [US1] `card-history-http.test.ts`: CA1 (timeline projetada, sem `orgId`/payload interno), cursor determinístico, CA2 (correção = novo evento), CA3 (acesso atual vê; revogado → 404; histórico não concede; 403 grossa).

## Phase 4: Polish
- [ ] T007 `typecheck` + `lint` + `format` verdes.
- [ ] T008 `test:ci` (serial) verde.
- [ ] T009 Gates de conclusão: `security-check`, `observability-check`.
- [ ] T010 `commit-check` → commits → push → PR → CI → merge → closure (BMAD).

## Dependencies
Setup → US1 (T002-T004) → Testes (T005-T006) → Polish. T002 bloqueia T003/T006.
