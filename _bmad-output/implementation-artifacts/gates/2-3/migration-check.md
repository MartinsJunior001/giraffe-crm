# migration-check — Story 2.3 (`20260713140000_phases`)

## Escopo
Introduz `enum PhaseState`, tabela `Phase` (org-scoped), índice `(orgId, pipeId, state, position)`, FKs para
`Pipe`/`Organization` (cascade), RLS ENABLE+FORCE + 4 policies por `current_org_id()` (WITH CHECK no INSERT e
UPDATE) e GRANT `SELECT/INSERT/UPDATE` ao `giraffe_app` (**sem DELETE**). Encadeia após `..._pipe_grants`.

## Deploy
- `pnpm --filter @giraffe/api db:migrate` aplicou a migration em banco com dados (dev), sem erro.
- O CI ("Testes — PostgreSQL real, migrations em banco vazio") aplica todas as migrations em **banco limpo**
  a cada execução — prova o deploy do zero.

## Rollback + reaplicação — evidência REAL (papel migrator)
Executado o `20260713140000_phases.down.sql` e, em seguida, o `migration.sql`, pelo papel `giraffe_migrator`
(preserva a propriedade da tabela). Saída verificada:

```
inicial:        Phase = true  | dono = giraffe_migrator
apos ROLLBACK:  Phase = false | parents = {"Pipe":true,"PipeGrant":true,"Membership":true}
apos REDEPLOY:  Phase = true  | dono = giraffe_migrator
OK: deploy/rollback/reaplicacao verificados; parents intactos; dono correto.
```

- **Rollback remove `Phase`** (enum + tabela + policies + índice + FKs por cascata do DROP TABLE).
- **Não toca `Pipe`/`PipeGrant`/`Membership`** (as três seguem existentes após o rollback).
- **Reaplicação recria `Phase`** com dono `giraffe_migrator` (não o runtime) — o GRANT ao `giraffe_app` é
  recriado pelo `migration.sql`.

## Isolamento provado por teste (SC-238, `phases-rls.test.ts`)
RLS ENABLE+FORCE e `relowner = giraffe_migrator`; leitura/escrita cross-org negadas (WITH CHECK no INSERT e
no UPDATE — inclusive a tentativa de "mover" a Fase para outra Org); contexto ausente falha fechado (fase
vermelha); runtime **sem DELETE** (`permission denied`).

## Veredito
**APROVADO.** Deploy, rollback (sem tocar tabelas-pai) e reaplicação verificados com evidência real; SC-239
satisfeito. `position` é `numeric(38,18)` (Prisma `Decimal`), confirmado no Context7.
