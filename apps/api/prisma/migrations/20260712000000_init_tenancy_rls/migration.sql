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
--
-- A exceção capturada é APENAS `invalid_text_representation` (uuid malformado). Um
-- `WHEN others` engoliria também falhas reais de infraestrutura e as transformaria,
-- indistinguivelmente, em "sem contexto" => negação silenciosa. Negar por contexto
-- inválido é correto; negar por erro de banco escondido é um bug disfarçado de policy.
CREATE OR REPLACE FUNCTION current_org_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_org_id', true), '')::uuid;
EXCEPTION WHEN invalid_text_representation THEN
  RETURN NULL;  -- contexto inválido (uuid malformado) => negado, não erro 500
END;
$$;

CREATE OR REPLACE FUNCTION current_account_id() RETURNS uuid
LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN NULLIF(current_setting('app.current_account_id', true), '')::uuid;
EXCEPTION WHEN invalid_text_representation THEN
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

-- LEITURA. Dois modos MUTUAMENTE EXCLUSIVOS, e a exclusão é o ponto:
--
--   1. HÁ contexto de Organização  => vê-se APENAS as linhas daquela Organização.
--   2. NÃO há contexto de Organização => vê-se APENAS os vínculos da própria conta.
--
-- O modo 2 existe porque o login (Story 1.4) precisa responder "a quais Organizações
-- esta conta pertence?" ANTES de existir Organização ativa. Sem ele, o isolamento
-- quebraria o próprio login.
--
-- O `current_org_id() IS NULL` no segundo ramo NÃO é decoração. Um `OR "accountId" =
-- current_account_id()` solto vaza: no contexto da Org A, com a conta de alguém que
-- também pertence à Org B, o ramo da conta casa com a Membership dessa pessoa na Org B
-- e ela aparece dentro de uma consulta escopada na Org A — violando o AC1. E é
-- exatamente esse o caminho de produção, porque `withTenantContext` define os DOIS
-- contextos na mesma transação. Havendo Organização ativa, ela é a única fronteira.
--
-- Sem NENHUM dos dois contextos, ambos são NULL => negado (deny-by-default).
CREATE POLICY membership_select ON "Membership"
  FOR SELECT USING (
    "orgId" = current_org_id()
    OR (current_org_id() IS NULL AND "accountId" = current_account_id())
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
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership.
--
-- O GRANT é uma fronteira de segurança por si só, não um detalhe administrativo.
-- Onde a RLS não alcança, é ele que nega. Cada privilégio abaixo existe porque há
-- um uso concreto NESTA Story; nenhum foi concedido "por precaução".
-- ---------------------------------------------------------------------------

-- Account — SOMENTE LEITURA para o runtime.
--
-- `Account` é global e sem RLS (AD-10), então nenhuma policy a protege. Com DELETE,
-- o papel de aplicação apagaria uma conta SEM contexto organizacional nenhum — e a
-- cascata da FK `Membership_accountId_fkey` destruiria os vínculos dessa conta em
-- TODAS as Organizações. Ações referenciais (cascade) rodam com bypass de row
-- security: é comportamento documentado do PostgreSQL, não uma brecha do modelo.
-- Ou seja, o DELETE em `Account` era uma escrita cross-tenant que passava POR BAIXO
-- da RLS. Sem o privilégio, o caminho deixa de existir.
--
-- INSERT/UPDATE também ficam de fora: esta Story não escreve em `Account` em lugar
-- nenhum. A Story que introduzir cadastro/edição de conta concede o que precisar,
-- com o teste que prova o escopo.
GRANT SELECT ON "Account" TO giraffe_app;

-- Organization — leitura e atualização da PRÓPRIA Organização (a policy diz qual).
--
-- Sem INSERT e sem DELETE, por decisão: a Story documenta que o papel de runtime
-- NÃO cria Organizações (o bootstrap do primeiro tenant é da Story 1.4). Só a policy
-- não bastava — `org_insert` é `WITH CHECK ("id" = current_org_id())`, que é
-- AUTO-SATISFAZÍVEL: basta definir o contexto com o UUID que a linha nova vai
-- receber. Quem impede é o GRANT.
GRANT SELECT, UPDATE ON "Organization" TO giraffe_app;

-- Membership — CRUD completo, sempre dentro da Organização do contexto (policies).
GRANT SELECT, INSERT, UPDATE, DELETE ON "Membership" TO giraffe_app;

GRANT EXECUTE ON FUNCTION current_org_id(), current_account_id() TO giraffe_app;
