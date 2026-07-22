-- Story 4.3 — Catálogo de Eventos (gatilhos): outbox canônico "DomainEvent".
--
-- Uma tabela nova, com consumidor concreto NESTA Story (o produtor: a emissão CARD_CREATED nos dois sítios de
-- criação de Card — submissão interna 2.7 e conversão pública 2.8). GENERALIZA "MovementEvent" (2.16) para o
-- catálogo completo de gatilhos (AD-13: o registro do evento de integração é confirmado ATOMICAMENTE com o
-- fato; o processamento assíncrono, se houver, vem depois — motor 4.6). Trilha de INTEGRAÇÃO, DISTINTA do
-- Histórico do Card/Registro e da Auditoria (AD-15). Consumo por E4 (Automação) e E5 (Notificação) — NÃO
-- implementado aqui (sem publisher/fila/consumidor sem consumidor concreto — AD-11/Constitution II).
--
-- Tabela org-owned APPEND-ONLY e IMUTÁVEL: RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK no
-- INSERT e no UPDATE. `eventId` DETERMINÍSTICO por fato (uuidv5(eventType+orgId+resourceId+correlationId)) com
-- UNIQUE `(orgId, eventId)` — reprocessamento reproduz o mesmo `eventId`; o índice impede duplicata lógica.
-- GRANT SÓ SELECT+INSERT — "sem alteração/exclusão do evento" é garantido pelo BANCO (UPDATE/DELETE batem em
-- `permission denied`), como MovementEvent/CardHistory/FormVersion.
--
-- FK COMPOSTA tenant-safe (orgId,pipeId)→Pipe(orgId,id): `pipeId` nulável (Registro puro não tem Pipe); o
-- MATCH SIMPLE do Postgres não checa a FK quando `pipeId` é NULL. ON DELETE CASCADE como MovementEvent (2.16):
-- o evento é fato DERIVADO do Pipe — apagar o Pipe (só pelo dono; o runtime não tem DELETE em Pipe) leva junto
-- seus eventos. O recurso principal (`resourceId`) é polimórfico e SEM FK — isolado por RLS+orgId e validado
-- in-tx pelo produtor.
--
-- Sem enum (eventType/resourceType/origin são String — vocabulário estável). Sem backfill (tabela nova).
-- REVERSÍVEL: `DROP TABLE "DomainEvent"` restaura o estado anterior (rollback drill documentado no gate
-- migration-check da Story).

-- CreateTable DomainEvent (append-only, imutável).
CREATE TABLE "DomainEvent" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "pipeId" UUID,
    "resourceType" TEXT NOT NULL,
    "resourceId" UUID NOT NULL,
    "actorId" UUID,
    "origin" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" UUID NOT NULL,
    "causationId" UUID,
    "executionChainId" UUID,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainEvent_pkey" PRIMARY KEY ("id")
);

-- Um reprocessamento do mesmo fato não cria um 2º evento lógico (idempotência).
CREATE UNIQUE INDEX "DomainEvent_orgId_eventId_key" ON "DomainEvent"("orgId", "eventId");
-- Consulta do motor (4.6): eventos de um Pipe por tipo (Automações são por Pipe — RN-100).
CREATE INDEX "DomainEvent_orgId_pipeId_eventType_idx" ON "DomainEvent"("orgId", "pipeId", "eventType");
-- Leitura da trilha por recurso (cronológica) e correlação com a operação.
CREATE INDEX "DomainEvent_orgId_resourceType_resourceId_occurredAt_idx" ON "DomainEvent"("orgId", "resourceType", "resourceId", "occurredAt");
CREATE INDEX "DomainEvent_orgId_correlationId_idx" ON "DomainEvent"("orgId", "correlationId");

-- AddForeignKey
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- FK COMPOSTA tenant-safe (orgId,pipeId)→Pipe(orgId,id). CASCADE como MovementEvent: evento derivado do Pipe.
ALTER TABLE "DomainEvent" ADD CONSTRAINT "DomainEvent_orgId_pipeId_fkey" FOREIGN KEY ("orgId", "pipeId") REFERENCES "Pipe"("orgId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a MovementEvent/CardHistory/AutomationVersion.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ============================================================================
ALTER TABLE "DomainEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DomainEvent" FORCE ROW LEVEL SECURITY;

CREATE POLICY domain_event_select ON "DomainEvent"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY domain_event_insert ON "DomainEvent"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe GRANT de UPDATE nem DELETE (ver GRANT
-- abaixo): o evento canônico é APPEND-ONLY e IMUTÁVEL, como as demais trilhas de registro.
CREATE POLICY domain_event_update ON "DomainEvent"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY domain_event_delete ON "DomainEvent"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. DomainEvent: SÓ SELECT + INSERT — append-only imutável. Emitir o evento é
-- INSERT (nova linha); NUNCA UPDATE/DELETE. "Sem alteração/exclusão do evento canônico" é garantido pelo BANCO.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "DomainEvent" TO giraffe_app;
