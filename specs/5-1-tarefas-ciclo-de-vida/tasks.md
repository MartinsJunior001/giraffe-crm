# Tasks — Story 5.1 (dependency-ordered) + status

- [x] T1 — Schema: `Task`/`TaskHistory`/`TaskOverdueOccurrence` + enums + `@@unique([orgId,id])` em Card.
- [x] T2 — Migration `20260730120000_tasks` (RLS+FORCE+WITH CHECK, GRANT column-scoped/append-only, FK compostas)
      + rollback `.down.sql`. Aplicada e drill de rollback verde.
- [x] T3 — Núcleo puro `task-lifecycle.transitions.ts` (2 eixos: operacional/arquivamento).
- [x] T4 — Núcleo puro `task-overdue.core.ts` (`derivarAtrasada`/`elegivelParaOcorrencia`).
- [x] T5 — DTO `tasks.dto.ts` (parse manual, sem class-validator; `orgId` nunca do cliente).
- [x] T6 — `TasksService` (criar/editar/Responsável/vínculo/concluir/reabrir/arquivar/restaurar) — tx interativa
      + guarda otimista + eventos `TaskHistory` + auditoria manual; autz `exigirOperarPipe`.
- [x] T7 — `TasksReadService` (listar/obter + `atrasada` derivado + `responsavelValido`) — autz `resolverPoderNoPipe`.
- [x] T8 — `TaskOverdueService.escanearOrg` (scan idempotente `INSERT…SELECT…ON CONFLICT`).
- [x] T9 — `TasksController` + `TasksModule` + registro em `app.module.ts`.
- [x] T10 — `MODELOS_AUDITADOS` += Task/TaskHistory/TaskOverdueOccurrence.
- [x] T11 — E8 wiring: `membership-contract.ts` (+ `taskResponsavelDe`/`removerTaskResponsavelDe`) e consumo em
      `membership-state.service.ts` (8.5) e `membership-removal.service.ts` (8.6).
- [x] T12 — Testes unidade: `task-lifecycle-transitions.test.ts`, `task-overdue-core.test.ts`,
      `membership-contract.test.ts` (Task).
- [x] T13 — Teste RLS/GRANT `tasks-rls.test.ts` (isolamento, WITH CHECK, FK composta, column-scoped, sem DELETE,
      idempotência da ocorrência, imutabilidade).
- [x] T14 — Teste HTTP `tasks-http.test.ts` (criar/editar/ciclo/Responsável/vínculo/atrasada/autz/cross-tenant).
- [x] T15 — Teste do mecanismo temporal `tasks-overdue-scan.test.ts` (idempotência por versão; sem duplicar;
      concluir/arquivar impede; futuro/ausente não emite).
- [x] T16 — Regressão E8: cenário de reatribuição de Tarefa em `membership-removal-http.test.ts`.
- [x] T17 — Gates: prettier, eslint, typecheck (src+test), build, migration+rollback drill — verdes.

## Mapa AC (§1528–1532) → teste

| AC | Descrição | Evidência |
|----|-----------|-----------|
| AC1 | nasce ABERTA/ATIVA, 1 Pipe/Org, 0..1 Card, sem fundir/ampliar | `tasks-http` (criar) |
| AC2 | atrasada derivada; concluída/arquivada não; alterar prazo recalcula | `task-overdue-core` + `tasks-http` |
| AC3 | Evento ≤1 por (taskId,dueVersion); sem duplicar; concluir antes impede | `tasks-overdue-scan` + `tasks-rls` |
| AC4 | Responsável só Membership ativa; suspensão/remoção reatribui; autoria preservada | `tasks-http` + `membership-contract` + `membership-removal-http` |
| AC5 | arquivar bloqueia escrita/mantém leitura; restaurar preserva; anexos 3.7; append-only | `task-lifecycle-transitions` + `tasks-http` + `tasks-rls` |
| Isolamento | cross-tenant negado pelo banco (fase vermelha) | `tasks-rls` + `tasks-http` (Carla 404) |
