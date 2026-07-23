# migration-check — Story 4.7

**Status:** APROVADO (drill executado — ver §Evidência)
**Migration:** `20260729120000_automation_chaining` (aditiva) · **Rollback:** `rollback/20260729120000_automation_chaining.down.sql`

## Natureza
Aditiva e NÃO destrutiva de dado do titular:
1. `ALTER TYPE "AutomationExecutionState" ADD VALUE IF NOT EXISTS 'HALTED_BY_LIMIT'` (precedente `..._membership_*`;
   não usado na própria migration ⇒ seguro na tx da migration no PostgreSQL 16).
2. `ALTER TABLE "DomainEvent" ADD COLUMN "chainDepth" INTEGER NOT NULL DEFAULT 0` (INSERT-only; sem GRANT novo).
3. `ALTER TABLE "AutomationExecution" ADD COLUMN "chainDepth" ... DEFAULT 0` + `@@index(orgId, executionChainId)`
   (INSERT-only; FORA do UPDATE column-scoped — imutável por GRANT).
4. `CREATE TABLE "AutomationChainVisit"` + unique `(orgId, executionChainId, signature)` + índice + FK orgId +
   RLS ENABLE/FORCE + 4 policies (WITH CHECK INSERT/UPDATE) + GRANT SELECT/INSERT.

## Backfill
Implícito: `chainDepth` DEFAULT 0 nas linhas existentes (coerente — linhas pré-4.7 são raízes/sem encadeamento).
Nenhum backfill de dado; tabela nova vazia. Sem risco de reescrita de linha.

## Reversibilidade
`.down.sql`: DROP TABLE `AutomationChainVisit`; DROP INDEX do `executionChainId`; DROP COLUMN `chainDepth` (das
duas tabelas). O valor de enum `HALTED_BY_LIMIT` NÃO é removível por `DROP VALUE` (limitação do PostgreSQL) —
deixá-lo é INÓCUO (nenhuma linha o usa ao reverter). Documentado no cabeçalho da migration e no `.down.sql`.

## Evidência de drill (banco descartável — PostgreSQL 16 real, porta 5451)
Executado contra um PostgreSQL 16 descartável com os papéis `giraffe_migrator`/`giraffe_app` bootstrapados:
- **UP**: `prisma migrate deploy` aplicou toda a cadeia, terminando em `20260729120000_automation_chaining` —
  "All migrations have been successfully applied."
- **DOWN (drill)**: aplicado `rollback/20260729120000_automation_chaining.down.sql` — `DROP TABLE`/`DROP INDEX`/
  `ALTER TABLE` ok. Verificação: `AutomationChainVisit` = NULL (dropado), `chainDepth` ausente em
  `AutomationExecution` e `DomainEvent` → `t|t|t`.
- **RE-APPLY (up)**: re-aplicada a `migration.sql` — recriou tabela/policies/GRANT sem erro (`ADD VALUE IF NOT
  EXISTS` idempotente); `AutomationChainVisit` presente → `t`.
- **Provas de segurança via psql** (papel `giraffe_app`): UPDATE e DELETE em `AutomationChainVisit` →
  `permission denied for table` (append-only); `chainDepth` ausente das colunas de UPDATE de `AutomationExecution`;
  RLS ENABLE+FORCE (owner `giraffe_migrator`); 4 policies com WITH CHECK (INSERT/UPDATE); unique
  `(orgId, executionChainId, signature)` presente; enum `HALTED_BY_LIMIT` presente.
- **Suíte**: `automation-chaining-rls` (10/10) exercita a fase vermelha do GRANT/policy sob o runtime real.
