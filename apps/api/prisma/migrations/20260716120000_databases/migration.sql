-- Story 3.1 — Database: primeira entidade de domínio do Épico 3.
--
-- Twin ESTRUTURAL de `Pipe` (Story 2.1), entidade DISTINTA (Database ≠ Pipe — RN-061): tabela,
-- catálogo, subject e módulo próprios. O isolamento NÃO é garantido por este DDL, e sim pelas
-- policies de RLS abaixo — quem NEGA é o banco, como em `Organization`/`Membership`/`Pipe`.

-- CreateEnum
CREATE TYPE "DatabaseState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Database" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "DatabaseState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Database_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Database_orgId_state_idx" ON "Database"("orgId", "state");

-- AddForeignKey
ALTER TABLE "Database" ADD CONSTRAINT "Database_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Pipe/Membership.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela (o migrator), para que nem ele
-- escreva/leia fora de contexto. `current_org_id()` (definido em `..._init_tenancy_rls`) devolve
-- NULL sem contexto, e `orgId = NULL` é sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "Database" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Database" FORCE ROW LEVEL SECURITY;

-- LEITURA: apenas os Databases da Organização do contexto.
CREATE POLICY database_select ON "Database"
  FOR SELECT USING ("orgId" = current_org_id());

-- ESCRITA (novas linhas): o `orgId` da linha DEVE ser o da Organização do contexto. Sem o
-- WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível.
CREATE POLICY database_insert ON "Database"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- ATUALIZAÇÃO (renomear, arquivar, restaurar): sempre dentro da Org do contexto, e a linha não
-- pode ser "movida" para outra Org (WITH CHECK no UPDATE).
CREATE POLICY database_update ON "Database"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- EXCLUSÃO: a policy existe por simetria/defesa em profundidade (org-scoped), mas o runtime NÃO
-- recebe o GRANT de DELETE — arquivar é mudança de estado, não exclusão (o épico proíbe exclusão
-- definitiva). Quem impede o runtime de apagar é o GRANT abaixo, não a policy.
CREATE POLICY database_delete ON "Database"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
--
-- `SELECT, INSERT, UPDATE` cobrem criar, listar, renomear, arquivar (state→ARCHIVED) e restaurar
-- (state→ACTIVE). DELETE fica de fora: "sem exclusão definitiva" (AC4) é garantido AQUI, não só
-- pela ausência de rota — uma rota de DELETE acrescentada por engano bateria em `permission denied`.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "Database" TO giraffe_app;
