---
description: "Task list — Story 2.16 (Evento canônico de movimentação e contrato opt-in)"
---

# Tasks: Evento canônico de movimentação e contrato opt-in (Story 2.16)

**Tests**: REQUERIDOS (PostgreSQL real; fase vermelha do GRANT). **US1** = única user story.

## Phase 1: Setup
- [x] T001 Gates `context7-check` (node:crypto uuidv5 / Prisma transação interativa) + `pre-implementation-check`.

## Phase 2: Foundational (bloqueia US1)
- [x] T002 Migration `20260715120000_movement_event`: tabela `MovementEvent` (colunas D0) + `@@unique([orgId, eventId])` + índices; FKs org/pipe/card/phase×2; RLS ENABLE+FORCE + policies + WITH CHECK; GRANT SELECT/INSERT. Reversível.
- [x] T003 `schema.prisma` (model `MovementEvent` + back-relations Organization/Pipe/Card/Phase×2) e `prisma generate`; `db:migrate`.
- [x] T004 `MODELOS_AUDITADOS += 'MovementEvent'` em `tenant-context.ts`.
- [x] T005 [P] Núcleo puro `movement-event.core.ts`: `uuidV5`, `derivarEventId`, `montarEnvelope`.

## Phase 3: US1 — Evento canônico (P1)
- [x] T006 [US1] `card-movement.service.ts`: `correlationId` por operação; emitir `MovementEvent` na MESMA tx após `MOVED`; auditoria manual.

## Phase 4: Testes (PostgreSQL real; Org C + randomUUID)
- [x] T007 [P] [US1] `movement-event-core.test.ts` (unit puro).
- [x] T008 [P] [US1] `movement-event-rls.test.ts` (GRANT/append-only/UNIQUE/cross-tenant).
- [x] T009 [US1] `movement-event-http.test.ts` (CA1-CA4 + atomicidade + concorrência).

## Phase 5: Polish
- [x] T010 `typecheck` + `lint` + `format` verdes.
- [x] T011 `test:ci` (serial) verde — 627/627.
- [x] T012 Gates de conclusão: `security-check`, `observability-check`, `migration-check`.
- [ ] T013 `commit-check` → commits → push → PR → CI → merge → closure (BMAD).

## Dependencies
Setup → Foundational (T002-T005) → US1 (T006) → Testes (T007-T009) → Polish. T002/T003 bloqueiam T006/T008. T005 bloqueia T006/T007.
