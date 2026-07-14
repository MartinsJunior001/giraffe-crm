-- Story 2.3 — Phase: Fase do fluxo dentro de um Pipe.
--
-- Encadeia DEPOIS da `..._pipe_grants` (Story 2.2): depende da tabela `Pipe`. Isolamento pelas policies de
-- RLS abaixo, no mesmo padrão de `Organization`/`Membership`/`Pipe`/`PipeGrant` — quem NEGA é o banco.

-- CreateEnum
CREATE TYPE "PhaseState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Phase" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "PhaseState" NOT NULL DEFAULT 'ACTIVE',
    "position" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Acesso começa por Org; a listagem por Pipe filtra estado e ordena por position.
CREATE INDEX "Phase_orgId_pipeId_state_position_idx" ON "Phase"("orgId", "pipeId", "state", "position");

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_pipeId_fkey" FOREIGN KEY ("pipeId") REFERENCES "Pipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Pipe/PipeGrant/Membership.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela (o migrator), para que nem ele
-- escreva/leia fora de contexto. `current_org_id()` devolve NULL sem contexto, e `orgId = NULL` é
-- sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "Phase" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Phase" FORCE ROW LEVEL SECURITY;

-- LEITURA: apenas as Fases da Organização do contexto.
CREATE POLICY phase_select ON "Phase"
  FOR SELECT USING ("orgId" = current_org_id());

-- ESCRITA (novas linhas): o `orgId` da linha DEVE ser o da Organização do contexto. Sem o WITH CHECK,
-- uma Fase com `orgId` alheio seria aceita e ficaria invisível.
CREATE POLICY phase_insert ON "Phase"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- ATUALIZAÇÃO (renomear, mover, arquivar, restaurar): sempre dentro da Org do contexto, e a linha não
-- pode ser "movida" para outra Org (WITH CHECK).
CREATE POLICY phase_update ON "Phase"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- EXCLUSÃO: policy por simetria/defesa em profundidade, mas o runtime NÃO recebe GRANT de DELETE —
-- arquivar é `state = ARCHIVED`, não exclusão. Quem impede o runtime de apagar é o GRANT abaixo.
CREATE POLICY phase_delete ON "Phase"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
--
-- `SELECT, INSERT, UPDATE` cobrem criar, listar, renomear, mover (position), arquivar e restaurar
-- (state). DELETE fica de fora: arquivar é mudança de estado, e a Fase não deve ser apagável pelo runtime.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "Phase" TO giraffe_app;
