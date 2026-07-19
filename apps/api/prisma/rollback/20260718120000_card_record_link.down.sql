-- Rollback CIRÚRGICO da migration `20260718120000_card_record_link` (Story 3.9 — vínculo Card↔Registro N–N).
--
-- Remediação REM-3.9-ROLLBACK-ATOMICIDADE: a migration forward foi mergeada (#117) sem este arquivo
-- versionado, embora se declarasse reversível. Este `.down.sql` é o inverso semântico EXATO — remove
-- SOMENTE os objetos que a 3.9 introduziu, na ordem segura, e NÃO toca nada preexistente.
--
-- Objetos introduzidos pela 3.9 (todos revertidos abaixo):
--   • coluna "correlationId" em "CardHistory" e "RecordHistory" (tabelas PREEXISTENTES — só a coluna sai)
--     e seus índices "..._orgId_correlationId_idx";
--   • tipo "CardRecordLinkState";
--   • tabela "CardRecordLink" (com seus 3 índices, 3 FKs, RLS ENABLE/FORCE, 4 policies e o GRANT ao runtime).
--
-- `DROP TABLE` remove, em cascata, os índices/constraints/policies/grants/RLS DA TABELA. Os `DROP POLICY`
-- explícitos antes são defesa em profundidade e deixam a intenção clara num arquivo lido às pressas num
-- incidente. `IF EXISTS` em cada passo torna o rollback idempotente e permite o drill `up → down → up` sem
-- estado sujo. Nenhum comando amplo (nada de DROP SCHEMA/CASCADE de terceiros); nenhum caminho local.
--
-- NÃO toca: "CardHistory"/"RecordHistory" (exceto a coluna nova), "Card", "Record", "Organization", nem
-- qualquer objeto de Stories anteriores.
--
-- ⚠️ DESTRUTIVO quanto AOS VÍNCULOS: apaga a tabela "CardRecordLink" e todos os vínculos nela. A coluna
-- "correlationId" removida das trilhas zera a correlação dos eventos LINKED/UNLINKED já gravados (os eventos
-- em si permanecem — só a coluna de correlação sai). Reversível apenas por re-`deploy` da migration forward
-- (que recria a estrutura vazia); os vínculos não são preservados por um rollback de schema.

-- ── 1. Policies da tabela nova (defesa em profundidade; o DROP TABLE também as removeria) ──────────────
DROP POLICY IF EXISTS card_record_link_delete ON "CardRecordLink";
DROP POLICY IF EXISTS card_record_link_update ON "CardRecordLink";
DROP POLICY IF EXISTS card_record_link_insert ON "CardRecordLink";
DROP POLICY IF EXISTS card_record_link_select ON "CardRecordLink";

-- ── 2. Tabela nova (remove em cascata: índices, FKs, RLS/FORCE, GRANT ao giraffe_app) ─────────────────
DROP TABLE IF EXISTS "CardRecordLink";

-- ── 3. Enum exclusivo da tabela nova ─────────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS "CardRecordLinkState";

-- ── 4. Índices das colunas aditivas nas trilhas PREEXISTENTES ────────────────────────────────────────
DROP INDEX IF EXISTS "RecordHistory_orgId_correlationId_idx";
DROP INDEX IF EXISTS "CardHistory_orgId_correlationId_idx";

-- ── 5. Colunas aditivas nas trilhas PREEXISTENTES (só a coluna; a tabela e o resto ficam intactos) ────
ALTER TABLE "RecordHistory" DROP COLUMN IF EXISTS "correlationId";
ALTER TABLE "CardHistory" DROP COLUMN IF EXISTS "correlationId";
