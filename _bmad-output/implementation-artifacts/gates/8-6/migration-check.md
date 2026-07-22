# migration-check — Story 8.6

**Migration:** `20260725120000_membership_removal/migration.sql`
**Status: APROVADO** (drill + rollback definidos).

## Conteúdo
1. `ALTER TYPE "MembershipEventType" ADD VALUE IF NOT EXISTS 'REMOVED';` — **aditivo**, não reescreve
   tabela, idempotente no replay. Não usa o valor na mesma transação (seguro sob o wrapper do Prisma, PG 16).
2. `REVOKE DELETE ON "Membership" FROM giraffe_app;` — DDL de privilégio. Fecha
   DEB-MEMBERSHIP-EVENT-CASCADE.

## Segurança / reversibilidade
- **Não destrutiva de dados:** nenhum DROP/UPDATE de linha. `REVOKE` só retira um privilégio que nenhum
  caminho de produção usa (grep vazio de `membership.delete*` em `apps/api/src/`).
- **Rollback drill:**
  - Privilégio: `GRANT DELETE ON "Membership" TO giraffe_app;` (restaura o estado de `init_tenancy_rls`).
  - Enum: valores de enum são forward-only; `REMOVED` é inerte enquanto não usado — não requer (nem
    permite facilmente) reversão. Se um rollback total fosse exigido, recriar o tipo sem o valor é o
    caminho, mas é desnecessário (aditivo e inofensivo).
- **Não** abre GRANT novo em lugar nenhum; RLS/policies/WITH CHECK de `Membership` e `MembershipEvent`
  intactos. O DELETE do **migrator/dono** e as cascatas legítimas (Organization/Account) seguem.

## Provas
- **Fase vermelha (red-phase.md):** com `GRANT DELETE` de volta, `membership-removal-rls` (permission
  denied) fica VERDE indevidamente → o teste falha ao provar o denied, confirmando que é o REVOKE que
  fecha o buraco.
- Reconciliação dos testes fundacionais (`rls`/`rls-observability`): DELETE de Membership pelo runtime
  agora = permission denied; faxina das linhas descartáveis migrou para o **migrator** (dono).

## Aplicação
`pnpm --filter @giraffe/api db:migrate` (papel `giraffe_migrator`), etapa controlada — nunca no boot.
