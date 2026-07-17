-- Rollback CIRÚRGICO da migration `20260716180000_records` (Story 3.4).
--
-- Reverte por completo a introdução de `Record` e `RecordHistory`. DROP TABLE remove, em cascata, as policies
-- de RLS, os GRANTs, os índices (inclusive o único de idempotência) e as FKs — mas explicitar os DROP de
-- policy antes é defesa em profundidade e deixa a intenção clara num arquivo lido às pressas durante um
-- incidente. NÃO toca `Database`, `Form`, `FormVersion`, `Organization`.
--
-- Ordem respeita a FK: RecordHistory referencia Record → dropar RecordHistory primeiro.
--
-- ⚠️ DESTRUTIVO: apaga os Registros e sua trilha. Reversível apenas por re-`deploy` da migration (que recria
-- a estrutura vazia) — os dados de Registro/Histórico não são preservados por um rollback de schema.

DROP POLICY IF EXISTS record_history_delete ON "RecordHistory";
DROP POLICY IF EXISTS record_history_update ON "RecordHistory";
DROP POLICY IF EXISTS record_history_insert ON "RecordHistory";
DROP POLICY IF EXISTS record_history_select ON "RecordHistory";

DROP POLICY IF EXISTS record_delete ON "Record";
DROP POLICY IF EXISTS record_update ON "Record";
DROP POLICY IF EXISTS record_insert ON "Record";
DROP POLICY IF EXISTS record_select ON "Record";

DROP TABLE IF EXISTS "RecordHistory";
DROP TABLE IF EXISTS "Record";

DROP TYPE IF EXISTS "RecordOrigin";
DROP TYPE IF EXISTS "RecordLifecycleState";
