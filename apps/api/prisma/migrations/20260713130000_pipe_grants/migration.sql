-- Story 2.2 — PipeGrant: concessão explícita de papel POR Pipe.
--
-- Encadeia DEPOIS da `..._pipes` (Story 2.1): depende da tabela `Pipe`. Isolamento pelas policies de
-- RLS abaixo, no mesmo padrão de `Organization`/`Membership`/`Pipe` — quem NEGA é o banco.

-- CreateEnum
CREATE TYPE "PipeRole" AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "PipeGrantState" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "PipeGrant" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "role" "PipeRole" NOT NULL,
    "state" "PipeGrantState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PipeGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PipeGrant_orgId_pipeId_idx" ON "PipeGrant"("orgId", "pipeId");

-- CreateIndex
CREATE INDEX "PipeGrant_orgId_membershipId_idx" ON "PipeGrant"("orgId", "membershipId");

-- ÍNDICE ÚNICO PARCIAL: no máximo UM papel efetivo (ACTIVE) por (Pipe, pessoa). A parcialidade
-- (WHERE state='ACTIVE') é o que permite REVOGAR e RE-CONCEDER sem colidir — uma concessão revogada
-- não ocupa o slot. O Prisma 6.19.3 não expressa índice parcial no schema (é v7.4+), então ele é
-- criado aqui, em raw SQL, como as policies de RLS. É o BANCO que impede a segunda concessão ativa,
-- não uma checagem de aplicação sujeita a corrida.
CREATE UNIQUE INDEX "PipeGrant_pipeId_membershipId_active_key"
  ON "PipeGrant"("pipeId", "membershipId")
  WHERE "state" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "PipeGrant" ADD CONSTRAINT "PipeGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeGrant" ADD CONSTRAINT "PipeGrant_pipeId_fkey" FOREIGN KEY ("pipeId") REFERENCES "Pipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipeGrant" ADD CONSTRAINT "PipeGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Pipe/Membership.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela (o migrator), para que nem ele
-- escreva/leia fora de contexto. `current_org_id()` devolve NULL sem contexto, e `orgId = NULL` é
-- sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "PipeGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PipeGrant" FORCE ROW LEVEL SECURITY;

-- LEITURA: apenas as concessões da Organização do contexto.
CREATE POLICY pipe_grant_select ON "PipeGrant"
  FOR SELECT USING ("orgId" = current_org_id());

-- ESCRITA (novas linhas): o `orgId` da linha DEVE ser o da Organização do contexto. Sem o WITH CHECK,
-- uma concessão com `orgId` alheio seria aceita e ficaria invisível.
CREATE POLICY pipe_grant_insert ON "PipeGrant"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- ATUALIZAÇÃO (alterar papel, revogar): sempre dentro da Org do contexto, e a linha não pode ser
-- "movida" para outra Org (WITH CHECK).
CREATE POLICY pipe_grant_update ON "PipeGrant"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- EXCLUSÃO: policy por simetria/defesa em profundidade, mas o runtime NÃO recebe GRANT de DELETE —
-- revogar é `state = REVOKED`, não exclusão (preserva a trilha de auditoria). Quem impede o runtime de
-- apagar é o GRANT abaixo, não a policy.
CREATE POLICY pipe_grant_delete ON "PipeGrant"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
--
-- `SELECT, INSERT, UPDATE` cobrem conceder, listar, alterar papel e revogar (state→REVOKED). DELETE
-- fica de fora: revogação é mudança de estado, e a trilha da concessão não deve ser apagável pelo
-- runtime.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "PipeGrant" TO giraffe_app;
