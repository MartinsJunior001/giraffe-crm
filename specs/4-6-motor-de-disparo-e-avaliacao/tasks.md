# Tasks — Story 4.6

Dependência-ordenada. `[P]` = paralelizável. Cada task cita seu critério/gate.

## Substrato (migration + schema)
- T1. `schema.prisma`: modelos `AutomationExecution` + `AutomationActionResult` (+ enums de estado). FK composta,
  uniques de dedup, GRANT-alvo documentado. → migration-check.
- T2. Migration `20260728120000_automation_engine/migration.sql`: CREATE TABLE ×2, índices, FKs, RLS
  ENABLE+FORCE, policies select/insert/update/delete, GRANT (Execução UPDATE column-scoped; Result SELECT/INSERT).
- T3. `20260728120000_automation_engine/down.sql`: DROP TABLE ×2 (drill).
- T4. `tenant-context.ts`: `MODELOS_AUDITADOS += 'AutomationExecution', 'AutomationActionResult'`.

## Núcleos puros [P]
- T5. `engine/engine-types.ts` — tipos do ledger, estados honestos, `ErrorCode` sanitizado.
- T6. `engine/engine-dedup.core.ts` — chaves + decisão processar/pular/retomar. + unit.
- T7. `engine/retry-policy.core.ts` — backoff/esgotamento/classificação de erro + constantes. + unit.
- T8. `engine/execution-plan.core.ts` — próxima Ação + estado final (ordem/efeitos parciais). + unit.
- T9. `engine/recovery.core.ts` — lease vencida vs. viva. + unit.

## I/O sob RLS
- T10. `engine/snapshot-builder.ts` — monta `SnapshotAvaliacao` + `ContextoEvento` sob RLS; **M-1** (filtro
  cross-Pipe/Database). Consome `derivarSaude`/`calcularMarcos`/`CardRecordLink`.
- T11. `engine/executors/*.ts` — executores por Ação reusando núcleo puro + tx `definirContextoOrg`. Confirmação
  humana ⇒ `BLOCKED_CONFIRMATION` (L-1).
- T12. `engine/automation-engine.service.ts` — claim `FOR UPDATE SKIP LOCKED`, enfileirar (dedup), processar,
  backoff/recuperação. Dispatcher opt-in gated por env.
- T13. `engine/engine.module.ts` + fiação em `AutomationsModule`; `env.ts` (+2 vars, default off).

## Testes de integração real (PostgreSQL)
- T14. `automation-engine-fluxo.test.ts` — CA1 fim-a-fim (evento→snapshot→condição→Ação executada de verdade).
- T15. `automation-engine-dedup.test.ts` — CA2 (reprocessar não duplica Execução nem Ação; crash/retry).
- T16. `automation-engine-partial.test.ts` — CA3 (efeitos parciais) + CA8 (fail-closed).
- T17. `automation-engine-recovery.test.ts` — CA4 (lease vencida retomada sem efeito duplo; esgotamento).
- T18. `automation-engine-containment.test.ts` — **CA5 (M-1)** + **CA6 (não-ampliação)** + **CA7 (SC-2101/2102)**.
- T19. `automation-engine-rls.test.ts` — **CA9** isolamento + fase vermelha do GRANT (UPDATE imutável/DELETE → deny).

## Gates finais
- T20. security-check, observability-check (auditoria sanitizada, sem `valores`/PII no ledger/log),
  migration-check (drill down/up), performance-check (índice de fila, sem N+1). commit-check → PR.
