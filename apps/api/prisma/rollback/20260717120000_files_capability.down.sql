-- Rollback CIRÚRGICO da migration `20260717120000_files_capability` (Story 3.7).
--
-- Reverte por completo a introdução de `FileObject`, `FileScan` e `ScanSlot`. DROP TABLE remove, em cascata,
-- as policies de RLS, os GRANTs, os índices (inclusive o único de `bucketKey`) e as FKs — mas explicitar os
-- DROP de policy antes é defesa em profundidade e deixa a intenção clara num arquivo lido às pressas durante
-- um incidente. NÃO toca `Organization`.
--
-- Ordem respeita a FK: FileScan referencia FileObject → dropar FileScan primeiro. ScanSlot é independente.
--
-- ⚠️ DESTRUTIVO: apaga os metadados de arquivo e a trilha de verificação. Reversível apenas por re-`deploy` da
-- migration (que recria a estrutura vazia) — os dados não são preservados por um rollback de schema. O binário
-- no storage é gerido à parte (expurgo/lifecycle do bucket), fora do escopo deste rollback de schema.

DROP POLICY IF EXISTS file_scan_delete ON "FileScan";
DROP POLICY IF EXISTS file_scan_update ON "FileScan";
DROP POLICY IF EXISTS file_scan_insert ON "FileScan";
DROP POLICY IF EXISTS file_scan_select ON "FileScan";

DROP POLICY IF EXISTS file_object_delete ON "FileObject";
DROP POLICY IF EXISTS file_object_update ON "FileObject";
DROP POLICY IF EXISTS file_object_insert ON "FileObject";
DROP POLICY IF EXISTS file_object_select ON "FileObject";

DROP TABLE IF EXISTS "FileScan";
DROP TABLE IF EXISTS "ScanSlot";
DROP TABLE IF EXISTS "FileObject";

DROP TYPE IF EXISTS "FileVerdict";
DROP TYPE IF EXISTS "FileState";
