-- Story 6.1 — Modelo canônico de e-mail e Composer (FR-24 · D6.5/D3.6 · RN-110). UMA tabela nova, com
-- consumidor concreto NESTA Story (o módulo `emails/`). Encadeia DEPOIS de `..._task_request_idempotency`.
--
-- EmailMessage — o e-mail outbound canônico: pertence a exatamente 1 Organização; associável a 0..1 Card da
-- MESMA Org por FK COMPOSTA tenant-safe (a checagem de FK roda com BYPASS de row security — uma FK simples
-- deixaria passar `cardId` alheio, lição da 4.1); a associação NÃO concede acesso em nenhum sentido.
-- Ledger MUTÁVEL enquanto DRAFT: GRANT de UPDATE **COLUMN-SCOPED** só de conteúdo/estado/vínculo — a
-- identidade (`orgId`) e a autoria (`createdByMembershipId`) são imutáveis por GRANT. A imutabilidade
-- pós-SUBMITTED é aplicada pelo serviço com guarda otimista (`updateMany where state='DRAFT'` → 409) —
-- estado não é expressável em GRANT; a defesa do banco aqui é o RLS + o column-scope + SEM DELETE
-- (descartar é `state` — LGPD: o dado do titular é preservado). SEM envio real (6.4, AD-28: nenhuma
-- credencial/porta de provedor nesta Story).
--
-- Isolamento pelo BANCO (AD-6): RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no INSERT E
-- no UPDATE. Sem backfill (tabela nova). `Card(orgId,id)` já é único (migration da 5.1).
--
-- REVERSÍVEL (drill migration-check): ver `prisma/rollback/20260804120000_email_message.down.sql`.

-- CreateEnum
CREATE TYPE "EmailState" AS ENUM ('DRAFT', 'SUBMITTED', 'DISCARDED');

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID,
    "state" "EmailState" NOT NULL DEFAULT 'DRAFT',
    "recipients" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "createdByMembershipId" UUID NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- E-mails no contexto de um Card (vários por Card — RN-110/RN-114).
CREATE INDEX "EmailMessage_orgId_cardId_idx" ON "EmailMessage"("orgId", "cardId");
-- Rascunhos/enviados do autor (leitura do autor; histórico geral é 6.4).
CREATE INDEX "EmailMessage_orgId_createdByMembershipId_idx" ON "EmailMessage"("orgId", "createdByMembershipId");

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,cardId)→Card(orgId,id), nulável (MATCH SIMPLE não checa com NULL).
-- Cascade como Task.card: só dispara no expurgo do dono (o runtime não tem DELETE em Card).
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_orgId_cardId_fkey"
  FOREIGN KEY ("orgId", "cardId") REFERENCES "Card"("orgId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Task/Card. ENABLE liga a RLS; FORCE a estende ao PRÓPRIO
-- DONO. `current_org_id()` NULL sem contexto ⇒ negado (deny-by-default).
-- ============================================================================
ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" FORCE ROW LEVEL SECURITY;

CREATE POLICY email_message_select ON "EmailMessage"
  FOR SELECT USING ("orgId" = current_org_id());
-- Sem o WITH CHECK, um INSERT com orgId alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY email_message_insert ON "EmailMessage"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());
-- WITH CHECK no UPDATE impede MOVER o e-mail para outra Org.
CREATE POLICY email_message_update ON "EmailMessage"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());
-- Policy DELETE por simetria/defesa; o runtime NÃO recebe GRANT de DELETE — o e-mail não é apagável.
CREATE POLICY email_message_delete ON "EmailMessage"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação (`giraffe_app`). O GRANT é FRONTEIRA de segurança.
-- UPDATE COLUMN-SCOPED: conteúdo/estado/vínculo editáveis (em DRAFT — o serviço guarda o estado);
-- `orgId` e `createdByMembershipId` SEM UPDATE (identidade e autoria imutáveis — tentativa bate em
-- `permission denied`, provado no `emails-rls`). SEM DELETE (descartar é `state`).
GRANT SELECT, INSERT ON "EmailMessage" TO giraffe_app;
GRANT UPDATE ("cardId", "state", "recipients", "subject", "body", "submittedAt", "updatedAt")
  ON "EmailMessage" TO giraffe_app;
