# migration-check — Story 8.4

**Migration:** `20260723120000_membership_events`.

## Natureza
ADITIVA e não-destrutiva: cria `TYPE "MembershipEventType"` e `TABLE "MembershipEvent"` (nova), índices, FKs,
RLS e GRANT. **Não altera** nenhuma tabela/coluna/policy/GRANT existente. Nenhum backfill (tabela nasce vazia;
o write-side começa com a 8.4). `Membership` intocada (o `UPDATE role` usa o GRANT/policy já existentes).

## Isolamento (padrão da base)
RLS ENABLE + FORCE; policies select/insert/update/delete por `orgId = current_org_id()` com WITH CHECK no
INSERT **e** UPDATE. GRANT só `SELECT, INSERT` ao `giraffe_app` (append-only imutável — UPDATE/DELETE batem
em `permission denied`). Dono do schema = `giraffe_migrator`; runtime = `giraffe_app` (AD-6).

## Forward
`pnpm --filter @giraffe/api db:migrate` → aplica. Evidência de aplicação real: suíte `membership-events-rls`
e `membership-role-http` verdes contra o banco migrado.

## Rollback (drill)
`pnpm --filter @giraffe/api db:rollback` reverte a migration mais recente. Reversão manual equivalente:
```sql
DROP TABLE "MembershipEvent";
DROP TYPE "MembershipEventType";
```
Sem perda de dados de outras entidades (tabela nova, isolada). FK com `ON DELETE CASCADE` a partir de
Organization/Membership — apagar a Org/Membership limpa os eventos, coerente com o resto da base.

## Idempotência de re-migração
Migration versionada (Prisma migrate), aplicada como etapa controlada — nunca no boot. Bootstrap de papéis
inalterado.

**Conclusão: OK.** Migration segura, reversível, com drill documentado.
