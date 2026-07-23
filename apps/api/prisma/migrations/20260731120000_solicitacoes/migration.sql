-- Story 5.2 — Solicitações: ciclo de vida e Responsável. DUAS tabelas NOVAS do Épico 5, twin da 5.1
-- (Tarefas) SEM o eixo temporal: não há prazo, `atrasada`, scheduler nem ocorrência de vencimento — por
-- isso NÃO há tabela equivalente a `TaskOverdueOccurrence`. Encadeia DEPOIS de `..._tasks` (5.1).
--
-- Papéis das tabelas:
--  · Solicitacao — a Solicitação. Dado operacional org-owned. Ledger MUTÁVEL, com GRANT de UPDATE
--    COLUMN-SCOPED só das colunas de conteúdo/estado/vínculo/Responsável; a identidade (orgId/pipeId) e a
--    autoria (creatorMembershipId) são imutáveis por GRANT. Sem DELETE (arquivar/resolver = state).
--  · SolicitacaoHistory — trilha append-only da Solicitação (GRANT só SELECT/INSERT, como TaskHistory).
--
-- Habilitador tenant-safe: a FK COMPOSTA de `cardId` referencia `Card(orgId,id)`, cujo índice
-- `Card_orgId_id_key` JÁ EXISTE (criado pela migration da 5.1) — esta migration NÃO o recria. `Pipe` já tem
-- o par (4.1). Isso mantém a 5.2 puramente aditiva de tabelas novas.
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT E no
-- UPDATE. FK COMPOSTA tenant-safe (orgId,pipeId)→Pipe(orgId,id), (orgId,cardId)→Card(orgId,id) e
-- (orgId,solicitacaoId)→Solicitacao(orgId,id) — uma FK simples deixaria passar id alheio (a checagem de FK
-- roda com BYPASS de row security). Responsável/creator são REFERÊNCIA-POR-ID sem FK (isolados por
-- RLS+orgId; FK composta a Membership é inviável — orgId NOT NULL compartilhado impede SetNull, e Cascade
-- quebraria a exclusão de Conta/LGPD). Sem backfill (tabelas vazias).
--
-- REVERSÍVEL (drill migration-check): ver `prisma/rollback/20260731120000_solicitacoes.down.sql`.

-- CreateEnum
CREATE TYPE "SolicitacaoLifecycleState" AS ENUM ('ABERTA', 'RESOLVIDA');
CREATE TYPE "SolicitacaoArchiveState" AS ENUM ('ATIVA', 'ARQUIVADA');

-- CreateTable Solicitacao (ledger; UPDATE column-scoped).
CREATE TABLE "Solicitacao" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "cardId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "responsavelMembershipId" UUID,
    "creatorMembershipId" UUID,
    "lifecycleState" "SolicitacaoLifecycleState" NOT NULL DEFAULT 'ABERTA',
    "archiveState" "SolicitacaoArchiveState" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Solicitacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable SolicitacaoHistory (append-only).
CREATE TABLE "SolicitacaoHistory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "solicitacaoId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolicitacaoHistory_pkey" PRIMARY KEY ("id")
);

-- Alvo da FK COMPOSTA tenant-safe do filho (SolicitacaoHistory).
CREATE UNIQUE INDEX "Solicitacao_orgId_id_key" ON "Solicitacao"("orgId", "id");
-- Listagem operacional: Solicitações de um Pipe, por estado.
CREATE INDEX "Solicitacao_orgId_pipeId_lifecycleState_idx" ON "Solicitacao"("orgId", "pipeId", "lifecycleState");
-- Consulta por Responsável (reatribuição E8).
CREATE INDEX "Solicitacao_orgId_responsavelMembershipId_idx" ON "Solicitacao"("orgId", "responsavelMembershipId");
-- Consulta por Card associado.
CREATE INDEX "Solicitacao_orgId_cardId_idx" ON "Solicitacao"("orgId", "cardId");

CREATE INDEX "SolicitacaoHistory_orgId_solicitacaoId_createdAt_idx" ON "SolicitacaoHistory"("orgId", "solicitacaoId", "createdAt");

-- AddForeignKey (Solicitacao)
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,pipeId)→Pipe(orgId,id). Cascade: a Solicitação é dado do Pipe.
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_orgId_pipeId_fkey"
  FOREIGN KEY ("orgId", "pipeId") REFERENCES "Pipe"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,cardId)→Card(orgId,id), nulável. MATCH SIMPLE não checa a FK quando cardId
-- é NULL. Cascade: só dispara no expurgo do dono (o runtime não tem DELETE em Card).
ALTER TABLE "Solicitacao" ADD CONSTRAINT "Solicitacao_orgId_cardId_fkey"
  FOREIGN KEY ("orgId", "cardId") REFERENCES "Card"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (SolicitacaoHistory)
ALTER TABLE "SolicitacaoHistory" ADD CONSTRAINT "SolicitacaoHistory_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SolicitacaoHistory" ADD CONSTRAINT "SolicitacaoHistory_orgId_solicitacaoId_fkey"
  FOREIGN KEY ("orgId", "solicitacaoId") REFERENCES "Solicitacao"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Task/Card. ENABLE liga a RLS; FORCE a estende ao PRÓPRIO
-- DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "Solicitacao" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Solicitacao" FORCE ROW LEVEL SECURITY;

CREATE POLICY solicitacao_select ON "Solicitacao"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY solicitacao_insert ON "Solicitacao"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- WITH CHECK no UPDATE impede MOVER a Solicitação para outra Org (defesa em profundidade sobre o GRANT).
CREATE POLICY solicitacao_update ON "Solicitacao"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
-- Policy DELETE por simetria/defesa; o runtime NÃO recebe GRANT de DELETE — a Solicitação não é apagável.
CREATE POLICY solicitacao_delete ON "Solicitacao"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "SolicitacaoHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SolicitacaoHistory" FORCE ROW LEVEL SECURITY;

CREATE POLICY solicitacao_history_select ON "SolicitacaoHistory"
  FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY solicitacao_history_insert ON "SolicitacaoHistory"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe esses privilégios (append-only imutável).
CREATE POLICY solicitacao_history_update ON "SolicitacaoHistory"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
CREATE POLICY solicitacao_history_delete ON "SolicitacaoHistory"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
--
-- Solicitacao: SELECT + INSERT + UPDATE **COLUMN-SCOPED** — só conteúdo/Responsável/estados/vínculo. A
-- identidade (`orgId`/`pipeId`) e a autoria (`creatorMembershipId`) NÃO recebem UPDATE: uma Solicitação não
-- migra de Org/Pipe nem tem a autoria reescrita (uma rota que tentasse bateria em `permission denied` —
-- provado no `solicitacoes-rls`). SEM DELETE (arquivar/resolver = state).
GRANT SELECT, INSERT ON "Solicitacao" TO giraffe_app;
GRANT UPDATE ("title", "description", "responsavelMembershipId", "lifecycleState", "archiveState", "cardId", "updatedAt")
  ON "Solicitacao" TO giraffe_app;

-- SolicitacaoHistory: SÓ SELECT + INSERT — APPEND-ONLY imutável (como TaskHistory/CardHistory).
GRANT SELECT, INSERT ON "SolicitacaoHistory" TO giraffe_app;
