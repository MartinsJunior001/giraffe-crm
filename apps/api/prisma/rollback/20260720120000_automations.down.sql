-- Reversa de `migrations/20260720120000_automations/migration.sql` (Story 4.1).
--
-- Nome-base IDÊNTICO ao da migration, por contrato (F-A2): `20260720120000_automations`.
--
-- PRIMEIRA reversa desta base — a convenção `prisma/rollback/<nome-da-migration>.down.sql` nasce aqui.
-- O Prisma Migrate NÃO executa este arquivo; ele é a reversa AUDITÁVEL e TESTADA, exercitada no drill
-- `up → down → up` e disponível para rollback operacional controlado.
--
-- ============================================================================
-- INVARIANTE DESTE ARQUIVO: nenhum objeto PREEXISTENTE é removido.
--
-- Tudo o que segue foi criado pela migration 4.1 e só por ela. O único objeto que toca uma tabela
-- anterior é a constraint `Pipe_orgId_id_key` — criada pela 4.1 (§F-A1) e, por isso, removível aqui.
-- A tabela "Pipe", suas colunas, seus índices e suas policies NÃO são tocados.
--
-- Nenhum DADO preexistente é perdido: "Automation" nasceu com esta Story (todo dado nela nasceu com ela)
-- e o UNIQUE em "Pipe" é ADITIVO — descartá-lo não remove nenhuma linha.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Policies. `DROP TABLE` já as levaria junto, mas são removidas EXPLICITAMENTE e de forma idempotente:
--    a reversa precisa ser legível como inverso ponto-a-ponto da migration, e `IF EXISTS` a torna
--    re-executável sem erro (um rollback que falha no meio é pior que um rollback que não faz nada).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS automation_select ON "Automation";
DROP POLICY IF EXISTS automation_insert ON "Automation";
DROP POLICY IF EXISTS automation_update ON "Automation";
DROP POLICY IF EXISTS automation_delete ON "Automation";

-- ---------------------------------------------------------------------------
-- 2) A FK COMPOSTA tenant-safe (F-A1). Precisa sair ANTES do UNIQUE que ela referencia — é essa
--    dependência que dita a ordem de todo o arquivo.
-- ---------------------------------------------------------------------------
ALTER TABLE "Automation" DROP CONSTRAINT IF EXISTS "Automation_orgId_pipeId_fkey";

-- 3) A FK simples para "Organization".
ALTER TABLE "Automation" DROP CONSTRAINT IF EXISTS "Automation_orgId_fkey";

-- 4) O índice de consulta criado pela migration.
DROP INDEX IF EXISTS "Automation_orgId_pipeId_state_idx";

-- ---------------------------------------------------------------------------
-- 5) A tabela. O GRANT concedido a `giraffe_app` desaparece com ela — não há privilégio órfão a revogar.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS "Automation";

-- 6) O enum, agora sem nenhuma coluna que o use.
DROP TYPE IF EXISTS "AutomationState";

-- ---------------------------------------------------------------------------
-- 7) A chave-alvo da FK composta, em "Pipe".
--
--    Removida SOMENTE porque foi CRIADA pela 4.1 (F-A2: "remover o unique (orgId,id) do Pipe somente se
--    criado pela 4.1"). Verificável no histórico: nenhuma migration anterior a `20260720120000_automations`
--    cria `Pipe_orgId_id_key` — a base não tinha FK composta alguma antes desta Story.
--
--    Só é removível depois que a FK que a referenciava deixou de existir (passo 2). Descartá-la não afeta
--    nenhuma linha de "Pipe": `id` continua sendo a PK, logo o par ("orgId","id") segue único de fato.
-- ---------------------------------------------------------------------------
ALTER TABLE "Pipe" DROP CONSTRAINT IF EXISTS "Pipe_orgId_id_key";
