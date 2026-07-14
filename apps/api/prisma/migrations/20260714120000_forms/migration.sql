-- Story 2.4 — Form + Field: domínio Formulário (catálogo canônico + montagem).
--
-- Encadeia DEPOIS da `..._phases` (Story 2.3): `Form` referencia `Pipe` e `Phase`. Isolamento pelas policies
-- de RLS abaixo, no mesmo padrão de `Pipe`/`Phase` — quem NEGA é o banco.

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM (
    'TEXT_SHORT', 'TEXT_LONG', 'NUMBER', 'SELECT_SINGLE', 'SELECT_MULTI', 'BOOLEAN',
    'DATE', 'DATETIME', 'EMAIL', 'PHONE', 'URL', 'FILE'
);

-- CreateEnum
CREATE TYPE "FormContext" AS ENUM ('PIPE_INITIAL', 'PHASE', 'DATABASE');

-- CreateEnum
CREATE TYPE "FieldState" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Form" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "context" "FormContext" NOT NULL,
    "pipeId" UUID,
    "phaseId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL,
    "help" TEXT,
    "typeConfig" JSONB NOT NULL DEFAULT '{}',
    "defaultValue" JSONB,
    "position" DECIMAL(38,18) NOT NULL,
    "state" "FieldState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Form_orgId_pipeId_idx" ON "Form"("orgId", "pipeId");
CREATE INDEX "Form_orgId_phaseId_idx" ON "Form"("orgId", "phaseId");
CREATE INDEX "Field_orgId_formId_state_position_idx" ON "Field"("orgId", "formId", "state", "position");

-- ----------------------------------------------------------------------------
-- Coerência contexto↔owner (o Prisma não expressa CHECK). Exatamente UM owner casa o contexto; `DATABASE`
-- não tem coluna de owner nesta Story (contrato do E3) — logo nenhuma linha `context='DATABASE'` é válida
-- para inserir aqui, por construção (ambos os owners nulos ⇒ o CHECK abaixo a rejeita).
-- ----------------------------------------------------------------------------
ALTER TABLE "Form" ADD CONSTRAINT "Form_context_owner_ck" CHECK (
    ("context" = 'PIPE_INITIAL' AND "pipeId" IS NOT NULL AND "phaseId" IS NULL) OR
    ("context" = 'PHASE'        AND "phaseId" IS NOT NULL AND "pipeId" IS NULL)
);

-- Unicidade "um Form por owner+contexto" — índices únicos PARCIAIS (não expressáveis no Prisma 6.19.3).
CREATE UNIQUE INDEX "Form_pipe_initial_uq" ON "Form"("orgId", "pipeId") WHERE "context" = 'PIPE_INITIAL';
CREATE UNIQUE INDEX "Form_phase_uq" ON "Form"("orgId", "phaseId") WHERE "context" = 'PHASE';

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Form" ADD CONSTRAINT "Form_pipeId_fkey" FOREIGN KEY ("pipeId") REFERENCES "Pipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Form" ADD CONSTRAINT "Form_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Field" ADD CONSTRAINT "Field_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Field" ADD CONSTRAINT "Field_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Pipe/Phase/PipeGrant/Membership.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela (o migrator), para que nem ele escreva/leia
-- fora de contexto. `current_org_id()` devolve NULL sem contexto, e `orgId = NULL` é sempre falso ⇒ negado
-- por padrão.
-- ============================================================================

-- ── Form ────────────────────────────────────────────────────────────────────
ALTER TABLE "Form" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Form" FORCE ROW LEVEL SECURITY;

CREATE POLICY form_select ON "Form"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um Form com `orgId` alheio seria aceito e ficaria invisível.
CREATE POLICY form_insert ON "Form"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Sempre dentro da Org do contexto; a linha não pode ser "movida" para outra Org (WITH CHECK).
CREATE POLICY form_update ON "Form"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (ver GRANT abaixo).
CREATE POLICY form_delete ON "Form"
  FOR DELETE USING ("orgId" = current_org_id());

-- ── Field ───────────────────────────────────────────────────────────────────
ALTER TABLE "Field" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Field" FORCE ROW LEVEL SECURITY;

CREATE POLICY field_select ON "Field"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY field_insert ON "Field"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

CREATE POLICY field_update ON "Field"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY field_delete ON "Field"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership, SEM DELETE.
--
-- `SELECT, INSERT, UPDATE` cobrem obter (getOrCreate), listar, adicionar Campo, reordenar (position) e — na
-- 2.5 — arquivar/restaurar (state). DELETE fica de fora: "sem exclusão definitiva" é fronteira de banco.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "Form" TO giraffe_app;
GRANT SELECT, INSERT, UPDATE ON "Field" TO giraffe_app;
