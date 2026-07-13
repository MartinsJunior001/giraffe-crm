-- Rollback da migration `20260713000000_auth_e_antiabuso`.
--
-- ⚠️ DESTRUTIVO: apaga sessões, credenciais (incluindo hashes de senha) e contadores de
-- antiabuso. Rodar apenas com decisão explícita e backup verificado.
--
-- A ordem importa: as FKs apontam para `Account`, então as tabelas dependentes caem primeiro.

DROP TABLE IF EXISTS "LoginFailure";
DROP TABLE IF EXISTS "RateLimit";
DROP TABLE IF EXISTS "AuthVerification";
DROP TABLE IF EXISTS "AuthCredential";
DROP TABLE IF EXISTS "AuthSession";

-- As colunas que `Account` ganhou para ser o `user` do Better Auth (D1).
ALTER TABLE "Account" DROP COLUMN IF EXISTS "image";
ALTER TABLE "Account" DROP COLUMN IF EXISTS "emailVerified";

-- Nenhum GRANT a revogar em `Account`: esta migration não concedeu nenhum. O runtime continua
-- com `SELECT` apenas, como desde a Story 1.2.
