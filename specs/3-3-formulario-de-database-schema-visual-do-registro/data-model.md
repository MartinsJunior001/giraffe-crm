# Data Model — Story 3.3

## Alteração em `Form` (única mudança de schema)

Coluna nova:
- `databaseId String? @db.Uuid` — owner do contexto `DATABASE` (null nos demais). FK → `Database(id)` ON DELETE
  CASCADE. Back-relation `Database.forms Form[]`.

Constraint de coerência (DROP+ADD do existente):
```sql
ALTER TABLE "Form" DROP CONSTRAINT "Form_context_owner_ck";
ALTER TABLE "Form" ADD CONSTRAINT "Form_context_owner_ck" CHECK (
  ("context" = 'PIPE_INITIAL' AND "pipeId" IS NOT NULL AND "phaseId" IS NULL AND "databaseId" IS NULL) OR
  ("context" = 'PHASE'        AND "phaseId" IS NOT NULL AND "pipeId" IS NULL AND "databaseId" IS NULL) OR
  ("context" = 'DATABASE'     AND "databaseId" IS NOT NULL AND "pipeId" IS NULL AND "phaseId" IS NULL)
);
```

Unicidade "um Form por Database" (índice único parcial — não expressável no Prisma 6.19.3):
```sql
CREATE UNIQUE INDEX "Form_database_uq" ON "Form"("orgId", "databaseId") WHERE "context" = 'DATABASE';
```

Índice de acesso (Prisma `@@index`): `@@index([orgId, databaseId])`.

## Invariantes de dado preservados

- `Field`/`FormVersion` **inalterados** (reusados como estão). Nenhuma coluna nova neles.
- RLS ENABLE+FORCE já vigente em `Form`/`Field`/`FormVersion` — nada a adicionar.
- GRANT: `Form` já tem `SELECT/INSERT/UPDATE` (sem DELETE); `Field` idem; `FormVersion` só `SELECT/INSERT`.
  **Nenhum GRANT novo** — a coluna `databaseId` é coberta pelo GRANT de tabela existente.
- `publicEnabled`/`publicMode` (2.8) e `requisitoEntrada/Saida` (2.15): CHECKs existentes já restringem a
  PIPE_INITIAL/PHASE respectivamente — DATABASE nunca os usa (nada a mudar).

## Rollback (cirúrgico)

Dropar `Form_database_uq`, o índice `[orgId, databaseId]`, a FK e a coluna `databaseId`; restaurar o
`Form_context_owner_ck` de 2 cláusulas (sem DATABASE). Não toca `Field`/`FormVersion`/owners de Pipe.
