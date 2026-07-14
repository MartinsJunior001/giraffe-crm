-- Rollback da migration `20260713130000_pipe_grants` (Story 2.2).
--
-- Reverte por completo a introdução da concessão de papel por Pipe. DROP TABLE remove, em cascata, as
-- policies de RLS, o GRANT, os índices (inclusive o único parcial) e as FKs — mas explicitar os DROP de
-- policy antes é defesa em profundidade e deixa a intenção clara num arquivo lido às pressas durante um
-- incidente. NÃO toca `Pipe`, `Membership` nem `Organization`.
--
-- ⚠️ DESTRUTIVO: apaga a tabela `PipeGrant` e todas as concessões. Reversível apenas por re-`deploy` da
-- migration (que recria a estrutura vazia) — os dados de concessão não são preservados por um rollback
-- de schema.

DROP POLICY IF EXISTS pipe_grant_delete ON "PipeGrant";
DROP POLICY IF EXISTS pipe_grant_update ON "PipeGrant";
DROP POLICY IF EXISTS pipe_grant_insert ON "PipeGrant";
DROP POLICY IF EXISTS pipe_grant_select ON "PipeGrant";

DROP TABLE IF EXISTS "PipeGrant";

DROP TYPE IF EXISTS "PipeGrantState";
DROP TYPE IF EXISTS "PipeRole";
