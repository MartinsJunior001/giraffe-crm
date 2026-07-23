# Tasks — Story 4.7

1. [x] `chain-guard.core.ts` (puro): limites/números, assinatura sha256, `avaliarBarreira` (fail-closed).
2. [x] `engine-types.ts`: `HALTED_BY_LIMIT` + ErrorCodes de barreira.
3. [x] `event-envelope.ts`/`domain-event-emission.ts`: `chainDepth` no contrato do envelope.
4. [x] `action-executors.ts`: `ContextoCadeia`; emissão de `RECORD_CREATED`/`CARD_RESPONSIBLE_CHANGED`; `emittedEventId`.
5. [x] `automation-engine.service.ts`: barreira no enfileiramento (`enfileirarUmaExecucao`, `registrarVisita`,
   `inicioDaCadeia`); cadeia propagada em `executarPipeline`; `drenarOrg` como loop de cadeia.
6. [x] `schema.prisma`: `AutomationChainVisit`, `chainDepth` (Execution+DomainEvent), enum, índices, relações.
7. [x] Migration `20260729120000_automation_chaining` + `rollback/*.down.sql`.
8. [x] `tenant-context.ts`: `AutomationChainVisit` em `MODELOS_AUDITADOS`.
9. [x] Testes: `automation-chaining-core.test.ts`, `automation-chaining-e2e.test.ts`, `automation-chaining-rls.test.ts`.
10. [x] Decision doc (consolidação do gate) + spec kit + gates.
11. [ ] Gates de execução: prisma generate · migrate (drill down/up) · lint · typecheck · test (API) · build.
