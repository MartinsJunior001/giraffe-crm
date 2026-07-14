-- Rollback da migration `20260714120000_forms` (Story 2.4).
--
-- Reverte por completo a introdução do domínio Formulário. `Field` sai antes de `Form` (FK). DROP TABLE
-- remove em cascata policies, GRANT, índices (inclusive os únicos parciais), CHECK e FKs — mas explicitar os
-- DROP de policy antes é defesa em profundidade e deixa a intenção clara num arquivo lido às pressas durante
-- um incidente. NÃO toca `Pipe`, `Phase`, `PipeGrant`, `Membership` nem `Organization`.
--
-- ⚠️ DESTRUTIVO: apaga as tabelas `Field`/`Form` e todos os Formulários/Campos. Reversível apenas por
-- re-`deploy` da migration (que recria a estrutura vazia) — os dados não são preservados por rollback de
-- schema.

DROP POLICY IF EXISTS field_delete ON "Field";
DROP POLICY IF EXISTS field_update ON "Field";
DROP POLICY IF EXISTS field_insert ON "Field";
DROP POLICY IF EXISTS field_select ON "Field";

DROP POLICY IF EXISTS form_delete ON "Form";
DROP POLICY IF EXISTS form_update ON "Form";
DROP POLICY IF EXISTS form_insert ON "Form";
DROP POLICY IF EXISTS form_select ON "Form";

DROP TABLE IF EXISTS "Field";
DROP TABLE IF EXISTS "Form";

DROP TYPE IF EXISTS "FieldState";
DROP TYPE IF EXISTS "FormContext";
DROP TYPE IF EXISTS "FieldType";
