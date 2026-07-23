-- Story 5.4 — Notificações: superfícies, leitura e preferências. UMA tabela NOVA: `NotificationPreference`
-- (preferência de Notificação por tipo, do usuário na Organização — R6). Encadeia DEPOIS de
-- `..._notifications` (5.3). As tabelas da 5.3 (`Notification`/`NotificationRecipient`) NÃO são tocadas: a
-- leitura reusa o GRANT `SELECT`, marcar-lido reusa o `UPDATE(readAt)` column-scoped — sem GRANT novo neles.
--
-- Papel da tabela:
--  · NotificationPreference — a escolha do usuário (habilitar/silenciar) por tipo. Silenciar altera as ENTREGAS
--    FUTURAS e o que as superfícies exibem/contam; NUNCA apaga Notificações anteriores (o histórico é imutável;
--    a preferência é read-side). GRANT SELECT/INSERT + UPDATE COLUMN-SCOPED (só `enabled`/`updatedAt`) — sem
--    DELETE (mudar preferência é UPDATE/upsert, nunca remover linha). `orgId`/`membershipId`/`type` imutáveis
--    por GRANT (a identidade da preferência não migra).
--
-- Unicidade lógica: `@@unique(orgId, membershipId, type)` — 1 preferência por (Org, pessoa, tipo), base do
-- UPSERT (mudar preferência não duplica). `membershipId` é REFERÊNCIA-POR-ID sem FK (como
-- `NotificationRecipient.recipientMembershipId`/`CardResponsavel`: FK composta a Membership é inviável — orgId
-- compartilhado NOT NULL impede SetNull; Cascade quebraria LGPD). `type` é `String` estrutural (catálogo = 5.6).
-- Sem backfill (tabela nova).
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT E no
-- UPDATE.
--
-- REVERSÍVEL (drill migration-check): ver `prisma/rollback/20260802120000_notification_preferences.down.sql`.

-- CreateTable NotificationPreference (preferência por tipo; MUTÁVEL column-scoped).
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- 1 preferência por (Org, pessoa, tipo) — base do UPSERT (mudar preferência = UPDATE, nunca duplica).
CREATE UNIQUE INDEX "NotificationPreference_orgId_membershipId_type_key"
  ON "NotificationPreference"("orgId", "membershipId", "type");
-- Carregar todas as preferências de um usuário (resolução efetiva na leitura das superfícies).
CREATE INDEX "NotificationPreference_orgId_membershipId_idx"
  ON "NotificationPreference"("orgId", "membershipId");

-- AddForeignKey (orgId → Organization). `membershipId` NÃO tem FK (referência-por-id; ver cabeçalho).
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a NotificationRecipient/Solicitacao. ENABLE liga a RLS; FORCE a
-- estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_preference_select ON "NotificationPreference"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY notification_preference_insert ON "NotificationPreference"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- WITH CHECK no UPDATE impede MOVER o registro para outra Org (defesa em profundidade sobre o GRANT).
CREATE POLICY notification_preference_update ON "NotificationPreference"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
-- Policy DELETE por simetria/defesa; o runtime NÃO recebe GRANT de DELETE — preferência não é apagável.
CREATE POLICY notification_preference_delete ON "NotificationPreference"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
--
-- NotificationPreference: SELECT + INSERT + UPDATE **COLUMN-SCOPED** — só `enabled`/`updatedAt` (setar a
-- preferência). `orgId`/`membershipId`/`type` NÃO recebem UPDATE: a identidade da preferência não migra de
-- Org/pessoa/tipo (tentativa → `permission denied`, provado no `notification-preferences-rls`). SEM DELETE
-- (mudar preferência é UPDATE/upsert, nunca remover linha).
GRANT SELECT, INSERT ON "NotificationPreference" TO giraffe_app;
GRANT UPDATE ("enabled", "updatedAt") ON "NotificationPreference" TO giraffe_app;
