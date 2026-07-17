-- Rollback CIRÚRGICO da Story 3.3 (Formulário de Database). Remove SOMENTE o que a migration
-- `20260716160000_database_forms` adicionou ao `Form`; NÃO toca `Field`/`FormVersion` nem os owners de Pipe.
-- Restaura o `Form_context_owner_ck` de 2 cláusulas (estado da 2.4, sem a cláusula DATABASE).
--
-- ⚠️ PRÉ-CONDIÇÃO (fail-safe, por construção): este rollback só é limpo se NÃO existir nenhum Formulário de
-- Database (`Form` com `context='DATABASE'`). Ao re-adicionar o CHECK de 2 cláusulas, qualquer linha
-- `context='DATABASE'` (que nenhuma cláusula admite) faz o `ADD CONSTRAINT` FALHAR — e o Postgres envolve este
-- script multi-statement numa transação implícita, então a falha REVERTE o rollback INTEIRO (sem estado parcial,
-- sem perda de dado). Isso é deliberado: reverter a feature enquanto há schema de Database materializado
-- ORFANARIA esses Formulários. O caminho correto é despublicar/remover os Formulários de Database ANTES de
-- reverter. Dropar a coluna antes NÃO ajuda (a linha continua `context='DATABASE'`, violando o CHECK).

DROP INDEX IF EXISTS "Form_orgId_databaseId_idx";
DROP INDEX IF EXISTS "Form_database_uq";

ALTER TABLE "Form" DROP CONSTRAINT IF EXISTS "Form_context_owner_ck";
ALTER TABLE "Form" ADD CONSTRAINT "Form_context_owner_ck" CHECK (
    ("context" = 'PIPE_INITIAL' AND "pipeId" IS NOT NULL AND "phaseId" IS NULL) OR
    ("context" = 'PHASE'        AND "phaseId" IS NOT NULL AND "pipeId" IS NULL)
);

ALTER TABLE "Form" DROP CONSTRAINT IF EXISTS "Form_databaseId_fkey";
ALTER TABLE "Form" DROP COLUMN IF EXISTS "databaseId";
