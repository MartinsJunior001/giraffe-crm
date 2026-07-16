-- Story 3.3 — Formulário de Database (schema visual do Registro).
--
-- Ativa o contexto `DATABASE` do `Form` (stub desde 2.4): adiciona o owner `databaseId`, reconcilia o CHECK de
-- coerência contexto↔owner (que hoje TORNA `context='DATABASE'` inválido) e replica a unicidade "um Form por
-- owner+contexto" para o Database. NÃO cria segundo builder, segunda tabela de Campo nem GRANT novo: reutiliza
-- integralmente o Form Builder de E2 (2.4/2.5/2.6). RLS/FORCE de `Form`/`Field`/`FormVersion` já vigentes.

-- 1) Coluna owner do contexto DATABASE (null nos demais). FK para Database (Cascade, como pipeId/phaseId).
ALTER TABLE "Form" ADD COLUMN "databaseId" UUID;
ALTER TABLE "Form" ADD CONSTRAINT "Form_databaseId_fkey"
  FOREIGN KEY ("databaseId") REFERENCES "Database"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2) Coerência contexto↔owner: exatamente UM owner casa o contexto; os demais NULL. Substitui o CHECK de 2.4
--    (que só admitia PIPE_INITIAL/PHASE e, por construção, rejeitava qualquer linha DATABASE).
ALTER TABLE "Form" DROP CONSTRAINT "Form_context_owner_ck";
ALTER TABLE "Form" ADD CONSTRAINT "Form_context_owner_ck" CHECK (
    ("context" = 'PIPE_INITIAL' AND "pipeId" IS NOT NULL AND "phaseId" IS NULL     AND "databaseId" IS NULL) OR
    ("context" = 'PHASE'        AND "phaseId" IS NOT NULL AND "pipeId" IS NULL      AND "databaseId" IS NULL) OR
    ("context" = 'DATABASE'     AND "databaseId" IS NOT NULL AND "pipeId" IS NULL   AND "phaseId" IS NULL)
);

-- 3) Unicidade "um Form por Database" — índice único PARCIAL (não expressável no Prisma 6.19.3; v7.4+), raw SQL
--    como `Form_pipe_initial_uq`/`Form_phase_uq` (2.4).
CREATE UNIQUE INDEX "Form_database_uq" ON "Form"("orgId", "databaseId") WHERE "context" = 'DATABASE';

-- 4) Índice de acesso (espelha `@@index([orgId, databaseId])` do schema — mesmo padrão de pipeId/phaseId).
CREATE INDEX "Form_orgId_databaseId_idx" ON "Form"("orgId", "databaseId");

-- Sem GRANT novo: `Form` já tem SELECT/INSERT/UPDATE (sem DELETE) para giraffe_app; `Field`/`FormVersion` idem.
-- Sem policy nova: a RLS de `Form` por `orgId = current_org_id()` já cobre a coluna nova.
