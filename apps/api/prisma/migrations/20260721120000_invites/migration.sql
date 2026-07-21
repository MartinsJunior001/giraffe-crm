-- Story 8.2 — Invite: o Convite org-scoped (criar/reenviar/expirar/cancelar) + base da Auditoria.
--
-- Aditiva e REVERSÍVEL (ver `prisma/rollback/20260721120000_invites.down.sql`, mesmo PR). Nenhum dado
-- existente é tocado.
--
-- ⚠️ SEM DELETE no GRANT: cancelar/expirar é `state`, não exclusão física (LGPD — preserva o dado do
-- titular; revogar é `state=CANCELLED`). Uma rota de DELETE por engano bateria em `permission denied`.

-- CreateEnum
CREATE TYPE "InviteState" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Invite" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "state" "InviteState" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "invitedByAccountId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- Lookup de aceite é por hash do token — único (o token bruto nunca é persistido).
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");
CREATE INDEX "Invite_orgId_state_idx" ON "Invite"("orgId", "state");
CREATE INDEX "Invite_orgId_normalizedEmail_idx" ON "Invite"("orgId", "normalizedEmail");

-- ============================================================================
-- UNICIDADE "1 PENDING por (orgId, normalizedEmail)" — imposta pelo BANCO (G2), não por leitura-antes-
-- de-escrever. Índice único PARCIAL `WHERE state='PENDING'`: dois PENDING para o mesmo par colidem no
-- INSERT (P2002 → 409), mas ACCEPTED/EXPIRED/CANCELLED não ocupam o par — permitindo novo Convite
-- depois. O Prisma 6.19.3 não expressa índice parcial; daí o raw SQL, espelhando o par ATIVO de
-- `DatabaseGrant`.
-- ============================================================================
CREATE UNIQUE INDEX "Invite_pending_unico"
  ON "Invite"("orgId", "normalizedEmail")
  WHERE "state" = 'PENDING';

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO (AD-6) — o padrão integral da base. `current_org_id()` é NULL sem contexto, e comparação
-- com NULL nunca é TRUE ⇒ deny-by-default. ENABLE liga a RLS; FORCE a estende ao próprio dono.
-- ============================================================================
ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite" FORCE ROW LEVEL SECURITY;

CREATE POLICY invite_select ON "Invite"
  FOR SELECT USING ("orgId" = current_org_id());

-- WITH CHECK no INSERT: sem ele, um INSERT com `orgId` alheio entraria e ficaria invisível.
CREATE POLICY invite_insert ON "Invite"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- WITH CHECK no UPDATE: sem ele, um UPDATE poderia MOVER a linha para outra Organização.
CREATE POLICY invite_update ON "Invite"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy de DELETE por simetria/defesa em profundidade. Quem barra o runtime é o GRANT (sem DELETE).
CREATE POLICY invite_delete ON "Invite"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do runtime: DML MÍNIMA. SELECT/INSERT/UPDATE cobrem criar, reenviar (rotaciona token +
-- reinicia prazo = UPDATE), cancelar/expirar (state = UPDATE) e aceitar (state = UPDATE). SEM DELETE.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON "Invite" TO giraffe_app;
