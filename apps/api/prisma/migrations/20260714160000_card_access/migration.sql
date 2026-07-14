-- Story 2.10 — acesso, Responsável e concessões de Card.
--
-- Fecha o DBT-2.2-ROLE-DORMENTE (operação de Card por concessão). Três dados novos de autorização, TODOS org-owned:
--
--   • CardGrant       — concessão DIRETA de acesso a UM Card (Observador = leitura; operacional direta = agir só
--                       naquele Card). NÃO é papel: nunca abre lista/config do Pipe nem outros Cards. Revogar é
--                       `state = REVOKED` (sem DELETE).
--   • CardResponsavel — atribuição de Responsável de um Card (por `membershipId`). É ATRIBUIÇÃO operacional, não
--                       papel: não amplia acesso. Mantém `Card` append-only — a 2.10 NÃO abre GRANT de UPDATE em
--                       `Card` (o 1º UPDATE segue reservado à movimentação, 2.14). Remover é `state = REMOVED`.
--   • PipeGrant.restritoAoProprio — modificador do Membro do Pipe (novo DADO de autorização, análogo a
--                       `reviewPublicSubmissions` da 2.8; NÃO é papel novo). Quando true, o Membro só acessa os
--                       Cards em que é Responsável atual OU tem concessão direta — `creator`/histórico NÃO concedem.
--
-- Padrão de isolamento idêntico a Card/SubmissaoPublica: RLS ENABLE+FORCE, policies por `current_org_id()`, WITH
-- CHECK no INSERT e no UPDATE (sem ele, um INSERT/UPDATE com `orgId` alheio seria aceito ou moveria a linha de Org).
-- GRANT SELECT/INSERT/UPDATE — SEM DELETE (revogar/remover é mudança de `state`, preserva a trilha).

-- CreateEnum
CREATE TYPE "CardGrantState" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "CardResponsavelState" AS ENUM ('ACTIVE', 'REMOVED');

-- AlterTable: modificador "restrito ao próprio" do Membro do Pipe (deny-by-default = false).
ALTER TABLE "PipeGrant" ADD COLUMN "restritoAoProprio" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable CardGrant
CREATE TABLE "CardGrant" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "podeLer" BOOLEAN NOT NULL DEFAULT true,
    "podeOperar" BOOLEAN NOT NULL DEFAULT false,
    "podeMover" BOOLEAN NOT NULL DEFAULT false,
    "state" "CardGrantState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CardGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable CardResponsavel
CREATE TABLE "CardResponsavel" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "state" "CardResponsavelState" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "removedAt" TIMESTAMP(3),

    CONSTRAINT "CardResponsavel_pkey" PRIMARY KEY ("id")
);

-- Índices de consulta: por Card (quem acessa) e por pessoa (quais Cards).
CREATE INDEX "CardGrant_orgId_cardId_idx" ON "CardGrant"("orgId", "cardId");
CREATE INDEX "CardGrant_orgId_membershipId_idx" ON "CardGrant"("orgId", "membershipId");
CREATE INDEX "CardResponsavel_orgId_cardId_idx" ON "CardResponsavel"("orgId", "cardId");
CREATE INDEX "CardResponsavel_orgId_membershipId_idx" ON "CardResponsavel"("orgId", "membershipId");

-- Unicidade PARCIAL: no máximo UMA concessão ativa por (Card, pessoa) — reconceder reusa/atualiza, não duplica.
-- Uma linha REVOKED não conta, então reconceder depois de revogar é permitido.
CREATE UNIQUE INDEX "CardGrant_cardId_membershipId_active_key"
  ON "CardGrant"("cardId", "membershipId") WHERE "state" = 'ACTIVE';

-- Unicidade PARCIAL: no máximo UM Responsável ativo por Card (trocar = remover o atual + atribuir na mesma tx).
CREATE UNIQUE INDEX "CardResponsavel_cardId_active_key"
  ON "CardResponsavel"("cardId") WHERE "state" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "CardGrant" ADD CONSTRAINT "CardGrant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardGrant" ADD CONSTRAINT "CardGrant_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardGrant" ADD CONSTRAINT "CardGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardResponsavel" ADD CONSTRAINT "CardResponsavel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardResponsavel" ADD CONSTRAINT "CardResponsavel_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardResponsavel" ADD CONSTRAINT "CardResponsavel_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Card/CardHistory/SubmissaoPublica.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ============================================================================

-- ── CardGrant ────────────────────────────────────────────────────────────────
ALTER TABLE "CardGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardGrant" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_grant_select ON "CardGrant"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, uma concessão com `orgId` alheio seria aceita e ficaria invisível — acesso cross-tenant.
CREATE POLICY card_grant_insert ON "CardGrant"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Revogar é UPDATE de `state`; a linha não pode ser movida para outra Org.
CREATE POLICY card_grant_update ON "CardGrant"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy por simetria/defesa; o runtime NÃO recebe GRANT de DELETE (ver GRANT abaixo).
CREATE POLICY card_grant_delete ON "CardGrant"
  FOR DELETE USING ("orgId" = current_org_id());

-- ── CardResponsavel ──────────────────────────────────────────────────────────
ALTER TABLE "CardResponsavel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardResponsavel" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_responsavel_select ON "CardResponsavel"
  FOR SELECT USING ("orgId" = current_org_id());

CREATE POLICY card_responsavel_insert ON "CardResponsavel"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

CREATE POLICY card_responsavel_update ON "CardResponsavel"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY card_responsavel_delete ON "CardResponsavel"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. SELECT/INSERT/UPDATE em ambas — a 2.10 CRIA (conceder/atribuir) e MUTA `state`
-- (revogar/remover) e capacidades. SEM DELETE: revogar/remover é mudança de `state`, nunca exclusão de linha —
-- garantido pelo banco, não pela ausência de rota. Ao conceder um privilégio novo, o teste RLS prova seu escopo.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "CardGrant" TO giraffe_app;
GRANT SELECT, INSERT, UPDATE ON "CardResponsavel" TO giraffe_app;
