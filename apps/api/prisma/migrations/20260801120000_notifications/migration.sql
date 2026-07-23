-- Story 5.3 — Fonte única de Notificações (write-side, modelo canônico). DUAS tabelas NOVAS do Épico 5, que
-- SEPARAM (§1570) o evento/conteúdo canônico (`Notification`, APPEND-ONLY imutável) do estado de leitura por
-- destinatário (`NotificationRecipient`, MUTÁVEL/auditável). Base do INV-NOTIF-01. Encadeia DEPOIS de
-- `..._solicitacoes` (5.2).
--
-- Papéis das tabelas:
--  · Notification — conteúdo/evento canônico. Dado org-owned IMUTÁVEL: GRANT só SELECT/INSERT (append-only,
--    como `MembershipEvent`/`CardHistory`/`FormVersion`). Sem UPDATE/DELETE de runtime — o conteúdo é
--    congelado no 1º write e nunca reescrito (reprocessar não sobrescreve).
--  · NotificationRecipient — estado de leitura por destinatário. Ledger MUTÁVEL com GRANT de UPDATE
--    COLUMN-SCOPED só de `readAt`/`availabilityState`/`updatedAt`; identidade/vínculo/dedupe imutáveis por
--    GRANT. Sem DELETE (não se apaga dado do titular — LGPD; suprimir = `availabilityState`).
--
-- Idempotência (§1569): `Notification` tem `@@unique(orgId, sourceEventId, type)` (1 conteúdo por Evento de
-- origem + tipo). `NotificationRecipient` tem `@@unique(orgId, dedupeKey)`, com
-- `dedupeKey = "{sourceEventId}|{type}|{recipientMembershipId}"` — encoda *Org + Evento de origem + tipo +
-- destinatário* num único índice, estável no reprocesso; reprocessar E múltiplos papéis → mesma pessoa
-- colapsam (o serviço usa `createMany({ skipDuplicates })` → ON CONFLICT DO NOTHING, sem duplicidade e sem
-- abort de transação).
--
-- Habilitador tenant-safe: a FK COMPOSTA de `notificationId` referencia `Notification(orgId,id)` — uma FK
-- simples deixaria passar id alheio (a checagem de FK roda com BYPASS de row security). O recurso de origem
-- (`resourceType`/`resourceId`), o ator (`actorId`), o Evento (`sourceEventId`) e o destinatário
-- (`recipientMembershipId`/`recipientUserId`) são REFERÊNCIA-POR-ID sem FK: a Notificação NUNCA concede
-- acesso (a leitura da 5.4 revalida a autz atual); um FK a `Account` (global, sem RLS) com Cascade apagaria
-- destinatários de TODAS as Orgs; um FK composto a Membership é inviável (orgId compartilhado NOT NULL impede
-- SetNull, Cascade quebraria LGPD). Sem backfill (tabelas vazias).
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT E no
-- UPDATE.
--
-- REVERSÍVEL (drill migration-check): ver `prisma/rollback/20260801120000_notifications.down.sql`.

-- CreateEnum
CREATE TYPE "NotificationAvailability" AS ENUM ('AVAILABLE', 'SUPPRESSED');

-- CreateTable Notification (conteúdo/evento canônico; APPEND-ONLY).
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "typeVersion" INTEGER NOT NULL DEFAULT 1,
    "sourceEventId" UUID NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID,
    "actorId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "params" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable NotificationRecipient (estado de leitura por destinatário; MUTÁVEL column-scoped).
CREATE TABLE "NotificationRecipient" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "notificationId" UUID NOT NULL,
    "recipientMembershipId" UUID NOT NULL,
    "recipientUserId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availabilityState" "NotificationAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- Idempotência do CONTEÚDO: 1 Notificação por (Org, Evento de origem, tipo).
CREATE UNIQUE INDEX "Notification_orgId_sourceEventId_type_key" ON "Notification"("orgId", "sourceEventId", "type");
-- Alvo da FK COMPOSTA tenant-safe do filho (NotificationRecipient).
CREATE UNIQUE INDEX "Notification_orgId_id_key" ON "Notification"("orgId", "id");

-- Idempotência do DESTINATÁRIO (o coração da Story): reprocesso E múltiplos papéis → mesma pessoa colapsam.
CREATE UNIQUE INDEX "NotificationRecipient_orgId_dedupeKey_key" ON "NotificationRecipient"("orgId", "dedupeKey");
-- Listar destinatários de uma Notificação.
CREATE INDEX "NotificationRecipient_orgId_notificationId_idx" ON "NotificationRecipient"("orgId", "notificationId");
-- Notificações de um destinatário (base da leitura/contagem da 5.4).
CREATE INDEX "NotificationRecipient_orgId_recipientMembershipId_idx" ON "NotificationRecipient"("orgId", "recipientMembershipId");

-- AddForeignKey (Notification)
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (NotificationRecipient)
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,notificationId)→Notification(orgId,id). Cascade: o destinatário é dado da
-- Notificação. `recipientMembershipId`/`recipientUserId`/`resourceId`/`actorId`/`sourceEventId` NÃO têm FK
-- (referência-por-id — a Notificação nunca concede acesso; ver cabeçalho).
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_orgId_notificationId_fkey"
  FOREIGN KEY ("orgId", "notificationId") REFERENCES "Notification"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Solicitacao/MembershipEvent. ENABLE liga a RLS; FORCE a
-- estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_select ON "Notification"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY notification_insert ON "Notification"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe esses privilégios (append-only imutável).
CREATE POLICY notification_update ON "Notification"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
CREATE POLICY notification_delete ON "Notification"
  FOR DELETE USING ("orgId" = current_org_id());

ALTER TABLE "NotificationRecipient" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationRecipient" FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_recipient_select ON "NotificationRecipient"
  FOR SELECT USING ("orgId" = current_org_id());
CREATE POLICY notification_recipient_insert ON "NotificationRecipient"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- WITH CHECK no UPDATE impede MOVER o registro para outra Org (defesa em profundidade sobre o GRANT).
CREATE POLICY notification_recipient_update ON "NotificationRecipient"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
-- Policy DELETE por simetria/defesa; o runtime NÃO recebe GRANT de DELETE — o dado do titular não é apagável.
CREATE POLICY notification_recipient_delete ON "NotificationRecipient"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
--
-- Notification: SÓ SELECT + INSERT — APPEND-ONLY imutável (como MembershipEvent/CardHistory/FormVersion).
-- Sem UPDATE/DELETE: uma rota que tentasse reescrever/apagar o conteúdo bateria em `permission denied`
-- (provado no `notifications-rls`).
GRANT SELECT, INSERT ON "Notification" TO giraffe_app;

-- NotificationRecipient: SELECT + INSERT + UPDATE **COLUMN-SCOPED** — só `readAt`/`availabilityState`/
-- `updatedAt` (marcar-lido e supressão-na-leitura da 5.4). `notificationId`/`recipient*`/`orgId`/
-- `deliveredAt`/`dedupeKey` NÃO recebem UPDATE: um destinatário não migra de Org/Notificação/pessoa nem tem a
-- dedupe reescrita (tentativa → `permission denied`). SEM DELETE (suprimir = state).
GRANT SELECT, INSERT ON "NotificationRecipient" TO giraffe_app;
GRANT UPDATE ("readAt", "availabilityState", "updatedAt")
  ON "NotificationRecipient" TO giraffe_app;
