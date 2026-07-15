-- Story 2.15 — Formulário de Fase e bloqueio de transição.
--
-- Três acréscimos, todos com consumidor concreto nesta Story (sem antecipação):
--
--   • "Field"."required" — obrigatoriedade de Campo. A Fase 1 não tinha obrigatoriedade (2.4-2.7); a 2.15 a introduz
--     e o snapshot da publicação (2.6) passa a capturá-la (o próprio snapshot.ts já previa: "Se um dia um atributo
--     de obrigatoriedade for adicionado ao Campo, ele passa a ser capturado aqui"). É gated ao Formulário de Fase no
--     serviço (o Formulário inicial ignora obrigatoriedade — a submissão da 2.7 permite valor ausente).
--
--   • "Form"."requisitoEntrada"/"requisitoSaida" — MODO do Formulário de Fase (decisão do dono D1): dois booleanos
--     INDEPENDENTES (um Formulário pode ser requisito de entrada E de saída). Ausentes = informativo/opcional. Só
--     fazem sentido em `context='PHASE'`; a config é "config do Pipe" no serviço. "Form" já tem SELECT/INSERT/UPDATE.
--
--   • "CardPhaseValues" — valores do Formulário de Fase por (Card, Fase). Tabela org-owned APPEND-ONLY e IMUTÁVEL
--     (decisão do dono D0/D5), idêntica em isolamento a CardPhaseEntry/CardHistory: RLS ENABLE+FORCE, policies por
--     `current_org_id()`, WITH CHECK no INSERT. `valores` JSONB por `Field.id` (opção por `id` — AD-11/AD-12);
--     referência à `FormVersion` CONGELADA (AD-12: valida-se só contra a versão publicada). O conjunto CORRENTE por
--     (Card, Fase) é a linha mais recente por `createdAt`; a correção posterior é uma NOVA linha (nunca UPDATE), com
--     evento `PHASE_VALUES_CORRECTED` antes/depois no CardHistory. GRANT SÓ SELECT+INSERT — "sem alteração/exclusão
--     retroativa dos valores" é garantido pelo BANCO (UPDATE/DELETE batem em `permission denied`).
--
-- `CardHistory.type` é String — `PHASE_VALUES_CORRECTED` é novo VALOR, sem migration de enum. Sem backfill (tabela
-- nova, sem valores de Fase pré-existentes). REVERSÍVEL: DROP TABLE + DROP COLUMN restauram o estado anterior.

-- AlterTable: obrigatoriedade de Campo (default false — nada muda para Campos/Formulários existentes).
ALTER TABLE "Field" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: modo do Formulário de Fase (dois booleanos independentes; default false = informativo).
ALTER TABLE "Form"
  ADD COLUMN "requisitoEntrada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requisitoSaida"   BOOLEAN NOT NULL DEFAULT false;

-- CreateTable CardPhaseValues (append-only, imutável).
CREATE TABLE "CardPhaseValues" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "formVersionId" UUID NOT NULL,
    "valores" JSONB NOT NULL DEFAULT '{}',
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPhaseValues_pkey" PRIMARY KEY ("id")
);

-- "Conjunto corrente" (linha mais recente por Card+Fase) e histórico das correções.
CREATE INDEX "CardPhaseValues_orgId_cardId_phaseId_createdAt_idx" ON "CardPhaseValues"("orgId", "cardId", "phaseId", "createdAt");

-- AddForeignKey
ALTER TABLE "CardPhaseValues" ADD CONSTRAINT "CardPhaseValues_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPhaseValues" ADD CONSTRAINT "CardPhaseValues_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPhaseValues" ADD CONSTRAINT "CardPhaseValues_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPhaseValues" ADD CONSTRAINT "CardPhaseValues_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a CardPhaseEntry/CardHistory.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ============================================================================
ALTER TABLE "CardPhaseValues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardPhaseValues" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_phase_values_select ON "CardPhaseValues"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY card_phase_values_insert ON "CardPhaseValues"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe GRANT de UPDATE nem DELETE (ver GRANT abaixo):
-- os valores de Fase são APPEND-ONLY e IMUTÁVEIS, como CardPhaseEntry/CardHistory/FormVersion.
CREATE POLICY card_phase_values_update ON "CardPhaseValues"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY card_phase_values_delete ON "CardPhaseValues"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. CardPhaseValues: SÓ SELECT + INSERT — append-only imutável. Registrar ou
-- corrigir valores é INSERT (nova linha); NUNCA UPDATE/DELETE. "Sem alteração/exclusão retroativa dos valores do
-- titular" (também LGPD-friendly) é garantido pelo BANCO. "Field"/"Form" NÃO recebem privilégio novo: já têm
-- SELECT/INSERT/UPDATE (marcar `required` e o modo é UPDATE das colunas novas).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "CardPhaseValues" TO giraffe_app;
