-- ROLLBACK de `20260712000000_init_tenancy_rls`.
--
-- O Prisma Migrate não gera migration reversa. Sem este arquivo, "temos plano de rollback"
-- seria uma frase, não uma capacidade — e a hora de descobrir isso seria durante o
-- incidente. Ele é exercitado pelo teste `migration-rollback` (aplica → reverte → reaplica).
--
-- Rodar com o papel DONO do schema (`giraffe_migrator`), via `pnpm db:rollback`.
-- O `giraffe_app` NÃO tem privilégio de DDL — de propósito.
--
-- ⚠️ DESTRUTIVO: apaga as tabelas e todos os dados. Em produção, exige backup restaurável
-- verificado antes (AD-33 — backup concluído não prova recuperabilidade).

BEGIN;

-- Ordem inversa da criação. As policies caem junto com as tabelas, mas removê-las
-- explicitamente deixa o rollback legível e torna o arquivo reutilizável em rollback parcial.
DROP POLICY IF EXISTS membership_select ON "Membership";
DROP POLICY IF EXISTS membership_insert ON "Membership";
DROP POLICY IF EXISTS membership_update ON "Membership";
DROP POLICY IF EXISTS membership_delete ON "Membership";

DROP POLICY IF EXISTS org_select ON "Organization";
DROP POLICY IF EXISTS org_insert ON "Organization";
DROP POLICY IF EXISTS org_update ON "Organization";
DROP POLICY IF EXISTS org_delete ON "Organization";

-- `Membership` primeiro: depende de `Account` e `Organization` por FK.
DROP TABLE IF EXISTS "Membership";
DROP TABLE IF EXISTS "Organization";
DROP TABLE IF EXISTS "Account";

DROP TYPE IF EXISTS "MembershipState";
DROP TYPE IF EXISTS "MembershipRole";

DROP FUNCTION IF EXISTS current_org_id();
DROP FUNCTION IF EXISTS current_account_id();

-- Sem isto, o Prisma acreditaria que a migration ainda está aplicada e se recusaria a
-- reaplicá-la — o rollback pareceria ter funcionado até a próxima tentativa de deploy.
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20260712000000_init_tenancy_rls';

COMMIT;
