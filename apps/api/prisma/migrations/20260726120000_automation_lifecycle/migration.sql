-- Story 4.2 — Ciclo de vida e gestão da Automação: o VERSIONAMENTO (`AutomationVersion`), o ponteiro de
-- versão ativa (`Automation.activeVersion`), a idempotência de criação/duplicação (`Automation.idempotencyKey`)
-- e o **1º GRANT de UPDATE** em `Automation` — column-scoped.
--
-- Aditiva e REVERSÍVEL (reversa em `apps/api/prisma/rollback/20260726120000_automation_lifecycle.down.sql`,
-- mesmo PR). Nenhum dado existente é alterado: colunas novas nascem NULL; a tabela nova nasce vazia; os dois
-- UNIQUE aditivos em "Automation" não rejeitam nenhuma linha possível (`(orgId,id)` já era único de fato — `id`
-- é PK; `(orgId,pipeId,idempotencyKey)` com `idempotencyKey` NULL nunca colide — NULLs distintos no Postgres).
--
-- ⚠️ O QUE ESTA MIGRATION FAZ E A 4.1 NÃO FEZ: concede `UPDATE` ao runtime — mas **column-scoped** (só o que a
-- gestão precisa evoluir). `orgId`/`pipeId`/`id`/`createdAt`/`idempotencyKey` seguem SEM UPDATE: "não
-- transferível" e identidade imutável são garantidos pelo BANCO. É exatamente o que "Card" fez entre a 2.7
-- (SELECT/INSERT) e a 2.11 (1º UPDATE column-scoped só do estado).

-- ============================================================================
-- AUTOMATION — colunas novas + alvos de UNIQUE
-- ============================================================================
ALTER TABLE "Automation" ADD COLUMN "activeVersion" INTEGER;
ALTER TABLE "Automation" ADD COLUMN "idempotencyKey" TEXT;

-- Alvo da FK COMPOSTA tenant-safe de "AutomationVersion": o PostgreSQL só aceita a FK composta se existir
-- uma UNIQUE exatamente sobre as colunas referenciadas. `(orgId,id)` é redundante como IDENTIDADE (`id` é PK)
-- e necessária como DESTINO — é ela que prova, NO BANCO, que a versão e a Automação são da MESMA Organização.
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_orgId_id_key" UNIQUE ("orgId", "id");

-- Idempotência de criação/duplicação (D-4.2-F). NULLs são distintos no Postgres, então criações SEM chave
-- nunca colidem — a "criar" da 4.1 (sem chave) segue idêntica; com chave, o retry devolve o existente.
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_orgId_pipeId_idempotencyKey_key" UNIQUE ("orgId", "pipeId", "idempotencyKey");

-- ============================================================================
-- AUTOMATIONVERSION — snapshot IMUTÁVEL da configuração congelada (twin de FormVersion)
-- ============================================================================
CREATE TABLE "AutomationVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "automationId" UUID NOT NULL,
    -- Número monotônico por Automação (1, 2, 3...). Unicidade imposta pelo índice abaixo.
    "version" INTEGER NOT NULL,
    -- Snapshot integral da config congelada (quando/condicoes/entao/schemaVersion). Validado no núcleo puro.
    "snapshot" JSONB NOT NULL,
    -- Hash determinístico do snapshot — identifica a versão e detecta divergência.
    "revision" TEXT NOT NULL,
    "configSchemaVersion" INTEGER NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationVersion_orgId_automationId_version_key" ON "AutomationVersion"("orgId", "automationId", "version");
CREATE INDEX "AutomationVersion_orgId_automationId_idx" ON "AutomationVersion"("orgId", "automationId");

ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK COMPOSTA tenant-safe (mesmo racional de F-A1): referencia o PAR ("orgId","automationId") → Automation
-- ("orgId","id"). Uma versão nunca pertence a uma Automação de outra Organização — garantido pelo banco, não
-- por código. ON DELETE CASCADE: apagar a Automação (só pelo dono/migrator — o runtime não tem DELETE) leva
-- suas versões junto; nenhuma versão órfã.
ALTER TABLE "AutomationVersion" ADD CONSTRAINT "AutomationVersion_orgId_automationId_fkey" FOREIGN KEY ("orgId", "automationId") REFERENCES "Automation"("orgId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO (AD-6) — o padrão integral desta base, idêntico a FormVersion.
-- `current_org_id()` devolve NULL sem contexto ⇒ negado por padrão. ENABLE liga a RLS; FORCE a estende ao
-- PRÓPRIO DONO (o migrator).
-- ============================================================================
ALTER TABLE "AutomationVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationVersion" FORCE ROW LEVEL SECURITY;

CREATE POLICY automationversion_select ON "AutomationVersion"
  FOR SELECT USING ("orgId" = current_org_id());

-- WITH CHECK no INSERT: sem ele, uma versão com "orgId" alheio entraria e ficaria invisível a quem a gravou.
CREATE POLICY automationversion_insert ON "AutomationVersion"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- Policies de UPDATE/DELETE por simetria/defesa em profundidade; o runtime NÃO recebe esses privilégios
-- (append-only imutável). Quem realmente barra o runtime é o GRANT abaixo.
CREATE POLICY automationversion_update ON "AutomationVersion"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

CREATE POLICY automationversion_delete ON "AutomationVersion"
  FOR DELETE USING ("orgId" = current_org_id());

-- Append-only IMUTÁVEL: SELECT + INSERT, jamais UPDATE/DELETE — como FormVersion/CardHistory. Uma rota que
-- tentasse alterar/apagar uma versão congelada bateria em `permission denied`.
GRANT SELECT, INSERT ON "AutomationVersion" TO giraffe_app;

-- ============================================================================
-- GRANT UPDATE COLUMN-SCOPED em AUTOMATION (D-4.2-C) — o 1º UPDATE de "Automation" em runtime.
--
-- A 4.1 manteve "Automation" append-only (SELECT/INSERT) porque editar/transicionar são UPDATE, e a regra da
-- casa é conceder o privilégio SÓ com o consumidor concreto e o teste que prova o escopo. A 4.2 traz o
-- consumidor — então concede UPDATE **apenas** nas colunas de gestão do ciclo de vida e da config:
--   · "state"                → ativar/desativar/arquivar/restaurar;
--   · "activeVersion"        → ponteiro da versão em vigor (avança ao ativar/editar-ativa);
--   · "name"/"quando"/"condicoes"/"entao"/"configSchemaVersion" → editar o rascunho;
--   · "updatedAt"            → o Prisma o toca em todo update.
-- "orgId", "pipeId", "id", "createdAt" e "idempotencyKey" seguem SEM privilégio de UPDATE: mover a Automação
-- de Organização/Pipe ou reescrever sua identidade bate em `permission denied` — provado no
-- automation-lifecycle-rls. A policy `automation_update` (WITH CHECK orgId, desde a 4.1) segue valendo.
-- ============================================================================
GRANT UPDATE ("name", "state", "activeVersion", "quando", "condicoes", "entao", "configSchemaVersion", "updatedAt") ON "Automation" TO giraffe_app;
