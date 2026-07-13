-- Story 2.1 — Pipe: primeira entidade de domínio do Épico 2.
--
-- O isolamento NÃO é garantido por este DDL, e sim pelas policies de RLS abaixo. Segue o mesmo
-- padrão de `Organization`/`Membership` (migration `..._init_tenancy_rls`): quem NEGA é o banco.

-- CreateEnum
CREATE TYPE "PipeState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Pipe" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "PipeState" NOT NULL DEFAULT 'ACTIVE',
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Pipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pipe_orgId_state_idx" ON "Pipe"("orgId", "state");

-- AddForeignKey
ALTER TABLE "Pipe" ADD CONSTRAINT "Pipe_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Membership.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela (o migrator), para que nem ele
-- escreva/leia fora de contexto. `current_org_id()` (definido em `..._init_tenancy_rls`) devolve
-- NULL sem contexto, e `orgId = NULL` é sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "Pipe" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Pipe" FORCE ROW LEVEL SECURITY;

-- LEITURA: apenas os Pipes da Organização do contexto.
CREATE POLICY pipe_select ON "Pipe"
  FOR SELECT USING ("orgId" = current_org_id());

-- ESCRITA (novas linhas): o `orgId` da linha DEVE ser o da Organização do contexto. Sem o
-- WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível — o vazamento que a
-- Story 1.2 fechou para Membership.
CREATE POLICY pipe_insert ON "Pipe"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- ATUALIZAÇÃO (renomear, arquivar, restaurar, locked/starred): sempre dentro da Org do contexto,
-- e a linha não pode ser "movida" para outra Org (WITH CHECK).
CREATE POLICY pipe_update ON "Pipe"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- EXCLUSÃO: a policy existe por simetria/defesa em profundidade (org-scoped), mas o runtime NÃO
-- recebe o GRANT de DELETE — arquivar é mudança de estado, não exclusão (o épico proíbe exclusão
-- definitiva). Quem impede o runtime de apagar é o GRANT abaixo, não a policy.
CREATE POLICY pipe_delete ON "Pipe"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
--
-- O GRANT é fronteira de segurança por si só. `SELECT, INSERT, UPDATE` cobrem criar, listar,
-- renomear, arquivar (state→ARCHIVED) e restaurar (state→ACTIVE). DELETE fica de fora: "sem
-- exclusão definitiva" (AC3) é garantido AQUI, não só pela ausência de rota.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "Pipe" TO giraffe_app;
