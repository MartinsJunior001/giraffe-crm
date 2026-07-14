-- Story 2.7 — submissão interna do Formulário inicial e criação do Card.
--
-- Uma submissão interna válida CRIA um Card (nunca preenche um existente — D3.3). O Card nasce na 1ª Fase ativa
-- do Pipe, referencia a FormVersion publicada no ato (definição congelada — AD-12), guarda os valores em JSONB
-- chaveado por Field.id (AD-11), e escreve um evento CREATED no CardHistory na MESMA transação (AD-13). O
-- CardHistory é append-only e imutável (GRANT só SELECT+INSERT), como FormVersion. Idempotência por
-- UNIQUE(orgId, formId, idempotencyKey): um retry devolve o Card existente, não duplica.

-- CreateTable Card
CREATE TABLE "Card" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "formId" UUID NOT NULL,
    "formVersionId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "valores" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable CardHistory
CREATE TABLE "CardHistory" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardHistory_pkey" PRIMARY KEY ("id")
);

-- Idempotência: um retry da mesma submissão lógica (mesma chave) não cria um 2º Card.
CREATE UNIQUE INDEX "Card_orgId_formId_idempotencyKey_key" ON "Card"("orgId", "formId", "idempotencyKey");
CREATE INDEX "Card_orgId_pipeId_phaseId_idx" ON "Card"("orgId", "pipeId", "phaseId");
CREATE INDEX "CardHistory_orgId_cardId_createdAt_idx" ON "CardHistory"("orgId", "cardId", "createdAt");

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_pipeId_fkey" FOREIGN KEY ("pipeId") REFERENCES "Pipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Card" ADD CONSTRAINT "Card_formVersionId_fkey" FOREIGN KEY ("formVersionId") REFERENCES "FormVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardHistory" ADD CONSTRAINT "CardHistory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardHistory" ADD CONSTRAINT "CardHistory_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Form/Field/FormVersion/Pipe/Phase.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ============================================================================

-- ── Card ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Card" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Card" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_select ON "Card"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um Card com `orgId` alheio seria aceito e ficaria invisível — submissão cross-tenant.
CREATE POLICY card_insert ON "Card"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Mover o Card entre Fases (2.9) e evoluir estado (2.11) são UPDATE; a linha não pode ser movida para outra Org.
CREATE POLICY card_update ON "Card"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (ver GRANT abaixo).
CREATE POLICY card_delete ON "Card"
  FOR DELETE USING ("orgId" = current_org_id());

-- ── CardHistory ──────────────────────────────────────────────────────────────
ALTER TABLE "CardHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardHistory" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_history_select ON "CardHistory"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY card_history_insert ON "CardHistory"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- UPDATE/DELETE por simetria/defesa; o runtime não recebe GRANT dessas ações (append-only imutável).
CREATE POLICY card_history_update ON "CardHistory"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY card_history_delete ON "CardHistory"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. Card: SOMENTE SELECT+INSERT nesta Story — a 2.7 só CRIA Card (não há UPDATE
-- de Card em runtime), e a regra da casa é conceder um privilégio SÓ com o consumidor concreto e o teste que prova
-- seu escopo. Mover o Card entre Fases (2.9) e evoluir estado (2.11) são UPDATE: a migration daquelas Stories
-- acrescenta `GRANT UPDATE` junto do consumidor e do teste. SEM DELETE (sem exclusão; arquivar é `state` na 2.11).
-- CardHistory: SOMENTE SELECT+INSERT — a trilha de negócio é append-only e imutável; um UPDATE ou DELETE nela
-- bateria em `permission denied`, por decisão de banco, não por ausência de rota.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "Card" TO giraffe_app;
GRANT SELECT, INSERT ON "CardHistory" TO giraffe_app;
