-- Story 3.2 — DatabaseGrant: concessão explícita de papel POR Database.
--
-- Encadeia DEPOIS da `..._database_grants` depende de `Database` (Story 3.1) e `Membership`. Twin
-- estrutural de `..._pipe_grants` (2.2), entidade DISTINTA (Database ≠ Pipe — RN-061). Isolamento pelas
-- policies de RLS abaixo, no mesmo padrão de `PipeGrant`/`Membership` — quem NEGA é o banco.

-- CreateEnum
CREATE TYPE "DatabaseRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "DatabaseGrantState" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "DatabaseGrant" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "databaseId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "role" "DatabaseRole" NOT NULL,
    "state" "DatabaseGrantState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DatabaseGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DatabaseGrant_orgId_databaseId_idx" ON "DatabaseGrant"("orgId", "databaseId");

-- CreateIndex
CREATE INDEX "DatabaseGrant_orgId_membershipId_idx" ON "DatabaseGrant"("orgId", "membershipId");

-- ÍNDICE ÚNICO PARCIAL: no máximo UM papel efetivo (ACTIVE) por (Database, pessoa). A parcialidade
-- (WHERE state='ACTIVE') é o que permite REVOGAR e RE-CONCEDER sem colidir — uma concessão revogada
-- não ocupa o slot. O Prisma 6.19.3 não expressa índice parcial no schema (é v7.4+), então ele é
-- criado aqui, em raw SQL, como as policies de RLS. É o BANCO que impede a segunda concessão ativa,
-- não uma checagem de aplicação sujeita a corrida.
CREATE UNIQUE INDEX "DatabaseGrant_databaseId_membershipId_active_key"
  ON "DatabaseGrant"("databaseId", "membershipId")
  WHERE "state" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "DatabaseGrant" ADD CONSTRAINT "DatabaseGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseGrant" ADD CONSTRAINT "DatabaseGrant_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseGrant" ADD CONSTRAINT "DatabaseGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a PipeGrant/Membership.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela (o migrator), para que nem ele
-- escreva/leia fora de contexto. `current_org_id()` devolve NULL sem contexto, e `orgId = NULL` é
-- sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "DatabaseGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DatabaseGrant" FORCE ROW LEVEL SECURITY;

-- LEITURA: apenas as concessões da Organização do contexto.
CREATE POLICY database_grant_select ON "DatabaseGrant"
  FOR SELECT USING ("orgId" = current_org_id());

-- ESCRITA (novas linhas): o `orgId` da linha DEVE ser o da Organização do contexto. Sem o WITH CHECK,
-- uma concessão com `orgId` alheio seria aceita e ficaria invisível.
CREATE POLICY database_grant_insert ON "DatabaseGrant"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- ATUALIZAÇÃO (alterar papel, revogar): sempre dentro da Org do contexto, e a linha não pode ser
-- "movida" para outra Org (WITH CHECK).
CREATE POLICY database_grant_update ON "DatabaseGrant"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- EXCLUSÃO: policy por simetria/defesa em profundidade, mas o runtime NÃO recebe GRANT de DELETE —
-- revogar é `state = REVOKED`, não exclusão (preserva a trilha de auditoria). Quem impede o runtime de
-- apagar é o GRANT abaixo, não a policy.
CREATE POLICY database_grant_delete ON "DatabaseGrant"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
--
-- `SELECT, INSERT, UPDATE` cobrem conceder, listar, alterar papel e revogar (state→REVOKED). DELETE
-- fica de fora: revogação é mudança de estado, e a trilha da concessão não deve ser apagável pelo
-- runtime.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "DatabaseGrant" TO giraffe_app;
