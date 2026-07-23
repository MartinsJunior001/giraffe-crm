-- Story 4.7 — Encadeamento e prevenção de ciclos. Migration ADITIVA (encadeia DEPOIS de `..._automation_engine`
-- de 4.6 e `..._domain_events` de 4.3). Materializa o mecanismo de PREVENÇÃO ROBUSTA de execução cíclica
-- (NFR-7, AD-18) que o motor (4.6) consulta ANTES de enfileirar/processar uma Execução-filha:
--
--  (1) `AutomationExecutionState += HALTED_BY_LIMIT` — estado TERMINAL "interrompida por limite" (dead-letter
--      auditável): uma Execução barrada por profundidade/ciclo/timeout da cadeia NÃO é reivindicável e NÃO
--      executa. O motivo exato vive em `lastErrorCode` (sanitizado — AD-30).
--  (2) `DomainEvent.chainDepth` — carimbo de profundidade propagado pelo Evento gerado por uma Ação (RAIZ = 0;
--      filho = pai+1). INSERT-only (o outbox é append-only; `DomainEvent` não tem GRANT de UPDATE).
--  (3) `AutomationExecution.chainDepth` — profundidade herdada do Evento no enfileiramento (INSERT-only; fora do
--      GRANT de UPDATE column-scoped) + índice por `executionChainId` (início da cadeia p/ timeout; inspeção).
--  (4) `AutomationChainVisit` — tabela NOVA append-only: a ASSINATURA DE VISITA determinística por cadeia. O
--      índice único parcial `(orgId, executionChainId, signature)` faz a RE-VISITA da mesma assinatura na mesma
--      cadeia COLIDIR (P2002) — detecção de ciclo direto (A→A) e indireto (A→B→A) imposta pelo BANCO, race-safe
--      e fail-closed. `eventId` distingue redelivery (mesmo Evento) de re-visita (Evento distinto).
--
-- Isolamento pelo BANCO (AD-6): a tabela nova replica o padrão de Card/Record/DomainEvent — RLS ENABLE+FORCE,
-- policies por `current_org_id()` com WITH CHECK no INSERT (e UPDATE por simetria/defesa). GRANT SÓ SELECT/INSERT
-- (append-only imutável). `executionId` é referência por id (sem FK, isolada por RLS+orgId), como `eventId` em
-- AutomationExecution. `chainDepth` nas duas tabelas nasce com DEFAULT 0 (backfill implícito das linhas
-- existentes = 0, coerente: linhas anteriores à 4.7 são raízes/sem encadeamento). Sem alteração destrutiva.
--
-- REVERSÍVEL (drill do gate migration-check) — na ordem:
--   DROP TABLE "AutomationChainVisit";
--   DROP INDEX "AutomationExecution_orgId_executionChainId_idx";
--   ALTER TABLE "AutomationExecution" DROP COLUMN "chainDepth";
--   ALTER TABLE "DomainEvent" DROP COLUMN "chainDepth";
--   -- (o valor de enum `HALTED_BY_LIMIT` NÃO é removível por `ALTER TYPE ... DROP VALUE` no PostgreSQL; a
--   --  reversão do enum, se estritamente necessária, recria o tipo — ver `down.sql`. Nenhuma linha usa o valor
--   --  ao reverter esta Story, então deixá-lo é inócuo.)
-- Nenhum dado pré-existente é destruído; o rollback restaura o comportamento anterior (colunas 0/ausentes).

-- (1) ENUM — anexa o membro TERMINAL sem reescrever tabela (idempotente). Não é USADO nesta migration (só o
-- runtime da 4.7 o grava), então é seguro dentro da transação da migration (PostgreSQL 16).
ALTER TYPE "AutomationExecutionState" ADD VALUE IF NOT EXISTS 'HALTED_BY_LIMIT';

-- (2) DomainEvent.chainDepth (INSERT-only — o outbox não tem GRANT de UPDATE; nada a conceder).
ALTER TABLE "DomainEvent" ADD COLUMN "chainDepth" INTEGER NOT NULL DEFAULT 0;

-- (3) AutomationExecution.chainDepth + índice por cadeia. NÃO entra no GRANT de UPDATE (imutável por nível).
ALTER TABLE "AutomationExecution" ADD COLUMN "chainDepth" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "AutomationExecution_orgId_executionChainId_idx"
  ON "AutomationExecution"("orgId", "executionChainId");

-- (4) AutomationChainVisit — assinatura de visita por cadeia (append-only).
CREATE TABLE "AutomationChainVisit" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "executionChainId" UUID NOT NULL,
    "signature" TEXT NOT NULL,
    "eventId" UUID NOT NULL,
    "executionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationChainVisit_pkey" PRIMARY KEY ("id")
);

-- PREVENÇÃO DE CICLO: ≤1 visita por (cadeia, assinatura). A 2ª tentativa de rodar a mesma assinatura na mesma
-- cadeia colide (P2002) ⇒ `CYCLE_DETECTED`. É a detecção A→A / A→B→A imposta pelo BANCO (race-safe, fail-closed).
CREATE UNIQUE INDEX "AutomationChainVisit_orgId_executionChainId_signature_key"
  ON "AutomationChainVisit"("orgId", "executionChainId", "signature");
-- Início da cadeia (min createdAt) para o timeout de duração e inspeção do encadeamento.
CREATE INDEX "AutomationChainVisit_orgId_executionChainId_idx"
  ON "AutomationChainVisit"("orgId", "executionChainId");

ALTER TABLE "AutomationChainVisit" ADD CONSTRAINT "AutomationChainVisit_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a DomainEvent/AutomationActionResult. ENABLE liga a RLS; FORCE a
-- estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "AutomationChainVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationChainVisit" FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_chain_visit_select ON "AutomationChainVisit"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY automation_chain_visit_insert ON "AutomationChainVisit"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe esses privilégios (append-only imutável).
CREATE POLICY automation_chain_visit_update ON "AutomationChainVisit"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
CREATE POLICY automation_chain_visit_delete ON "AutomationChainVisit"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
-- AutomationChainVisit: SÓ SELECT + INSERT — APPEND-ONLY imutável (como CardHistory/FormVersion/DomainEvent/
-- AutomationActionResult). Registrar uma visita é INSERT; NUNCA UPDATE/DELETE. "Sem apagar/reescrever a visita"
-- é do BANCO — uma rota que tentasse UPDATE/DELETE bateria em `permission denied` (provado no `automation-chaining-rls`).
GRANT SELECT, INSERT ON "AutomationChainVisit" TO giraffe_app;
