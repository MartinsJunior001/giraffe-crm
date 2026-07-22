-- Reversa da Story 4.2 (automation_lifecycle). Drill em banco DESCARTÁVEL. Ordem inversa da migration:
-- revoga privilégios, derruba a tabela nova (com suas policies/FKs por CASCADE do DROP TABLE), remove os
-- UNIQUE e as colunas aditivas de "Automation".
--
-- SEM PERDA DE DADO DO TITULAR: "AutomationVersion" só guarda snapshots de configuração (não é dado de
-- Card/Registro); as colunas removidas de "Automation" (activeVersion/idempotencyKey) são controle interno.
-- Uma Automação que estivesse ACTIVE perde apenas o ponteiro de versão — e volta a ser inerte como na 4.1
-- (o motor 4.6 não existe ainda). Nenhuma configuração (`quando`/`condicoes`/`entao`) é tocada.

-- Revoga o GRANT UPDATE column-scoped concedido em "Automation" (volta ao SELECT/INSERT da 4.1).
REVOKE UPDATE ("name", "state", "activeVersion", "quando", "condicoes", "entao", "configSchemaVersion", "updatedAt") ON "Automation" FROM giraffe_app;

-- Derruba a tabela de versões (DROP TABLE remove policies, índices e FKs associados).
DROP TABLE IF EXISTS "AutomationVersion";

-- Remove os UNIQUE e as colunas aditivas de "Automation".
ALTER TABLE "Automation" DROP CONSTRAINT IF EXISTS "Automation_orgId_pipeId_idempotencyKey_key";
ALTER TABLE "Automation" DROP CONSTRAINT IF EXISTS "Automation_orgId_id_key";
ALTER TABLE "Automation" DROP COLUMN IF EXISTS "idempotencyKey";
ALTER TABLE "Automation" DROP COLUMN IF EXISTS "activeVersion";
