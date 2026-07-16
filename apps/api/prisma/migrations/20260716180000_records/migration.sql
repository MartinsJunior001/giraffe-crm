-- Story 3.4 — Record (Registro) + RecordHistory (write-side do Histórico, append-only).
--
-- 1ª entidade de DADO DO TITULAR do Database. Encadeia DEPOIS de `..._database_forms` (3.3): o Registro
-- referencia a `FormVersion` publicada do Formulário de Database. **Card ≠ Registro** (invariante): entidade
-- DISTINTA — reusa a LÓGICA de submissão (2.7)/ciclo de vida (2.11), nunca as entidades de Card. Isolamento
-- pelas policies de RLS abaixo (mesmo padrão de Card/Database) — quem NEGA é o banco.
--
-- Tabelas NOVAS e vazias → sem backfill. GRANT como fronteira: Record com UPDATE column-scoped
-- (lifecycleState/valores/updatedAt) e SEM DELETE (sem exclusão física — LGPD; arquivar é `state`);
-- RecordHistory só SELECT/INSERT (append-only imutável, como CardHistory/FormVersion).

-- CreateEnum
CREATE TYPE "RecordLifecycleState" AS ENUM ('ATIVO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "RecordOrigin" AS ENUM ('NOVO_REGISTRO');

-- CreateTable
CREATE TABLE "Record" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "databaseId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "formVersionId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "valores" JSONB NOT NULL DEFAULT '{}',
    "origin" "RecordOrigin" NOT NULL DEFAULT 'NOVO_REGISTRO',
    "lifecycleState" "RecordLifecycleState" NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordHistory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "recordId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: consulta por Database (a 3.5 consumirá).
CREATE INDEX "Record_orgId_databaseId_idx" ON "Record"("orgId", "databaseId");

-- ÍNDICE ÚNICO DE IDEMPOTÊNCIA: um retry da MESMA operação lógica (mesma idempotencyKey) não cria um 2º
-- Registro no mesmo Database. Escopo por (Org, Database, chave) — o Registro pertence a 1 Database. O Prisma
-- 6.19.3 não expressa este índice único composto fora do schema? expressa via @@unique; mantido aqui em raw SQL
-- por paridade com o padrão de idempotência de Card (2.7) e para deixar explícita a fronteira de concorrência.
CREATE UNIQUE INDEX "Record_orgId_databaseId_idempotencyKey_key"
  ON "Record"("orgId", "databaseId", "idempotencyKey");

-- CreateIndex: timeline do Registro (a 3.6 read-side consumirá).
CREATE INDEX "RecordHistory_orgId_recordId_createdAt_idx" ON "RecordHistory"("orgId", "recordId", "createdAt");

-- AddForeignKey (Record)
ALTER TABLE "Record" ADD CONSTRAINT "Record_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Record" ADD CONSTRAINT "Record_databaseId_fkey" FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Record" ADD CONSTRAINT "Record_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Record" ADD CONSTRAINT "Record_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (RecordHistory)
ALTER TABLE "RecordHistory" ADD CONSTRAINT "RecordHistory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordHistory" ADD CONSTRAINT "RecordHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "Record"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Card/Database.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO (o migrator). `current_org_id()` = NULL sem contexto,
-- e `orgId = NULL` é sempre falso ⇒ negado por padrão.
-- ============================================================================
ALTER TABLE "Record" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Record" FORCE ROW LEVEL SECURITY;

CREATE POLICY record_select ON "Record"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY record_insert ON "Record"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- UPDATE dentro da Org do contexto; WITH CHECK impede "mover" a linha para outra Org.
CREATE POLICY record_update ON "Record"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (arquivar é `state`).
CREATE POLICY record_delete ON "Record"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "RecordHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecordHistory" FORCE ROW LEVEL SECURITY;

CREATE POLICY record_history_select ON "RecordHistory"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY record_history_insert ON "RecordHistory"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

CREATE POLICY record_history_update ON "RecordHistory"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY record_history_delete ON "RecordHistory"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (giraffe_app): DML MÍNIMA. Sem DDL, sem ownership.
--
-- Record: SELECT/INSERT (criar/ler) + UPDATE COLUMN-SCOPED só de `lifecycleState`/`valores`/`updatedAt`
-- (ciclo de vida 2.11 + edição de valores 3.4). `databaseId`/`formVersionId`/`orgId`/`origin`/`idempotencyKey`/
-- `formId` ficam SEM UPDATE → "não transferível" (RN-063) e "definição congelada" (AD-12) são garantidos pelo
-- banco: uma tentativa de reatribuir bate em `permission denied`. SEM DELETE (sem exclusão física — LGPD).
--
-- RecordHistory: SELECT/INSERT apenas — append-only IMUTÁVEL (como CardHistory/FormVersion). Sem UPDATE/DELETE.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "Record" TO giraffe_app;
GRANT UPDATE ("lifecycleState", "valores", "updatedAt") ON "Record" TO giraffe_app;

GRANT SELECT, INSERT ON "RecordHistory" TO giraffe_app;
