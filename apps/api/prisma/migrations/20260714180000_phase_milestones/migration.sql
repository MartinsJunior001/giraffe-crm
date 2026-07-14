-- Story 2.12 — Marcos por Fase e override por Card.
--
-- Introduz a CONFIGURAÇÃO de marcos por Fase (durações relativas à entrada, em MINUTOS) e a REFERÊNCIA TEMPORAL de
-- entrada na Fase (`CardPhaseEntry`), a base absoluta que a saúde temporal (2.13) e a movimentação (2.14) consumirão.
--
--   • Config de marcos = COLUNAS em "Phase" (decisão D-OA2b=A): três durações `Int?` (minutos, pois o Prisma 6.19.3
--     não tem `interval` nativo) + três `fieldId?` de override (Campo DATE/DATETIME do Card cujo valor absoluto
--     prevalece — D-OA3). Invariante `esperado ≤ vencimento ≤ expiração` validado no núcleo puro E por CHECK aqui
--     (defesa em profundidade, tolerante a NULL). "Phase" já tem GRANT SELECT/INSERT/UPDATE — configurar é UPDATE.
--
--   • CardPhaseEntry = tabela org-owned APPEND-ONLY e IMUTÁVEL (decisão D-OA2a=A): cada entrada efetiva preserva o
--     instante (`enteredAt`, Timestamptz — instante absoluto, decisão de Arquitetura) e a origem; cada reentrada é
--     uma NOVA linha. `configSnapshot` congela a config vigente da Fase no instante da entrada (D-OA1=A: mudar a
--     config afeta só entradas FUTURAS; "sem recálculo retroativo silencioso" cai por construção — padrão da
--     FormVersion da 2.6). GRANT só SELECT+INSERT (sem UPDATE, sem DELETE), como CardHistory/FormVersion.
--
-- Padrão de isolamento idêntico a Card/CardHistory: RLS ENABLE+FORCE, policies por `current_org_id()`, WITH CHECK.
-- IMPORTANTE: o BACKFILL das entradas dos Cards já existentes roda ANTES de FORCE RLS — sob FORCE, um INSERT do
-- próprio dono (migrator) seria barrado por `current_org_id()` NULL (sem contexto de requisição na migração).

-- CreateEnum
CREATE TYPE "CardPhaseEntryOrigin" AS ENUM ('SUBMISSION', 'MOVE');

-- AlterTable: configuração de marcos por Fase. Todas as colunas nuláveis (marco ausente = não configurado).
ALTER TABLE "Phase"
  ADD COLUMN "expectedDurationMin"   INTEGER,
  ADD COLUMN "dueDurationMin"        INTEGER,
  ADD COLUMN "expirationDurationMin" INTEGER,
  ADD COLUMN "expectedFieldId"   UUID,
  ADD COLUMN "dueFieldId"        UUID,
  ADD COLUMN "expirationFieldId" UUID;

-- CHECK (defesa em profundidade): durações não-negativas e cadeia `esperado ≤ vencimento ≤ expiração` quando ambos
-- presentes (o par esperado≤expiração cobre o caso de vencimento nulo). A validação canônica vive no núcleo puro.
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_milestones_ordering_check" CHECK (
  ("expectedDurationMin"   IS NULL OR "expectedDurationMin"   >= 0) AND
  ("dueDurationMin"        IS NULL OR "dueDurationMin"        >= 0) AND
  ("expirationDurationMin" IS NULL OR "expirationDurationMin" >= 0) AND
  ("expectedDurationMin" IS NULL OR "dueDurationMin"        IS NULL OR "expectedDurationMin" <= "dueDurationMin") AND
  ("dueDurationMin"      IS NULL OR "expirationDurationMin" IS NULL OR "dueDurationMin"      <= "expirationDurationMin") AND
  ("expectedDurationMin" IS NULL OR "expirationDurationMin" IS NULL OR "expectedDurationMin" <= "expirationDurationMin")
);

-- CreateTable CardPhaseEntry
CREATE TABLE "CardPhaseEntry" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "enteredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin" "CardPhaseEntryOrigin" NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardPhaseEntry_pkey" PRIMARY KEY ("id")
);

-- "Entrada atual" (linha mais recente por Card) e histórico das entradas.
CREATE INDEX "CardPhaseEntry_orgId_cardId_enteredAt_idx" ON "CardPhaseEntry"("orgId", "cardId", "enteredAt");

-- AddForeignKey
ALTER TABLE "CardPhaseEntry" ADD CONSTRAINT "CardPhaseEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPhaseEntry" ADD CONSTRAINT "CardPhaseEntry_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CardPhaseEntry" ADD CONSTRAINT "CardPhaseEntry_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- BACKFILL (idempotente) — a 1ª entrada (`origin=SUBMISSION`) de cada Card já existente, para a saúde 2.13 ter base.
-- Roda ANTES de ENABLE/FORCE RLS (sem contexto de Org na migração; o dono seria barrado sob FORCE). `enteredAt` = o
-- instante de criação do Card, interpretado como UTC (o schema guarda TIMESTAMP sem fuso; o container roda em UTC).
-- `configSnapshot` = a config VIGENTE da Fase (recém-adicionada ⇒ toda NULL nos Cards antigos, que de fato não tinham
-- marcos ao serem criados). `WHERE NOT EXISTS` torna o passo repetível sem duplicar.
-- ---------------------------------------------------------------------------
INSERT INTO "CardPhaseEntry" ("id", "orgId", "cardId", "phaseId", "enteredAt", "origin", "configSnapshot", "createdAt")
SELECT
  gen_random_uuid(),
  c."orgId",
  c."id",
  c."phaseId",
  (c."createdAt" AT TIME ZONE 'UTC'),
  'SUBMISSION'::"CardPhaseEntryOrigin",
  jsonb_build_object(
    'expectedDurationMin',   p."expectedDurationMin",
    'dueDurationMin',        p."dueDurationMin",
    'expirationDurationMin', p."expirationDurationMin",
    'expectedFieldId',       p."expectedFieldId",
    'dueFieldId',            p."dueFieldId",
    'expirationFieldId',     p."expirationFieldId"
  ),
  c."createdAt"
FROM "Card" c
JOIN "Phase" p ON p."id" = c."phaseId"
WHERE NOT EXISTS (
  SELECT 1 FROM "CardPhaseEntry" e WHERE e."cardId" = c."id"
);

-- ============================================================================
-- ISOLAMENTO MULTI-TENANT (AD-6) — simétrico a Card/CardHistory.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO. `current_org_id()` NULL sem contexto ⇒ negado.
-- ============================================================================
ALTER TABLE "CardPhaseEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CardPhaseEntry" FORCE ROW LEVEL SECURITY;

CREATE POLICY card_phase_entry_select ON "CardPhaseEntry"
  FOR SELECT USING ("orgId" = current_org_id());

-- Sem o WITH CHECK, um INSERT com `orgId` alheio seria aceito e ficaria invisível — vazamento cross-tenant.
CREATE POLICY card_phase_entry_insert ON "CardPhaseEntry"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies UPDATE/DELETE por simetria/defesa; o runtime NÃO recebe GRANT de UPDATE nem DELETE (ver GRANT abaixo):
-- a referência de entrada é APPEND-ONLY e IMUTÁVEL, como CardHistory/FormVersion.
CREATE POLICY card_phase_entry_update ON "CardPhaseEntry"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY card_phase_entry_delete ON "CardPhaseEntry"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação. CardPhaseEntry: SÓ SELECT + INSERT — append-only imutável (como
-- CardHistory/FormVersion): registrar uma entrada é INSERT; NUNCA UPDATE/DELETE. "Sem alteração retroativa do
-- histórico" é garantido pelo BANCO — um UPDATE/DELETE acrescentado por engano amanhã bate em `permission denied`.
-- "Phase" NÃO recebe privilégio novo: já tem SELECT/INSERT/UPDATE (configurar marcos é UPDATE das colunas novas).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "CardPhaseEntry" TO giraffe_app;
