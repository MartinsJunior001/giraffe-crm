-- Story 4.1 — Automation: o MODELO da Automação declarativa e seu vínculo tenant-safe ao Pipe (FR-21).
--
-- Primeira tabela do Épico 4. Aditiva e REVERSÍVEL — a reversa vive em
-- `apps/api/prisma/rollback/20260720120000_automations.down.sql` (mesmo nome-base, mesmo PR). Nenhum dado
-- existente é alterado: o único toque em tabela pré-existente é um UNIQUE **aditivo** em "Pipe" (abaixo),
-- que não rejeita nenhuma linha possível — `id` já é PK, logo o par ("orgId","id") já era único de fato.
--
-- ⚠️ O QUE ESTA MIGRATION DELIBERADAMENTE **NÃO** FAZ: conceder UPDATE ou DELETE ao runtime.
--   · sem DELETE — "não há exclusão definitiva" (D4.3) é garantido pelo BANCO, não pela ausência de rota;
--   · sem UPDATE — a 4.1 CRIA e LÊ. Editar e transicionar estado (ativar/desativar/arquivar/restaurar/
--     duplicar) são da Story 4.2, que abrirá o UPDATE column-scoped junto do consumidor concreto e do teste
--     que prova o escopo dele. É exatamente o que "Card" fez: SELECT/INSERT na 2.7, 1º UPDATE só na 2.11.
--
-- É essa ausência de UPDATE que torna a 4.1 segura de entregar ANTES do motor: uma Automação nasce
-- `INACTIVE`, "só a ativa dispara" (D4.3), e o runtime sequer CONSEGUE levá-la a `ACTIVE`.

-- CreateEnum
CREATE TYPE "AutomationState" AS ENUM ('INACTIVE', 'ACTIVE', 'ARCHIVED');

-- ============================================================================
-- F-A1 — CHAVE-ALVO DA FK COMPOSTA TENANT-SAFE
--
-- Redundante como IDENTIDADE ("id" já é PK), necessária como DESTINO: o PostgreSQL só aceita uma FK
-- composta se existir uma constraint UNIQUE exatamente sobre as colunas referenciadas. É ela que permite a
-- "Automation" referenciar o PAR ("orgId","id") e assim provar, NO BANCO, que ela e o Pipe pertencem à
-- MESMA Organização.
-- ============================================================================
ALTER TABLE "Pipe" ADD CONSTRAINT "Pipe_orgId_id_key" UNIQUE ("orgId", "id");

-- CreateTable
CREATE TABLE "Automation" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "pipeId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "AutomationState" NOT NULL DEFAULT 'INACTIVE',
    -- Versão do SCHEMA do documento de configuração, carimbada pelo servidor (nunca pelo cliente).
    -- Coluna, e não chave dentro do JSON, para ser CONSULTÁVEL quando 4.3/4.4/4.5 evoluírem a forma.
    "configSchemaVersion" INTEGER NOT NULL DEFAULT 1,
    "quando" JSONB NOT NULL,
    "condicoes" JSONB NOT NULL DEFAULT '[]',
    "entao" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

-- A consulta do motor (4.6) é "Automações ATIVAS de um Pipe"; a desta Story, "Automações de um Pipe".
CREATE INDEX "Automation_orgId_pipeId_state_idx" ON "Automation"("orgId", "pipeId", "state");

-- AddForeignKey
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- F-A1 — FK **COMPOSTA**: o vínculo Automação→Pipe é tenant-safe NO BANCO.
--
-- Por que a FK simples ("pipeId" → "Pipe"."id") NÃO bastaria — e este é o ponto da Story:
--
--   1. a policy de INSERT de "Automation" valida `orgId = current_org_id()` no WITH CHECK — e PASSA,
--      porque o "orgId" gravado é legitimamente o meu;
--   2. a verificação de FK confirma que "pipeId" EXISTE em "Pipe" — e ações referenciais rodam com
--      BYPASS de row security (a mesma propriedade que já obriga o runtime a não ter DELETE em "Account",
--      sob pena de a cascata varrer Memberships de todas as Organizações);
--   3. logo, um "pipeId" de OUTRA Organização seria ACEITO pelo banco.
--
-- Restaria apenas a releitura do Pipe no serviço guardando o invariante-mãe — uma checagem de aplicação
-- exatamente onde esta base recusa tê-la ("quem isola é o banco"; "um `where` se esquece e a policy não").
--
-- Com o PAR, o par ("orgId","pipeId") só existe se o Pipe for daquela Organização, e o vazamento
-- cross-tenant deixa de depender de código: vira violação de chave estrangeira.
--
-- ON DELETE RESTRICT (não CASCADE): o runtime não tem DELETE em "Pipe" de todo modo; RESTRICT torna
-- explícito que apagar um Pipe que ainda tem Automação é um ERRO, nunca uma cascata silenciosa.
-- Consequência registrada (spec §D-4.1-C): apagar uma "Organization" dispara as cascatas de "Pipe" e de
-- "Automation" sem ordem contratual, e RESTRICT é verificado de imediato. Inalcançável em runtime — o
-- runtime não tem DELETE em "Organization" nem em "Pipe".
-- ============================================================================
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_orgId_pipeId_fkey" FOREIGN KEY ("orgId", "pipeId") REFERENCES "Pipe"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- ISOLAMENTO (AD-6) — o padrão integral desta base.
--
-- `current_org_id()` devolve NULL sem contexto, e comparação com NULL nunca é TRUE ⇒ negado por padrão.
-- ENABLE liga a RLS; FORCE a estende ao PRÓPRIO DONO (o migrator), sem o que o dono a ignoraria.
-- ============================================================================
ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Automation" FORCE ROW LEVEL SECURITY;

CREATE POLICY automation_select ON "Automation"
  FOR SELECT USING ("orgId" = current_org_id());

-- WITH CHECK no INSERT: sem ele, um INSERT com "orgId" alheio seria aceito e ficaria INVISÍVEL para quem
-- o gravou — o vazamento silencioso que este projeto trata como falha de isolamento, não como bug.
CREATE POLICY automation_insert ON "Automation"
  FOR INSERT WITH CHECK ("orgId" = current_org_id());

-- WITH CHECK no UPDATE: sem ele, um UPDATE poderia MOVER a linha para outra Organização. A policy existe
-- por completude e defesa em profundidade; o runtime da 4.1 não recebe GRANT de UPDATE (ver abaixo).
CREATE POLICY automation_update ON "Automation"
  FOR UPDATE USING ("orgId" = current_org_id())
         WITH CHECK ("orgId" = current_org_id());

-- Policy de DELETE por simetria/defesa em profundidade. Quem realmente barra o runtime é o GRANT.
CREATE POLICY automation_delete ON "Automation"
  FOR DELETE USING ("orgId" = current_org_id());

-- ---------------------------------------------------------------------------
-- Privilégios do papel de aplicação: DML MÍNIMA. Sem DDL, sem ownership.
-- SELECT + INSERT cobrem criar, obter e listar — tudo o que a 4.1 entrega.
-- SEM UPDATE (4.2) e SEM DELETE (nunca). Uma rota acrescentada por engano bate em `permission denied`.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT ON "Automation" TO giraffe_app;
