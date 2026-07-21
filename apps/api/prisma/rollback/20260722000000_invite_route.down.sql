-- Rollback da Story 8.3 — InviteRoute (resolvedor global de tenant do aceite).
-- Reverte a migration `20260722000000_invite_route`. Ordem inversa: triggers -> função -> tabela.
-- NÃO toca `Invite` nem nenhuma tabela da 8.2 — apenas remove o índice global derivado e sua manutenção.

DROP TRIGGER IF EXISTS "invite_route_sync_upd" ON "Invite";
DROP TRIGGER IF EXISTS "invite_route_sync_ins" ON "Invite";
DROP FUNCTION IF EXISTS giraffe_sync_invite_route();
DROP TABLE IF EXISTS "InviteRoute";
