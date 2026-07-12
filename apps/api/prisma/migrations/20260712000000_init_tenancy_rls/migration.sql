-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('ADMIN', 'MEMBER', 'GUEST');

-- CreateEnum
CREATE TYPE "MembershipState" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "state" "MembershipState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Membership_orgId_state_idx" ON "Membership"("orgId", "state");

-- CreateIndex
CREATE INDEX "Membership_accountId_idx" ON "Membership"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_accountId_orgId_key" ON "Membership"("accountId", "orgId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — o banco NEGA por padrão.
--
-- Contrato de contexto (definido DENTRO da transação, nunca global no pool):
--   app.current_org_id      → Organização do contexto
--   app.current_account_id  → conta autenticada
--
-- Sem contexto, `current_setting(..., true)` devolve NULL, toda comparação
-- resulta NULL (nunca TRUE) e o acesso é NEGADO. É o deny-by-default.
--
-- NÃO EXISTE, e não pode existir, policy/flag de bypass alcançável em runtime.
-- (O exemplo oficial do Prisma sugere uma `bypass_rls_policy` — proibida aqui.)
-- ============================================================================

-- Helpers: NULL quando ausente ou malformado. `''::uuid` lançaria exceção, e uma
-- exceção não é negação — precisa ser NULL para que a policy simplesmente não case.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_org_id', true), '')::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;  -- contexto inválido (uuid malformado) => negado, não erro 500
END;
$$;

CREATE OR REPLACE FUNCTION current_account_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_account_id', true), '')::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Account: identidade GLOBAL da Plataforma (AD-10). Deliberadamente SEM RLS —
-- a conta não pertence a Organização alguma. O que a vincula é a Membership,
-- e é lá que o isolamento acontece.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Organization
-- ---------------------------------------------------------------------------
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
-- FORCE: sem isto o DONO da tabela ignoraria as policies. É por isso que também
-- exigimos que a aplicação NÃO seja dona (as duas coisas, juntas).
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;

CREATE POLICY org_select ON "Organization"
  FOR SELECT USING ("id" = current_org_id());

-- USING filtra linhas EXISTENTES; WITH CHECK valida linhas NOVAS/MODIFICADAS.
-- Sem WITH CHECK, um INSERT com orgId alheio seria ACEITO (e ficaria invisível).
CREATE POLICY org_insert ON "Organization"
  FOR INSERT WITH CHECK ("id" = current_org_id());

CREATE POLICY org_update ON "Organization"
  FOR UPDATE USING ("id" = current_org_id())
         WITH CHECK ("id" = current_org_id());

CREATE POLICY org_delete ON "Organization"
  FOR DELETE USING ("id" = current_org_id());

-- ---------------------------------------------------------------------------
-- Membership
-- ---------------------------------------------------------------------------
ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;

-- LEITURA: orgId = contexto da Org  OU  accountId = contexto da conta.
--
-- O segundo ramo existe porque o login (Story 1.4) precisa responder "a quais
-- Organizações esta conta pertence?" ANTES de existir contexto de Organização.
-- Sem ele, o isolamento quebraria o próprio login. Não vaza nada: a conta vê
-- apenas os vínculos DELA. Sem NENHUM dos dois contextos, ambos são NULL => negado.
CREATE POLICY membership_select ON "Membership"
  FOR SELECT USING (
    "orgId" = current_org_id() OR "accountId" = current_account_id()
  );

-- ESCRITA: sempre restrita ao contexto da Organização. Uma conta NÃO cria nem
-- altera vínculo fora da Org corrente, nem mesmo os próprios.
CREATE POLICY membership_insert ON "Membership"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

CREATE POLICY membership_update ON "Membership"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY membership_delete ON "Membership"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML apenas. Sem DDL, sem ownership.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "Account", "Organization", "Membership" TO giraffe_app;
GRANT EXECUTE ON FUNCTION current_org_id(), current_account_id() TO giraffe_app;
