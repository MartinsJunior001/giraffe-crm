-- Story 8.4 — Alteração de papel da Membership: EVENTO CANÔNICO (outbox) do ciclo de Membership.
--
-- `MembershipEvent` é o twin estrutural de `MovementEvent` (2.16): tabela org-scoped APPEND-ONLY e
-- IMUTÁVEL. Escrita na MESMA transação da alteração de papel (D-2/D-3) — não há mudança sem seu evento.
--
-- Por que uma tabela, e não só o log de auditoria: D-2/D-3 exigem "evento canônico + auditoria na MESMA
-- transação", e um log não é transacional. O `@@unique([orgId, eventId])` com `eventId` determinístico
-- por operação torna o outbox IDEMPOTENTE (reprocessar reproduz o id e não duplica).
--
-- Fronteira de segurança = GRANT: só SELECT + INSERT. "Não se altera nem apaga o fato histórico" é
-- garantido pelo BANCO (UPDATE/DELETE batem em `permission denied`), não pela ausência de rota — como
-- `MovementEvent`/`CardHistory`/`RecordHistory`/`FormVersion`.
--
-- NÃO altera `Membership`: a alteração de papel é um UPDATE de `role`, e o runtime JÁ tem
-- `GRANT ... UPDATE ... ON "Membership"` desde a migration inicial (`init_tenancy_rls`), com a policy
-- `membership_update` (USING + WITH CHECK por `current_org_id()`). Nada a conceder ali.

-- Tipo do evento (hoje só a alteração de papel; 8.5/8.6 acrescentam os seus).
CREATE TYPE "MembershipEventType" AS ENUM ('ROLE_CHANGED');

CREATE TABLE "MembershipEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "type" "MembershipEventType" NOT NULL,
    "fromRole" "MembershipRole" NOT NULL,
    "toRole" "MembershipRole" NOT NULL,
    "actorId" UUID,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipEvent_pkey" PRIMARY KEY ("id")
);

-- Idempotência do outbox: um reprocessamento (mesmo `eventId`) não cria 2º evento lógico.
CREATE UNIQUE INDEX "MembershipEvent_orgId_eventId_key" ON "MembershipEvent"("orgId", "eventId");
-- Trilha por Membership (cronológica) e correlação com a operação.
CREATE INDEX "MembershipEvent_orgId_membershipId_occurredAt_idx" ON "MembershipEvent"("orgId", "membershipId", "occurredAt");
CREATE INDEX "MembershipEvent_orgId_correlationId_idx" ON "MembershipEvent"("orgId", "correlationId");

ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a MovementEvent/Membership.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ---------------------------------------------------------------------------
ALTER TABLE "MembershipEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MembershipEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_event_select ON "MembershipEvent"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY membership_event_insert ON "MembershipEvent"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies UPDATE/DELETE por simetria/defesa em profundidade; o runtime NÃO recebe GRANT de UPDATE nem
-- DELETE (ver GRANT abaixo): a imutabilidade do fato é imposta pelo GRANT, e a policy só existe para o
-- caso de o GRANT mudar por engano no futuro (defesa em camadas).
CREATE POLICY membership_event_update ON "MembershipEvent"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY membership_event_delete ON "MembershipEvent"
  FOR DELETE USING ("orgId" = current_org_id());

-- APPEND-ONLY pela fronteira do GRANT: só SELECT + INSERT. UPDATE/DELETE não são concedidos.
GRANT SELECT, INSERT ON "MembershipEvent" TO giraffe_app;
