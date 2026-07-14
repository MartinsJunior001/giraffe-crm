-- Rollback da migration `20260713140000_phases` (Story 2.3).
--
-- Reverte por completo a introdução da Fase. DROP TABLE remove, em cascata, as policies de RLS, o GRANT,
-- os índices e as FKs — mas explicitar os DROP de policy antes é defesa em profundidade e deixa a intenção
-- clara num arquivo lido às pressas durante um incidente. NÃO toca `Pipe`, `PipeGrant`, `Membership` nem
-- `Organization`.
--
-- ⚠️ DESTRUTIVO: apaga a tabela `Phase` e todas as Fases. Reversível apenas por re-`deploy` da migration
-- (que recria a estrutura vazia) — os dados de Fase não são preservados por um rollback de schema.

DROP POLICY IF EXISTS phase_delete ON "Phase";
DROP POLICY IF EXISTS phase_update ON "Phase";
DROP POLICY IF EXISTS phase_insert ON "Phase";
DROP POLICY IF EXISTS phase_select ON "Phase";

DROP TABLE IF EXISTS "Phase";

DROP TYPE IF EXISTS "PhaseState";
