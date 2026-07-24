-- Story 5.7 — Idempotência de criação de Tarefa/Solicitação por Automação (D4).
--
-- Espelha `Automation.idempotencyKey` (D-4.2-F): coluna NULLABLE + índice único `(orgId, pipeId,
-- idempotencyKey)`. NULLs são DISTINTOS no Postgres, então criações humanas (sem chave — a `criar` de
-- 5.1/5.2) nunca colidem; a criação por Automação (Story 5.7 — `action-executors.ts`) usa uma chave
-- DETERMINÍSTICA `auto:<execId>:<actionIdx>` ⇒ um retry at-least-once do motor devolve a Tarefa/Solicitação
-- existente (P2002 → idempotente), garantindo "no máximo 1 por Ação", como `Record` (4.6).
--
-- SEM GRANT novo: o `GRANT INSERT ON "Task"/"Solicitacao"` é table-level e já cobre a coluna nova; a
-- `idempotencyKey` é IMUTÁVEL (fora do `GRANT UPDATE` column-scoped — a autoria/definição não é reescrita).
-- RLS/FORCE e policies existentes seguem intocadas: a coluna nova não muda `orgId = current_org_id()`.

ALTER TABLE "Task" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "Solicitacao" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "Task_orgId_pipeId_idempotencyKey_key"
  ON "Task" ("orgId", "pipeId", "idempotencyKey");
CREATE UNIQUE INDEX "Solicitacao_orgId_pipeId_idempotencyKey_key"
  ON "Solicitacao" ("orgId", "pipeId", "idempotencyKey");
