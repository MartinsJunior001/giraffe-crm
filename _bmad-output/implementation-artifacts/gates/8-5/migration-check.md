# Gate — migration-check — Story 8.5

**Migration:** `20260724120000_membership_state_events` — `ALTER TYPE "MembershipEventType" ADD VALUE
'SUSPENDED' | 'REACTIVATED'`.

## Natureza

- **Aditiva e não-destrutiva:** apenas anexa 2 membros ao enum nativo (sem reescrita de tabela —
  confirmado no context7-check contra a doc do Prisma). Sem tabela/coluna/índice/GRANT novo.
- **Segura sob wrapper transacional:** a migration só ADiciona os valores (não os USA na mesma
  transação); a restrição do PostgreSQL (`ALTER TYPE ADD VALUE` não usável na mesma tx que o cria)
  não é violada. `IF NOT EXISTS` torna o replay idempotente.
- **Sem backfill:** nenhum dado existente muda.

## Rollback / drill

- **Rollback lógico:** `db:rollback` reverte a última migration. `ALTER TYPE ... DROP VALUE` NÃO
  existe no PostgreSQL — remover um membro de enum exige recriar o tipo. Como não há linha usando os
  novos valores em produção antes do consumo (a 8.5 é a introdutora), o rollback prático é: reverter
  o registro da migration + as duas rotas/serviço. Os valores extras no enum são **inertes** se não
  usados (nenhuma linha os referencia após rollback do código). Sem risco de dado órfão.
- **Drill executado:** ver evidência abaixo (`db:migrate` aplica; `db:status` confirma; suíte verde).

## Evidência de execução (DB descartável porta 5441, `giraffe85`)

- `db:migrate`: "All migrations have been successfully applied." — inclui
  `20260724120000_membership_state_events` (15 migrations no total).
- `db:status`: "Database schema is up to date!".
- suíte: `membership-state-core.test.ts` 15/15; `membership-state-http.test.ts` 15/15;
  `membership-events-rls.test.ts` 7/7 (fase vermelha do GRANT provada e restaurada — ver
  `red-phase.md` item 5).

**Status: APROVADO.**
