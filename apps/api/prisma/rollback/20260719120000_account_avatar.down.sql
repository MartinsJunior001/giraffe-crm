-- Rollback CIRÚRGICO da migration `20260719120000_account_avatar` (Story 3.10 — avatar do próprio usuário).
--
-- Inverso semântico EXATO da forward: remove SOMENTE os objetos que a 3.10 introduziu, na ordem segura, e
-- NÃO toca nada preexistente.
--
-- Objetos introduzidos pela 3.10 (todos revertidos abaixo):
--   • tabela "AccountAvatar" (com seus 2 índices, 3 FKs, RLS ENABLE/FORCE, 4 policies e o GRANT ao runtime);
--   • tipo "AccountAvatarState".
--
-- É uma lista curta porque a 3.10 foi desenhada para não precisar de mais: ela **não alterou "Account"**
-- (nenhuma coluna, nenhum GRANT, nenhuma policy), **não alterou "FileObject"** e não criou função nenhuma.
-- Por isso não há nada a revogar aqui — o rollback não precisa desfazer privilégio algum em tabela global.
--
-- `DROP TABLE` remove, em cascata, os índices/constraints/policies/grants/RLS DA TABELA. Os `DROP POLICY`
-- explícitos antes são defesa em profundidade e deixam a intenção clara num arquivo lido às pressas num
-- incidente. `IF EXISTS` em cada passo torna o rollback idempotente e permite o drill `up → down → up` sem
-- estado sujo. Nenhum comando amplo (nada de DROP SCHEMA/CASCADE de terceiros); nenhum caminho local.
--
-- NÃO toca: "Account", "FileObject", "Organization", nem qualquer objeto de Stories anteriores.
--
-- ⚠️ DESTRUTIVO quanto AOS SLOTS de avatar: apaga a tabela "AccountAvatar" e as associações nela. Os
-- BINÁRIOS não são perdidos — eles são "FileObject" (`resourceType='ACCOUNT'`), tabela preexistente que este
-- rollback não toca; o que se perde é o ponteiro de qual arquivo era o avatar vigente. Após o rollback a UI
-- cai no fallback por iniciais (1.11), que não depende desta tabela. Reversível por re-`deploy` da migration
-- forward (que recria a estrutura vazia); os slots não são preservados por um rollback de schema.

-- ── 1. Policies (defesa em profundidade; o DROP TABLE também as removeria) ────────────────────────────
DROP POLICY IF EXISTS account_avatar_delete ON "AccountAvatar";
DROP POLICY IF EXISTS account_avatar_update ON "AccountAvatar";
DROP POLICY IF EXISTS account_avatar_insert ON "AccountAvatar";
DROP POLICY IF EXISTS account_avatar_select ON "AccountAvatar";

-- ── 2. Tabela (remove em cascata: índices, FKs, RLS/FORCE, GRANT ao giraffe_app) ──────────────────────
DROP TABLE IF EXISTS "AccountAvatar";

-- ── 3. Enum exclusivo da tabela ───────────────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS "AccountAvatarState";
