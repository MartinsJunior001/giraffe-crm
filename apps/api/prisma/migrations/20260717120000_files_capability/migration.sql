-- Story 3.7 — Capacidade compartilhada de arquivos (ADR-001): FileObject + FileScan + ScanSlot.
--
-- Capacidade fail-closed (AD-28), DESACOPLADA de Card/Registro (consumidores 3.8/3.10 ligam via porta). Tabelas
-- NOVAS e vazias → sem backfill. Isolamento pelas policies de RLS abaixo (mesmo padrão de Card/Record/Database) —
-- quem NEGA é o banco.
--
-- GRANT como fronteira:
--   * FileObject: SELECT/INSERT + UPDATE COLUMN-SCOPED (state/nomeOriginal/updatedAt/purgedAt), SEM DELETE
--     (remover é `state`; expurgo é do binário no storage, não da linha — LGPD). bucketKey/resourceType/
--     resourceId/orgId ficam SEM UPDATE ("não transferível" — provado por `permission denied`).
--   * FileScan: só SELECT/INSERT (append-only imutável, como FormVersion/CardHistory/RecordHistory).
--   * ScanSlot: SELECT/INSERT/DELETE (semáforo efêmero, global, sem RLS — não guarda dado do titular).

-- CreateEnum
CREATE TYPE "FileState" AS ENUM ('QUARENTENA', 'DISPONIVEL', 'REMOVIDO_LOGICO', 'EXPURGADO', 'BLOCKED');

-- CreateEnum
CREATE TYPE "FileVerdict" AS ENUM ('CLEAN', 'BLOCKED');

-- CreateTable
CREATE TABLE "FileObject" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "state" "FileState" NOT NULL DEFAULT 'QUARENTENA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "FileObject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileScan" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "tamanhoBytes" BIGINT NOT NULL,
    "mimeDetectado" TEXT NOT NULL,
    "sha256Ingest" TEXT NOT NULL,
    "sha256Releitura" TEXT NOT NULL,
    "veredito" "FileVerdict" NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable (GLOBAL — sem RLS, como RateLimit/Account/PublicFormRoute)
CREATE TABLE "ScanSlot" (
    "token" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "expiraEm" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ScanSlot_pkey" PRIMARY KEY ("token")
);

-- CreateIndex: chave opaca globalmente única (integridade — 2 FileObject não apontam para o mesmo objeto).
CREATE UNIQUE INDEX "FileObject_bucketKey_key" ON "FileObject"("bucketKey");

-- CreateIndex: contagem por recurso (limite 10 — Q1) e listagem por recurso.
CREATE INDEX "FileObject_orgId_resourceType_resourceId_idx" ON "FileObject"("orgId", "resourceType", "resourceId");

-- CreateIndex: scans por arquivo.
CREATE INDEX "FileScan_orgId_fileId_idx" ON "FileScan"("orgId", "fileId");

-- CreateIndex: contagem de slots ativos por `key` (teto) e varredura de expirados.
CREATE INDEX "ScanSlot_key_expiraEm_idx" ON "ScanSlot"("key", "expiraEm");

-- AddForeignKey (FileObject)
ALTER TABLE "FileObject" ADD CONSTRAINT "FileObject_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (FileScan)
ALTER TABLE "FileScan" ADD CONSTRAINT "FileScan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FileScan" ADD CONSTRAINT "FileScan_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileObject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Card/Record/Database.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO (o migrator). `current_org_id()` = NULL sem contexto,
-- e `orgId = NULL` é sempre falso ⇒ negado por padrão.
--
-- ScanSlot é GLOBAL (sem RLS) por definição: é semáforo técnico, não dado de tenant. O isolamento é lógico
-- (a `key` embute o `orgId`), como RateLimit.
-- ============================================================================
ALTER TABLE "FileObject" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileObject" FORCE ROW LEVEL SECURITY;

CREATE POLICY file_object_select ON "FileObject"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY file_object_insert ON "FileObject"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- UPDATE dentro da Org do contexto; WITH CHECK impede "mover" a linha para outra Org.
CREATE POLICY file_object_update ON "FileObject"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (remover é `state`).
CREATE POLICY file_object_delete ON "FileObject"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "FileScan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileScan" FORCE ROW LEVEL SECURITY;

CREATE POLICY file_scan_select ON "FileScan"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY file_scan_insert ON "FileScan"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

CREATE POLICY file_scan_update ON "FileScan"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY file_scan_delete ON "FileScan"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (giraffe_app): DML MÍNIMA. Sem DDL, sem ownership.
--
-- FileObject: SELECT/INSERT + UPDATE COLUMN-SCOPED só de `state`/`nomeOriginal`/`updatedAt`/`purgedAt`
-- (ciclo de vida + substituir + expurgo). `bucketKey`/`resourceType`/`resourceId`/`orgId` ficam SEM UPDATE →
-- "não transferível" garantido pelo banco (tentativa bate em `permission denied`). SEM DELETE (LGPD).
--
-- FileScan: SELECT/INSERT apenas — append-only IMUTÁVEL (como FormVersion/CardHistory/RecordHistory).
--
-- ScanSlot: SELECT/INSERT/DELETE — semáforo efêmero; `liberarSlot` apaga a linha. Sem UPDATE (slot não muda;
-- expira ou é liberado).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "FileObject" TO giraffe_app;
GRANT UPDATE ("state", "nomeOriginal", "updatedAt", "purgedAt") ON "FileObject" TO giraffe_app;

GRANT SELECT, INSERT ON "FileScan" TO giraffe_app;

GRANT SELECT, INSERT, DELETE ON "ScanSlot" TO giraffe_app;
