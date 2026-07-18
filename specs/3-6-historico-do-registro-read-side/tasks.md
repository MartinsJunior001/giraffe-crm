# Tasks — Story 3.6 — Histórico do Registro (read-side)

- **T001** — Gate pré-código (context7-check + pre-implementation-check). → `gates/3-6/T001-pre-code-gate.md`
- **T002** — `record-history.dto.ts`: `parseCursor`/`parseLimite` (espelho de `kanban.dto`, sanitizado).
- **T003** — `record-history-read.service.ts`: `verHistorico` (exigirLerDatabase → Record∈Database → findMany
  allowlist + cursor); interfaces `EventoTimelineVisao`/`PaginaHistorico`.
- **T004** — `record-history.controller.ts`: `GET databases/:databaseId/records/:recordId/history`,
  `@Requer('ler','Database')`.
- **T005** — `databases.module.ts`: registrar controller + service.
- **T006** — Testes RLS: `record-history-read-rls.test.ts` (cross-tenant invisível; contagem escopada).
- **T007** — Testes HTTP: `record-history-read-http.test.ts` (AC1–AC7).
- **T008** — Gates de qualidade (typecheck/lint/format) + testes-alvo + regressão 3.4/3.5 + suíte serial.
- **T009** — CLAUDE.md: parágrafo de estado da 3.6 (header + narrativa E3 + subdomínio `records/history`).
- **T010** — Revisão adversarial CRÍTICA (4 camadas) + gates de conclusão. → `gates/3-6/T010-review-e-conclusao.md`
- **T011** — commit-check → commit → PR → CI → merge.
- **T012** — Encerramento BMAD (sprint-status → done; story status → done; Review Findings).
