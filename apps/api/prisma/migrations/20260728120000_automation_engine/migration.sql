-- Story 4.6 — Motor de disparo e avaliação: ledger de Execução (AutomationExecution) + resultado por Ação
-- (AutomationActionResult). Duas tabelas NOVAS, com consumidor concreto NESTA Story (o motor que consome o
-- outbox `DomainEvent` de 4.3 e executa as Ações de 4.5). Encadeia DEPOIS de `..._domain_events` (4.3).
--
-- Papéis das tabelas:
--  · AutomationExecution — a Execução LÓGICA (≤1 por evento×Automação×versão). É o CURSOR de processamento (o
--    outbox é append-only e não pode ser marcado como "processado"; a existência da linha responde "já
--    processei este evento para esta Automação nesta versão") E a trilha que a 4.8 lerá. Ledger MUTÁVEL, mas com
--    GRANT de UPDATE COLUMN-SCOPED só das colunas de PROGRESSO — a identidade lógica (evento/Automação/versão) é
--    imutável por GRANT.
--  · AutomationActionResult — resultado de UMA Ação, APPEND-ONLY (GRANT só SELECT/INSERT, como CardHistory/
--    FormVersion). A dedup por (Execução, índice) garante "a mesma Ação não roda 2×" (§1403); um retry só INSERE
--    resultados de Ações ainda sem linha.
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT E no
-- UPDATE (sem o WITH CHECK, um INSERT com orgId alheio ficaria invisível e um UPDATE moveria a linha de Org). FK
-- COMPOSTA tenant-safe (F-A1): (orgId, automationId)→Automation(orgId, id) e (orgId, executionId)→
-- AutomationExecution(orgId, id) — uma FK simples deixaria passar id alheio (a checagem de FK roda com BYPASS de
-- row security). Sem backfill (tabelas vazias). Sem alteração de tabela existente.
--
-- REVERSÍVEL (drill do gate migration-check): a reversão é `DROP TABLE "AutomationActionResult"; DROP TABLE
-- "AutomationExecution"; DROP TYPE "AutomationActionResultState"; DROP TYPE "AutomationExecutionState";`
-- (na ordem — o filho e seus tipos primeiro). Nenhum dado pré-existente é tocado, então o rollback restaura o
-- estado anterior exato.

-- CreateEnum
CREATE TYPE "AutomationExecutionState" AS ENUM (
  'PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'SKIPPED_CONDITIONS', 'BLOCKED_CONFIRMATION'
);

-- CreateEnum
CREATE TYPE "AutomationActionResultState" AS ENUM (
  'SUCCEEDED', 'FAILED', 'DENIED', 'BLOCKED_CONFIRMATION', 'BLOCKED_PRIOR_FAILURE'
);

-- CreateTable AutomationExecution (ledger; UPDATE column-scoped).
CREATE TABLE "AutomationExecution" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    "automationVersionId" INTEGER NOT NULL,
    "configSnapshotRevision" TEXT NOT NULL,
    "pipeId" UUID NOT NULL,
    "state" "AutomationExecutionState" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3),
    "leaseOwner" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "initiatorType" TEXT NOT NULL,
    "initiatorAccountId" UUID,
    "initiatorAutomationId" UUID,
    "correlationId" UUID NOT NULL,
    "executionChainId" UUID,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable AutomationActionResult (append-only).
CREATE TABLE "AutomationActionResult" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "actionIndex" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "state" "AutomationActionResultState" NOT NULL,
    "errorCode" TEXT,
    "targetResourceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationActionResult_pkey" PRIMARY KEY ("id")
);

-- Dedup LÓGICA da Execução (§1402): ≤1 por (evento, Automação, versão). Reprocessar não cria 2ª Execução.
CREATE UNIQUE INDEX "AutomationExecution_orgId_eventId_automationId_automationVer_key"
  ON "AutomationExecution"("orgId", "eventId", "automationId", "automationVersionId");
-- Alvo da FK COMPOSTA tenant-safe do filho.
CREATE UNIQUE INDEX "AutomationExecution_orgId_id_key" ON "AutomationExecution"("orgId", "id");
-- Fila de reivindicação do drain (PENDING/lease-vencida, por prazo).
CREATE INDEX "AutomationExecution_orgId_state_nextAttemptAt_idx"
  ON "AutomationExecution"("orgId", "state", "nextAttemptAt");

-- Dedup de AÇÃO (§1403): ≤1 resultado por (Execução, posição). "A mesma Ação não roda 2×".
CREATE UNIQUE INDEX "AutomationActionResult_orgId_executionId_actionIndex_key"
  ON "AutomationActionResult"("orgId", "executionId", "actionIndex");
CREATE INDEX "AutomationActionResult_orgId_executionId_idx"
  ON "AutomationActionResult"("orgId", "executionId");

-- AddForeignKey
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,automationId)→Automation(orgId,id). RESTRICT: o runtime não tem DELETE em
-- Automation; apagar uma Automação com Execução é erro explícito do dono, nunca cascata que apagaria a trilha.
ALTER TABLE "AutomationExecution" ADD CONSTRAINT "AutomationExecution_orgId_automationId_fkey"
  FOREIGN KEY ("orgId", "automationId") REFERENCES "Automation"("orgId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AutomationActionResult" ADD CONSTRAINT "AutomationActionResult_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,executionId)→AutomationExecution(orgId,id). CASCADE: o resultado é fato
-- DERIVADO da Execução (a Execução não é apagável pelo runtime; a cascata só vale para o expurgo do dono).
ALTER TABLE "AutomationActionResult" ADD CONSTRAINT "AutomationActionResult_orgId_executionId_fkey"
  FOREIGN KEY ("orgId", "executionId") REFERENCES "AutomationExecution"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Card/Record/DomainEvent. ENABLE liga a RLS; FORCE a estende ao
-- PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_execution_select ON "AutomationExecution"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY automation_execution_insert ON "AutomationExecution"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- WITH CHECK no UPDATE impede MOVER a Execução para outra Org (defesa em profundidade sobre o GRANT column-scoped).
CREATE POLICY automation_execution_update ON "AutomationExecution"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
-- Policy DELETE por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (ver abaixo) — a Execução não é apagável.
CREATE POLICY automation_execution_delete ON "AutomationExecution"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "AutomationActionResult" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationActionResult" FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_action_result_select ON "AutomationActionResult"
  FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY automation_action_result_insert ON "AutomationActionResult"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe esses privilégios (append-only imutável).
CREATE POLICY automation_action_result_update ON "AutomationActionResult"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
CREATE POLICY automation_action_result_delete ON "AutomationActionResult"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
--
-- AutomationExecution: SELECT + INSERT + UPDATE **COLUMN-SCOPED** — só as colunas de PROGRESSO. A identidade
-- lógica (`eventId`/`automationId`/`automationVersionId`/`configSnapshotRevision`/`orgId`/`pipeId`/`initiator*`/
-- `correlationId`) NÃO recebe UPDATE: uma Execução não migra de evento/Automação/versão (uma rota que tentasse
-- bateria em `permission denied` — provado no `automation-engine-rls`). SEM DELETE (a trilha não é apagável).
GRANT SELECT, INSERT ON "AutomationExecution" TO giraffe_app;
GRANT UPDATE ("state", "attempt", "nextAttemptAt", "leaseOwner", "leaseExpiresAt", "startedAt", "finishedAt", "lastErrorCode", "updatedAt")
  ON "AutomationExecution" TO giraffe_app;

-- AutomationActionResult: SÓ SELECT + INSERT — APPEND-ONLY imutável (como CardHistory/FormVersion/DomainEvent).
-- Registrar o resultado de uma Ação é INSERT; NUNCA UPDATE/DELETE. "Sem reescrita do resultado" é do BANCO.
GRANT SELECT, INSERT ON "AutomationActionResult" TO giraffe_app;
