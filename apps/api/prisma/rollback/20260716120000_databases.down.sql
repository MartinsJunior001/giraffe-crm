-- Rollback da migration `20260716120000_databases` (Story 3.1).
--
-- Reverte por completo a introdução do Database. DROP TABLE remove, em cascata, as policies de RLS,
-- o GRANT ao runtime, o índice e a FK — mas explicitar os DROP de policy antes é defesa em
-- profundidade e deixa a intenção clara num arquivo lido às pressas durante um incidente.
--
-- ⚠️ DESTRUTIVO: apaga a tabela `Database` e todos os Databases. Reversível apenas por re-`deploy` da
-- migration (que recria a estrutura vazia) — os dados de Database não são preservados por um rollback
-- de schema.

DROP POLICY IF EXISTS database_delete ON "Database";
DROP POLICY IF EXISTS database_update ON "Database";
DROP POLICY IF EXISTS database_insert ON "Database";
DROP POLICY IF EXISTS database_select ON "Database";

DROP TABLE IF EXISTS "Database";

DROP TYPE IF EXISTS "DatabaseState";
