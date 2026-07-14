# Tasks — D-05: agendador da coleta de lixo antiabuso

> Fonte: `spec.md` + `plan.md`. Risco NORMAL. Sem migration. Preserva `limparExpirados`.

## Phase 1: Fase vermelha (concorrência sem lock)
- [ ] **T001** Teste em `apps/api/test/login-failure.test.ts` (bloco D-05): provar que, com um advisory
  lock retido por outra sessão, a coleta atual **não** teria como pular (fase vermelha do lock).
  Concretamente: escrever o teste do lock e confirmar que falha antes de existir `limparExpiradosComLock`.

## Phase 2: Lock
- [ ] **T002** `LoginFailureService.limparExpiradosComLock()`: transação única com
  `pg_try_advisory_xact_lock(CHAVE_LOCK_CLEANUP)`; se não obtém → loga `auth.antiabuse.cleanup.skipped`
  e retorna `{ pulado: true }`; se obtém → roda os DELETEs e retorna contagens. `limparExpirados`
  **intacta**. [SC-D05-3]
- [ ] **T003** `scripts/db-cleanup.mjs`: adquirir o mesmo `pg_try_advisory_xact_lock` (mesma chave) antes
  dos DELETEs; se não obtém → "pulado", sai 0. [SC-D05-3]

## Phase 3: Verde + falha não silenciosa
- [ ] **T004** Verde: lock retido por outra sessão → coleta pula (não apaga); liberado → apaga. [SC-D05-3]
- [ ] **T005** Falha não silenciosa: erro de banco propaga (não engolido); comando sai != 0. [SC-D05-4]
- [ ] **T006** Preservados: os testes de expiração (SC-D05-1) e idempotência (SC-D05-2) continuam verdes,
  sem edição.

## Phase 4: Runbook + gates
- [ ] **T007** `docs/04-operacao/agendamento-coleta-antiabuso.md`: intervalo sugerido, dono operacional,
  comando, e passo de ativação no Coolify marcado **PENDENTE** (código pronto ≠ ativado). [SC-D05-5]
- [ ] **T008** security-check · observability-check · lgpd-check · suíte verde · commit-check → commit ·
  PR próprio contra `main` (sem merge).
