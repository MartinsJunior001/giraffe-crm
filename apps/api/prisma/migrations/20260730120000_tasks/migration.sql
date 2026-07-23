-- Story 5.1 — Tarefas: ciclo de vida e acompanhamento. TRÊS tabelas NOVAS do Épico 5, com consumidor
-- concreto NESTA Story (o módulo `tasks/` — CRUD/ciclo de vida/Responsável/vínculo + mecanismo de atraso).
-- Encadeia DEPOIS de `..._automation_chaining` (E4).
--
-- Papéis das tabelas:
--  · Task — a Tarefa. Dado operacional org-owned. Ledger MUTÁVEL, com GRANT de UPDATE COLUMN-SCOPED só das
--    colunas de conteúdo/estado/vínculo; a identidade (orgId/pipeId) e a autoria (creatorMembershipId) são
--    imutáveis por GRANT. Sem DELETE (arquivar/concluir = state).
--  · TaskHistory — trilha append-only da Tarefa (GRANT só SELECT/INSERT, como CardHistory).
--  · TaskOverdueOccurrence — ocorrência canônica do Evento "Tarefa atrasada", append-only e idempotente por
--    (orgId, taskId, dueVersion). NÃO persiste `atrasada` (derivado); persiste o FATO da detecção.
--
-- Habilitador tenant-safe: adiciona `@@unique([orgId, id])` a `Card` (destino da FK COMPOSTA de `cardId`).
-- Aplica PARCIALMENTE o `DEB-TENANT-COMPOSITE-FK-RETROFIT` a `Card`. `Pipe` já tem o par (4.1). É um
-- índice único REDUNDANTE (id já é PK ⇒ orgId+id trivialmente único): zero mudança de dado, aditivo.
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT E no
-- UPDATE. FK COMPOSTA tenant-safe (orgId,pipeId)→Pipe(orgId,id) e (orgId,cardId)→Card(orgId,id) e
-- (orgId,taskId)→Task(orgId,id) — uma FK simples deixaria passar id alheio (a checagem de FK roda com BYPASS
-- de row security). Responsável/creator são REFERÊNCIA-POR-ID sem FK (isolados por RLS+orgId; FK composta a
-- Membership é inviável — orgId NOT NULL compartilhado impede SetNull, e Cascade quebraria a exclusão de
-- Conta/LGPD). Sem backfill (tabelas vazias). A única alteração de tabela existente é o índice único aditivo.
--
-- REVERSÍVEL (drill migration-check): ver `prisma/rollback/20260730120000_tasks.down.sql`.

-- CreateEnum
CREATE TYPE "TaskLifecycleState" AS ENUM ('ABERTA', 'CONCLUIDA');
CREATE TYPE "TaskArchiveState" AS ENUM ('ATIVA', 'ARQUIVADA');

-- Habilitador da FK COMPOSTA tenant-safe: par (orgId, id) de Card como destino referenciável.
CREATE UNIQUE INDEX "Card_orgId_id_key" ON "Card"("orgId", "id");

-- CreateTable Task (ledger; UPDATE column-scoped).
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "cardId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMPTZ(3),
    "dueVersion" INTEGER NOT NULL DEFAULT 0,
    "responsavelMembershipId" UUID,
    "creatorMembershipId" UUID,
    "lifecycleState" "TaskLifecycleState" NOT NULL DEFAULT 'ABERTA',
    "archiveState" "TaskArchiveState" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable TaskHistory (append-only).
CREATE TABLE "TaskHistory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable TaskOverdueOccurrence (append-only, idempotente).
CREATE TABLE "TaskOverdueOccurrence" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "dueVersion" INTEGER NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskOverdueOccurrence_pkey" PRIMARY KEY ("id")
);

-- Alvo da FK COMPOSTA tenant-safe dos filhos (TaskHistory/TaskOverdueOccurrence).
CREATE UNIQUE INDEX "Task_orgId_id_key" ON "Task"("orgId", "id");
-- Listagem operacional: Tarefas de um Pipe, por estado.
CREATE INDEX "Task_orgId_pipeId_lifecycleState_idx" ON "Task"("orgId", "pipeId", "lifecycleState");
-- Varredura do mecanismo de atraso — só Tarefas COM prazo (índice PARCIAL, o scan filtra por prazo vencido).
CREATE INDEX "Task_orgId_dueAt_idx" ON "Task"("orgId", "dueAt") WHERE "dueAt" IS NOT NULL;
-- Consulta por Responsável (reatribuição E8).
CREATE INDEX "Task_orgId_responsavelMembershipId_idx" ON "Task"("orgId", "responsavelMembershipId");
-- Consulta por Card associado.
CREATE INDEX "Task_orgId_cardId_idx" ON "Task"("orgId", "cardId");

CREATE INDEX "TaskHistory_orgId_taskId_createdAt_idx" ON "TaskHistory"("orgId", "taskId", "createdAt");

-- Idempotência do Evento "Tarefa atrasada": ≤1 ocorrência por (Tarefa, versão do prazo). A 2ª colide (P2002).
CREATE UNIQUE INDEX "TaskOverdueOccurrence_orgId_taskId_dueVersion_key"
  ON "TaskOverdueOccurrence"("orgId", "taskId", "dueVersion");
CREATE INDEX "TaskOverdueOccurrence_orgId_taskId_idx" ON "TaskOverdueOccurrence"("orgId", "taskId");

-- AddForeignKey (Task)
ALTER TABLE "Task" ADD CONSTRAINT "Task_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,pipeId)→Pipe(orgId,id). Cascade: a Tarefa é dado do Pipe.
ALTER TABLE "Task" ADD CONSTRAINT "Task_orgId_pipeId_fkey"
  FOREIGN KEY ("orgId", "pipeId") REFERENCES "Pipe"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,cardId)→Card(orgId,id), nulável. Cascade como DomainEvent.pipe (só dispara
-- no expurgo do dono — o runtime não tem DELETE em Card). MATCH SIMPLE não checa a FK quando cardId é NULL.
ALTER TABLE "Task" ADD CONSTRAINT "Task_orgId_cardId_fkey"
  FOREIGN KEY ("orgId", "cardId") REFERENCES "Card"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (TaskHistory)
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskHistory" ADD CONSTRAINT "TaskHistory_orgId_taskId_fkey"
  FOREIGN KEY ("orgId", "taskId") REFERENCES "Task"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (TaskOverdueOccurrence)
ALTER TABLE "TaskOverdueOccurrence" ADD CONSTRAINT "TaskOverdueOccurrence_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskOverdueOccurrence" ADD CONSTRAINT "TaskOverdueOccurrence_orgId_taskId_fkey"
  FOREIGN KEY ("orgId", "taskId") REFERENCES "Task"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Card/DomainEvent/AutomationExecution. ENABLE liga a RLS;
-- FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_select ON "Task"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY task_insert ON "Task"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- WITH CHECK no UPDATE impede MOVER a Tarefa para outra Org (defesa em profundidade sobre o GRANT column-scoped).
CREATE POLICY task_update ON "Task"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
-- Policy DELETE por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (ver abaixo) — a Tarefa não é apagável.
CREATE POLICY task_delete ON "Task"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "TaskHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskHistory" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_history_select ON "TaskHistory"
  FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY task_history_insert ON "TaskHistory"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe esses privilégios (append-only imutável).
CREATE POLICY task_history_update ON "TaskHistory"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
CREATE POLICY task_history_delete ON "TaskHistory"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "TaskOverdueOccurrence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TaskOverdueOccurrence" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_overdue_select ON "TaskOverdueOccurrence"
  FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY task_overdue_insert ON "TaskOverdueOccurrence"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
CREATE POLICY task_overdue_update ON "TaskOverdueOccurrence"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
CREATE POLICY task_overdue_delete ON "TaskOverdueOccurrence"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
--
-- Task: SELECT + INSERT + UPDATE **COLUMN-SCOPED** — só conteúdo/prazo/Responsável/estados/vínculo. A
-- identidade (`orgId`/`pipeId`) e a autoria (`creatorMembershipId`) NÃO recebem UPDATE: uma Tarefa não migra
-- de Org/Pipe nem tem a autoria reescrita (uma rota que tentasse bateria em `permission denied` — provado no
-- `tasks-rls`). SEM DELETE (arquivar/concluir = state).
GRANT SELECT, INSERT ON "Task" TO giraffe_app;
GRANT UPDATE ("title", "description", "dueAt", "dueVersion", "responsavelMembershipId", "lifecycleState", "archiveState", "cardId", "updatedAt")
  ON "Task" TO giraffe_app;

-- TaskHistory / TaskOverdueOccurrence: SÓ SELECT + INSERT — APPEND-ONLY imutável (como CardHistory/DomainEvent).
GRANT SELECT, INSERT ON "TaskHistory" TO giraffe_app;
GRANT SELECT, INSERT ON "TaskOverdueOccurrence" TO giraffe_app;
