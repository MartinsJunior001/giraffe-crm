-- Story 2.6 — ciclo de publicação dos Formulários. Snapshot JSON imutável versionado (AD-12 / PRD D3.2).
--
-- Publicar congela o rascunho VALIDADO numa `FormVersion` imutável e numerada por Formulário. O rascunho
-- segue sendo `Form`+`Field` normalizado e editável; editar depois NÃO toca versões publicadas. A escolha do
-- snapshot JSON (não tabela relacional por Campo) é o baseline decidido: a forma física é deferida pelo Spine
-- (Deferred) e AD-11 proíbe materializar relação "para preparar o futuro"; nenhum gatilho relacional presente.

-- Ponteiro da versão publicada corrente (número, não FK — evita ciclo Form↔FormVersion; sem risco de ponteiro
-- pendente: versões nunca são deletadas e o ponteiro só é gravado para uma versão criada na mesma transação).
ALTER TABLE "Form" ADD COLUMN "publishedVersion" INTEGER;

-- CreateTable
CREATE TABLE "FormVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "revision" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormVersion_pkey" PRIMARY KEY ("id")
);

-- Numeração monotônica por Formulário: o banco é quem garante que não há número duplicado sob concorrência.
-- Duas publicações simultâneas que calculem o mesmo `version` colidem aqui — uma falha e faz rollback integral.
CREATE UNIQUE INDEX "FormVersion_orgId_formId_version_key" ON "FormVersion"("orgId", "formId", "version");
CREATE INDEX "FormVersion_orgId_formId_idx" ON "FormVersion"("orgId", "formId");

-- AddForeignKey
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FormVersion" ADD CONSTRAINT "FormVersion_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Form/Field/Pipe/Phase.
--
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO da tabela. `current_org_id()` devolve NULL sem contexto,
-- e `orgId = NULL` é sempre falso ⇒ negado por padrão (contexto ausente falha fechado).
-- ============================================================================
ALTER TABLE "FormVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FormVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY form_version_select ON "FormVersion"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um snapshot com `orgId` alheio seria aceito e ficaria invisível — publicação cross-tenant.
CREATE POLICY form_version_insert ON "FormVersion"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies de UPDATE/DELETE por SIMETRIA e defesa em profundidade. O runtime NÃO recebe GRANT dessas ações
-- (ver abaixo): a IMUTABILIDADE é garantida pelo GRANT, não só pela ausência de rota.
CREATE POLICY form_version_update ON "FormVersion"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY form_version_delete ON "FormVersion"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: SOMENTE SELECT e INSERT.
--
-- Uma versão publicada é IMUTÁVEL. Sem GRANT de UPDATE nem DELETE, uma rota que amanhã tentasse alterar ou
-- apagar uma versão bateria em `permission denied` — a imutabilidade é fronteira de banco, não confiança no
-- código. O ponteiro `Form."publishedVersion"` (despublicar/republicar) é UPDATE em `Form`, cujo GRANT já
-- inclui UPDATE — a versão em si permanece intocável.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "FormVersion" TO giraffe_app;
