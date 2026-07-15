-- Story 2.16 — Evento canônico de movimentação (contrato opt-in).
--
-- Uma tabela nova, com consumidor concreto NESTA Story (o produtor: a movimentação da 2.14):
--
--   • "MovementEvent" — persistência confiável do tipo OUTBOX do evento canônico de movimentação (AD-13: o registro
--     do evento de integração é confirmado ATOMICAMENTE com a movimentação; o processamento assíncrono, se houver,
--     vem depois). Trilha de INTEGRAÇÃO, DISTINTA do Histórico do Card e das demais trilhas (AD-15). Consumo por E4
--     (Automação) e E5 (Notificação) — NÃO implementados aqui (sem publisher/fila/consumidor sem consumidor concreto,
--     Constitution II). Tabela org-owned APPEND-ONLY e IMUTÁVEL: RLS ENABLE+FORCE, policies por `current_org_id()`,
--     WITH CHECK no INSERT. `eventId` DETERMINÍSTICO por operação (uuidv5(orgId+cardId+correlationId)) com UNIQUE
--     `(orgId, eventId)` — reprocessamento reproduz o mesmo `eventId`; o índice impede duplicata lógica (CA3).
--     GRANT SÓ SELECT+INSERT — "sem alteração/exclusão do evento" é garantido pelo BANCO (UPDATE/DELETE batem em
--     `permission denied`), como CardHistory/FormVersion/CardPhaseEntry/CardPhaseValues.
--
-- Sem enum (origin/type são String — vocabulário estável). Sem backfill (tabela nova). REVERSÍVEL: DROP TABLE
-- restaura o estado anterior.

-- CreateTable MovementEvent (append-only, imutável).
CREATE TABLE "MovementEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "sourcePhaseId" UUID NOT NULL,
    "targetPhaseId" UUID NOT NULL,
    "actorId" UUID,
    "origin" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovementEvent_pkey" PRIMARY KEY ("id")
);

-- Um reprocessamento não cria um 2º evento lógico (idempotência — CA3).
CREATE UNIQUE INDEX "MovementEvent_orgId_eventId_key" ON "MovementEvent"("orgId", "eventId");
-- Leitura da trilha por Card (cronológica) e correlação com a operação.
CREATE INDEX "MovementEvent_orgId_cardId_occurredAt_idx" ON "MovementEvent"("orgId", "cardId", "occurredAt");
CREATE INDEX "MovementEvent_orgId_correlationId_idx" ON "MovementEvent"("orgId", "correlationId");

-- AddForeignKey
ALTER TABLE "MovementEvent" ADD CONSTRAINT "MovementEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovementEvent" ADD CONSTRAINT "MovementEvent_pipeId_fkey" FOREIGN KEY ("pipeId") REFERENCES "Pipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovementEvent" ADD CONSTRAINT "MovementEvent_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovementEvent" ADD CONSTRAINT "MovementEvent_sourcePhaseId_fkey" FOREIGN KEY ("sourcePhaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MovementEvent" ADD CONSTRAINT "MovementEvent_targetPhaseId_fkey" FOREIGN KEY ("targetPhaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a CardPhaseEntry/CardPhaseValues/CardHistory.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ============================================================================
ALTER TABLE "MovementEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MovementEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY movement_event_select ON "MovementEvent"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY movement_event_insert ON "MovementEvent"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe GRANT de UPDATE nem DELETE (ver GRANT abaixo):
-- o evento canônico é APPEND-ONLY e IMUTÁVEL, como as demais trilhas de registro.
CREATE POLICY movement_event_update ON "MovementEvent"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY movement_event_delete ON "MovementEvent"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. MovementEvent: SÓ SELECT + INSERT — append-only imutável. Emitir o evento é
-- INSERT (nova linha); NUNCA UPDATE/DELETE. "Sem alteração/exclusão do evento canônico" é garantido pelo BANCO.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "MovementEvent" TO giraffe_app;
