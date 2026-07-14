-- Story 2.8 — submissão pública controlada e triagem.
--
-- Só o Formulário inicial pode ser público (opt-in por Form). O ator externo não recebe acesso; vê só
-- confirmação. Modo TRIAGE (padrão): a submissão vira uma SubmissaoPublica PENDING e NÃO cria Card até aprovar;
-- modo DIRECT: cria 1 Card. Aprovar cria 1 Card (origem PUBLIC) e marca CONVERTED com cardId na MESMA transação
-- (idempotente: CONVERTED é terminal, cardId único); rejeitar preserva (sem DELETE — LGPD/NFR-8).
--
-- PublicFormRoute é GLOBAL e SEM RLS (como Account): resolve o tenant por um publicId opaco ANTES de haver
-- contexto. Guarda só publicId/orgId/formId (sem PII). O servidor resolve (orgId, formId), entra em contexto e
-- relê o Form sob RLS antes de escrever; nunca aceita orgId/formId do cliente.

-- CreateEnum
CREATE TYPE "PublicFormMode" AS ENUM ('TRIAGE', 'DIRECT');
CREATE TYPE "CardOrigin" AS ENUM ('INTERNAL', 'PUBLIC');
CREATE TYPE "SubmissaoPublicaState" AS ENUM ('PENDING', 'CONVERTED', 'REJECTED');

-- AlterTable Form: opt-in público (só PIPE_INITIAL — CHECK abaixo).
ALTER TABLE "Form" ADD COLUMN "publicEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Form" ADD COLUMN "publicMode" "PublicFormMode" NOT NULL DEFAULT 'TRIAGE';
-- "Só o Formulário inicial pode ser público" (PRD D3.2): público exige context = PIPE_INITIAL.
ALTER TABLE "Form" ADD CONSTRAINT "Form_public_only_initial"
  CHECK (NOT "publicEnabled" OR "context" = 'PIPE_INITIAL');

-- AlterTable Card: origem registrada (INTERNAL 2.7 / PUBLIC 2.8).
ALTER TABLE "Card" ADD COLUMN "origin" "CardOrigin" NOT NULL DEFAULT 'INTERNAL';

-- AlterTable PipeGrant: capacidade explícita "Revisar submissões públicas" (deny-by-default).
ALTER TABLE "PipeGrant" ADD COLUMN "reviewPublicSubmissions" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable SubmissaoPublica (org-scoped).
CREATE TABLE "SubmissaoPublica" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "formVersionId" UUID NOT NULL,
    "state" "SubmissaoPublicaState" NOT NULL DEFAULT 'PENDING',
    "valores" JSONB NOT NULL DEFAULT '{}',
    "cardId" UUID,
    "idempotencyKey" TEXT,
    "decidedBy" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubmissaoPublica_pkey" PRIMARY KEY ("id")
);

-- CreateTable PublicFormRoute (GLOBAL, sem RLS).
CREATE TABLE "PublicFormRoute" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "orgId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PublicFormRoute_pkey" PRIMARY KEY ("id")
);

-- Índices e unicidades.
-- Uma submissão convertida aponta no máximo um Card (idempotência da conversão; NULLs não colidem no PG).
CREATE UNIQUE INDEX "SubmissaoPublica_cardId_key" ON "SubmissaoPublica"("cardId");
-- Dedup de reenvio público por Formulário (NULL idempotencyKey não deduplica).
CREATE UNIQUE INDEX "SubmissaoPublica_orgId_formId_idempotencyKey_key" ON "SubmissaoPublica"("orgId", "formId", "idempotencyKey");
CREATE INDEX "SubmissaoPublica_orgId_formId_state_idx" ON "SubmissaoPublica"("orgId", "formId", "state");
CREATE UNIQUE INDEX "PublicFormRoute_publicId_key" ON "PublicFormRoute"("publicId");
CREATE INDEX "PublicFormRoute_formId_idx" ON "PublicFormRoute"("formId");

-- AddForeignKey
ALTER TABLE "SubmissaoPublica" ADD CONSTRAINT "SubmissaoPublica_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissaoPublica" ADD CONSTRAINT "SubmissaoPublica_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissaoPublica" ADD CONSTRAINT "SubmissaoPublica_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissaoPublica" ADD CONSTRAINT "SubmissaoPublica_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PublicFormRoute" ADD CONSTRAINT "PublicFormRoute_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicFormRoute" ADD CONSTRAINT "PublicFormRoute_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — SubmissaoPublica é org-scoped: replica Card/Form.
-- PublicFormRoute é GLOBAL e SEM RLS por definição (resolve o tenant ANTES do contexto — como Account).
-- ============================================================================

-- ── SubmissaoPublica ──────────────────────────────────────────────────────────
ALTER TABLE "SubmissaoPublica" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubmissaoPublica" FORCE ROW LEVEL SECURITY;

CREATE POLICY submissao_publica_select ON "SubmissaoPublica"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem WITH CHECK, uma submissão com orgId alheio seria aceita e ficaria invisível — submissão cross-tenant.
CREATE POLICY submissao_publica_insert ON "SubmissaoPublica"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Triagem (aprovar/rejeitar) é UPDATE de estado; a linha não pode ser movida para outra Org.
CREATE POLICY submissao_publica_update ON "SubmissaoPublica"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (preserva por LGPD).
CREATE POLICY submissao_publica_delete ON "SubmissaoPublica"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação.
-- SubmissaoPublica: SELECT/INSERT/UPDATE (cria a submissão; a triagem atualiza estado), SEM DELETE —
--   "preserva a submissão conforme Governança/LGPD" (PRD D3.3) é fronteira de banco, não ausência de rota.
-- PublicFormRoute: SELECT (resolver o tenant por publicId, PRÉ-contexto) + INSERT/UPDATE (habilitar/revogar/
--   rotacionar pela config autenticada), SEM DELETE (revogar é `active=false`, preserva a trilha). SEM RLS:
--   o mapa opaco não tem PII e a resolução não pode depender de um contexto que ainda não existe.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "SubmissaoPublica" TO giraffe_app;
GRANT SELECT, INSERT, UPDATE ON "PublicFormRoute" TO giraffe_app;
