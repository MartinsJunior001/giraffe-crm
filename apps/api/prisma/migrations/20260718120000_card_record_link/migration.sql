-- Story 3.9 — CardRecordLink: vínculo explícito N–N entre Card e Registro.
--
-- Encadeia DEPOIS de `..._records` (Record) e das trilhas de Card/Registro. Aditiva e REVERSÍVEL
-- (rollback = DROP TABLE + DROP TYPE + DROP COLUMN das trilhas). Nenhum dado existente é tocado.
-- Isolamento pelo banco (RLS+FORCE + WITH CHECK), no mesmo padrão de DatabaseGrant/CardGrant — quem NEGA
-- é o banco. `Card ≠ Registro`: entidade DISTINTA, não reusa entidades de Card/Registro.

-- ── Aditivo nas trilhas: correlationId (nullable — eventos anteriores não têm) ──────────────────
-- Correlaciona os eventos LINKED/UNLINKED dos dois lados (mesmo valor). Não é projetado pelas leituras
-- 2.17/3.6 (allowlist não inclui) — sem impacto de vazamento, blindado por construção.
ALTER TABLE "CardHistory" ADD COLUMN "correlationId" UUID;
ALTER TABLE "RecordHistory" ADD COLUMN "correlationId" UUID;
CREATE INDEX "CardHistory_orgId_correlationId_idx" ON "CardHistory"("orgId", "correlationId");
CREATE INDEX "RecordHistory_orgId_correlationId_idx" ON "RecordHistory"("orgId", "correlationId");

-- CreateEnum
CREATE TYPE "CardRecordLinkState" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateTable
CREATE TABLE "CardRecordLink" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "state" "CardRecordLinkState" NOT NULL DEFAULT 'ACTIVE',
    "correlationId" UUID NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "CardRecordLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardRecordLink_orgId_cardId_idx" ON "CardRecordLink"("orgId", "cardId");

-- CreateIndex
CREATE INDEX "CardRecordLink_orgId_recordId_idx" ON "CardRecordLink"("orgId", "recordId");

-- ÍNDICE ÚNICO PARCIAL: no máximo UM vínculo ATIVO por (orgId, cardId, recordId). A parcialidade
-- (WHERE state='ACTIVE') permite desvincular e RE-vincular o mesmo par sem colidir (um vínculo REMOVED não
-- ocupa o slot). O Prisma 6.19.3 não expressa índice parcial no schema; é criado aqui em raw SQL, como as
-- policies. É o BANCO que impede o segundo vínculo ativo do par — não uma checagem de aplicação com corrida.
CREATE UNIQUE INDEX "CardRecordLink_orgId_cardId_recordId_active_key"
  ON "CardRecordLink"("orgId", "cardId", "recordId")
  WHERE "state" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "CardRecordLink" ADD CONSTRAINT "CardRecordLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardRecordLink" ADD CONSTRAINT "CardRecordLink_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardRecordLink" ADD CONSTRAINT "CardRecordLink_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a DatabaseGrant/CardGrant.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO (o migrator). `current_org_id()` devolve NULL sem
-- contexto, e `orgId = NULL` é sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "CardRecordLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardRecordLink" FORCE ROW LEVEL SECURITY;

-- LEITURA: apenas os vínculos da Organização do contexto.
CREATE POLICY card_record_link_select ON "CardRecordLink"
  FOR SELECT USING ("orgId" = current_org_id());

-- ESCRITA (novas linhas): o `orgId` da linha DEVE ser o da Organização do contexto. Sem o WITH CHECK, um
-- vínculo com `orgId` alheio seria aceito e ficaria invisível (cross-tenant silencioso).
CREATE POLICY card_record_link_insert ON "CardRecordLink"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- ATUALIZAÇÃO (desvincular = state→REMOVED): sempre na Org do contexto, e a linha não pode ser "movida"
-- para outra Org (WITH CHECK no USING e no CHECK).
CREATE POLICY card_record_link_update ON "CardRecordLink"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- EXCLUSÃO: policy por simetria/defesa em profundidade, mas o runtime NÃO recebe GRANT de DELETE —
-- desvincular é `state = REMOVED`, não exclusão (preserva a trilha). Quem impede o runtime é o GRANT abaixo.
CREATE POLICY card_record_link_delete ON "CardRecordLink"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
-- `SELECT, INSERT, UPDATE` cobrem vincular, listar e desvincular (state→REMOVED). DELETE fica de fora:
-- desvincular é mudança de estado, e a trilha do vínculo não deve ser apagável pelo runtime.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "CardRecordLink" TO giraffe_app;
