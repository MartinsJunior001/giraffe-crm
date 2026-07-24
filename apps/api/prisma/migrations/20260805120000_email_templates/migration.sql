-- Story 6.2 — Templates de e-mail versionados (FR-25 · RN-111 · D6.5). DUAS tabelas novas, twin de
-- Form/FormVersion no rigor: `EmailTemplate` (identidade estável, mutável column-scoped) e
-- `EmailTemplateVersion` (versão IMUTÁVEL — GRANT só SELECT/INSERT: e-mails enviados e Execuções
-- iniciadas nunca mudam por edições futuras; é o alvo endereçável da futura referência Ação↔Template,
-- OQ-26/6.6). Encadeia DEPOIS de `..._email_message` (6.1).
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT
-- E no UPDATE; FK COMPOSTA tenant-safe (orgId,templateId)→EmailTemplate(orgId,id) — a checagem de FK
-- roda com bypass de row security (lição 4.1). Sem backfill (tabelas novas). Sem DELETE de runtime em
-- nenhuma das duas (arquivar é `state`; versão é histórico imutável).
--
-- REVERSÍVEL (drill migration-check): ver `prisma/rollback/20260805120000_email_templates.down.sql`.

-- CreateEnum
CREATE TYPE "EmailTemplateState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "EmailTemplateState" NOT NULL DEFAULT 'ACTIVE',
    "activeVersion" INTEGER NOT NULL DEFAULT 0,
    "createdByMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailTemplateVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "authorMembershipId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- Alvo da FK COMPOSTA tenant-safe.
CREATE UNIQUE INDEX "EmailTemplate_orgId_id_key" ON "EmailTemplate"("orgId", "id");
-- Catálogo administrável por estado.
CREATE INDEX "EmailTemplate_orgId_state_idx" ON "EmailTemplate"("orgId", "state");
-- Numeração por Template: concorrência de edição colide aqui (P2002 → 409, padrão 2.6).
CREATE UNIQUE INDEX "EmailTemplateVersion_orgId_templateId_version_key"
  ON "EmailTemplateVersion"("orgId", "templateId", "version");
CREATE INDEX "EmailTemplateVersion_orgId_templateId_idx" ON "EmailTemplateVersion"("orgId", "templateId");

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe: o par prova a co-tenância no banco.
ALTER TABLE "EmailTemplateVersion" ADD CONSTRAINT "EmailTemplateVersion_orgId_templateId_fkey"
  FOREIGN KEY ("orgId", "templateId") REFERENCES "EmailTemplate"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a EmailMessage/FormVersion.
-- ============================================================================
ALTER TABLE "EmailTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY email_template_select ON "EmailTemplate" FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY email_template_insert ON "EmailTemplate" FOR INSERT WITH CHECK ("orgId" = current_org_id());
CREATE POLICY email_template_update ON "EmailTemplate"
  FOR UPDATE USING ("orgId" = current_org_id()) WITH CHECK ("orgId" = current_org_id());
CREATE POLICY email_template_delete ON "EmailTemplate" FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "EmailTemplateVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailTemplateVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY email_template_version_select ON "EmailTemplateVersion" FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY email_template_version_insert ON "EmailTemplateVersion" FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe esses privilégios (imutável).
CREATE POLICY email_template_version_update ON "EmailTemplateVersion"
  FOR UPDATE USING ("orgId" = current_org_id()) WITH CHECK ("orgId" = current_org_id());
CREATE POLICY email_template_version_delete ON "EmailTemplateVersion" FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. O GRANT é FRONTEIRA de segurança.
-- EmailTemplate: UPDATE COLUMN-SCOPED (nome/estado/ponteiro); `orgId`/autoria imutáveis; SEM DELETE.
GRANT SELECT, INSERT ON "EmailTemplate" TO giraffe_app;
GRANT UPDATE ("name", "state", "activeVersion", "updatedAt") ON "EmailTemplate" TO giraffe_app;
-- EmailTemplateVersion: SÓ SELECT + INSERT — IMUTÁVEL pelo banco (como FormVersion).
GRANT SELECT, INSERT ON "EmailTemplateVersion" TO giraffe_app;
