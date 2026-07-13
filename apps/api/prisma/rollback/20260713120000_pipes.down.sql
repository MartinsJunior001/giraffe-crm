-- Rollback da migration `20260713120000_pipes` (Story 2.1).
--
-- Reverte por completo a introdução do Pipe. DROP TABLE remove, em cascata, as policies de RLS, o
-- GRANT ao runtime, o índice e a FK — mas explicitar os DROP de policy antes é defesa em profundidade
-- e deixa a intenção clara num arquivo lido às pressas durante um incidente.
--
-- ⚠️ DESTRUTIVO: apaga a tabela `Pipe` e todos os Pipes. Reversível apenas por re-`deploy` da migration
-- (que recria a estrutura vazia) — os dados de Pipe não são preservados por um rollback de schema.

DROP POLICY IF EXISTS pipe_delete ON "Pipe";
DROP POLICY IF EXISTS pipe_update ON "Pipe";
DROP POLICY IF EXISTS pipe_insert ON "Pipe";
DROP POLICY IF EXISTS pipe_select ON "Pipe";

DROP TABLE IF EXISTS "Pipe";

DROP TYPE IF EXISTS "PipeState";
