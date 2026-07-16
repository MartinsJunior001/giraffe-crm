-- Rollback da migration `20260716140000_database_grants` (Story 3.2).
--
-- Reverte por completo a introdução da concessão de papel por Database. DROP TABLE remove, em cascata, as
-- policies de RLS, o GRANT, os índices (inclusive o único parcial) e as FKs — mas explicitar os DROP de
-- policy antes é defesa em profundidade e deixa a intenção clara num arquivo lido às pressas durante um
-- incidente. NÃO toca `Database`, `Membership`, `Organization` nem `PipeGrant`.
--
-- ⚠️ DESTRUTIVO: apaga a tabela `DatabaseGrant` e todas as concessões. Reversível apenas por re-`deploy` da
-- migration (que recria a estrutura vazia) — os dados de concessão não são preservados por um rollback
-- de schema.

DROP POLICY IF EXISTS database_grant_delete ON "DatabaseGrant";
DROP POLICY IF EXISTS database_grant_update ON "DatabaseGrant";
DROP POLICY IF EXISTS database_grant_insert ON "DatabaseGrant";
DROP POLICY IF EXISTS database_grant_select ON "DatabaseGrant";

DROP TABLE IF EXISTS "DatabaseGrant";

DROP TYPE IF EXISTS "DatabaseGrantState";
DROP TYPE IF EXISTS "DatabaseRole";
