-- Reversa de `migrations/20260721120000_invites/migration.sql` (Story 8.2).
--
-- Nome-base IDÊNTICO ao da migration (convenção `prisma/rollback/<nome>.down.sql`). Inverso semântico
-- ponto-a-ponto; `IF EXISTS` para ser re-executável. Nenhum objeto PREEXISTENTE é removido: `Invite`
-- e o enum `InviteState` nasceram nesta Story. Nenhum dado anterior se perde (tabela nova).

-- Policies (o DROP TABLE já as levaria; explícitas por legibilidade e idempotência).
DROP POLICY IF EXISTS invite_select ON "Invite";
DROP POLICY IF EXISTS invite_insert ON "Invite";
DROP POLICY IF EXISTS invite_update ON "Invite";
DROP POLICY IF EXISTS invite_delete ON "Invite";

-- FK, índices (inclusive o parcial) e a tabela — o DROP TABLE remove tudo o que dela depende.
ALTER TABLE "Invite" DROP CONSTRAINT IF EXISTS "Invite_orgId_fkey";
DROP INDEX IF EXISTS "Invite_pending_unico";
DROP INDEX IF EXISTS "Invite_orgId_normalizedEmail_idx";
DROP INDEX IF EXISTS "Invite_orgId_state_idx";
DROP INDEX IF EXISTS "Invite_tokenHash_key";
DROP TABLE IF EXISTS "Invite";

-- O enum, agora sem coluna que o use.
DROP TYPE IF EXISTS "InviteState";

-- O GRANT a giraffe_app desaparece com a tabela — não há privilégio órfão a revogar.
