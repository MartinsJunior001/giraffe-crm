-- Rollback da 20260729120000_automation_chaining (Story 4.7 — Encadeamento e prevenção de ciclos).
--
-- Reverte, na ordem inversa da aplicação, os objetos ADITIVOS da migration. NÃO é destrutivo de dado do
-- titular: `AutomationChainVisit` é metadado interno de prevenção de ciclo (não PII); as colunas `chainDepth`
-- voltam a não existir (o comportamento pré-4.7 tratava toda Execução como raiz/sem encadeamento).
--
-- ⚠️ O valor de enum `HALTED_BY_LIMIT` NÃO é removível por `ALTER TYPE ... DROP VALUE` (PostgreSQL não suporta).
-- Deixá-lo é INÓCUO: ao reverter a 4.7 nenhuma linha usa o valor (o motor pré-4.7 nunca o grava). A remoção
-- estrita exigiria recriar o tipo e reescrever a coluna — não fazemos, por ser desnecessário e mais arriscado.
--
-- A remoção da linha em `_prisma_migrations` é do runner (`scripts/db-migrate.mjs`), não daqui.

DROP TABLE IF EXISTS "AutomationChainVisit";

DROP INDEX IF EXISTS "AutomationExecution_orgId_executionChainId_idx";
ALTER TABLE "AutomationExecution" DROP COLUMN IF EXISTS "chainDepth";

ALTER TABLE "DomainEvent" DROP COLUMN IF EXISTS "chainDepth";
