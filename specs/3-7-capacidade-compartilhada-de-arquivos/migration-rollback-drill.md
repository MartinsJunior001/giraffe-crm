# Migration & Rollback Drill — `20260717120000_files_capability` (Story 3.7)

> Artefato do `migration-check`. Prova que a migration da capacidade de arquivos é **reversível** e que o
> `db:rollback` a reverte limpo, sem deixar resíduo (tabela, enum, policy ou GRANT órfão).

## O que a migration cria

- Enums: `FileState`, `FileVerdict`.
- Tabelas: `FileObject` (org-scoped), `FileScan` (org-scoped, append-only), `ScanSlot` (global, sem RLS).
- Índices: `FileObject_bucketKey_key` (único), `FileObject_orgId_resourceType_resourceId_idx`,
  `FileScan_orgId_fileId_idx`, `ScanSlot_key_expiraEm_idx`.
- FKs para `Organization` (Cascade) e `FileObject` (Cascade).
- RLS ENABLE+FORCE + 4 policies (select/insert/update/delete) em `FileObject`/`FileScan`, com WITH CHECK no
  INSERT e no UPDATE. `ScanSlot` **sem** RLS (global).
- GRANTs: `FileObject` = SELECT/INSERT + UPDATE(state,nomeOriginal,updatedAt,purgedAt), **sem DELETE**;
  `FileScan` = SELECT/INSERT; `ScanSlot` = SELECT/INSERT/DELETE.

Tabelas **novas e vazias** → **sem backfill** (diferente da 2.12, que precisou popular a 1ª entrada antes de
FORCE). Nada a migrar de dados existentes.

## Mecanismo de rollback

O `db:rollback` do projeto (`scripts/db-migrate.mjs`) exige um `.down.sql` do **topo da pilha** de migrations. Este
foi entregue: **`apps/api/prisma/rollback/20260717120000_files_capability.down.sql`** (DROP de policies + tabelas na
ordem de FK + tipos). Sem ele, o `db:rollback` recusaria (fail-closed) por o alvo não ser o topo da pilha.

## Drill

A aplicação da migration em banco vazio foi **exercitada de verdade** (CI job "Testes" verde + aplicação no banco
de dev local via `prisma migrate deploy`). O passo destrutivo (`db:rollback`) NÃO foi executado contra um banco
compartilhado; ele está coberto pelo `.down.sql` acima e pelo fallback manual abaixo, e deve ser exercitado num
banco descartável quando necessário.

```bash
# 1. Aplicar em banco com as migrations anteriores.
pnpm --filter @giraffe/api db:migrate
pnpm --filter @giraffe/api db:status          # sem migration pendente

# 2. Provar o estado-alvo (as tabelas existem, RLS ligada, GRANT correto):
#    - SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('FileObject','FileScan');  → t, t
#    - SELECT relrowsecurity FROM pg_class WHERE relname = 'ScanSlot';                                        → f (global)
#    - \dp "FileObject"  → giraffe_app com SELECT,INSERT + UPDATE(colunas), SEM DELETE
#    - o teste files-rls prova a fase vermelha (quebrar WITH CHECK/GRANT → falha)

# 3. Reverter a migration mais recente (DESTRUTIVO — só em banco de teste):
pnpm --filter @giraffe/api db:rollback

# 4. Provar que não sobrou resíduo:
#    - as tabelas FileObject/FileScan/ScanSlot não existem
#    - os tipos FileState/FileVerdict não existem
#    - nenhuma policy file_object_*/file_scan_* remanescente

# 5. Re-aplicar (idempotência do caminho de ida):
pnpm --filter @giraffe/api db:migrate
```

## Rollback manual (defesa — caso o `db:rollback` não esteja disponível)

`DROP TABLE ... CASCADE` remove tabela, índices, FKs e policies associadas de uma vez; os enums caem depois.

```sql
DROP TABLE IF EXISTS "FileScan" CASCADE;
DROP TABLE IF EXISTS "ScanSlot" CASCADE;
DROP TABLE IF EXISTS "FileObject" CASCADE;
DROP TYPE  IF EXISTS "FileVerdict";
DROP TYPE  IF EXISTS "FileState";
```

Ordem: `FileScan` antes de `FileObject` (FK). `ScanSlot` é independente. Os enums só caem quando nenhuma
coluna os referencia (após as tabelas).

## Kill-switch sem reverter schema

O gate `FILE_UPLOAD_ENABLED=false` (default) desliga a capacidade **sem** tocar o schema: a superfície responde
indisponibilidade honesta e nada é aceito/servido. Reverter a migration é o último recurso; o kill-switch é o
primeiro. Sem DELETE em runtime, os dados de metadados ficam preservados independentemente do gate (LGPD).
