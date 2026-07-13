# migration-check — Story 2.2 (SC-228: deploy, rollback e reaplicação de `pipe_grants`)

## Objeto
Migration `20260713130000_pipe_grants` (enums `PipeRole`/`PipeGrantState`, tabela `PipeGrant`, **índice
único parcial** `(pipeId, membershipId) WHERE state='ACTIVE'`, 3 FKs, RLS, GRANT sem DELETE) e seu rollback
`prisma/rollback/20260713130000_pipe_grants.down.sql`.

## Como foi verificado
**PostgreSQL 16 descartável** (porta 5440), papéis do **mesmo** `00-roles.sql` do Compose/deploy. O banco de
dev (5434) não foi tocado. Ambiente destruído ao final. A migration **não** foi editada para facilitar o teste.

## Resultado — todos os passos verdes

### Deploy (banco limpo — encadeia após `_pipes`)
```
Applying 20260712000000_init_tenancy_rls → 20260713000000_auth_e_antiabuso →
         20260713120000_pipes → 20260713130000_pipe_grants
All migrations have been successfully applied. · status: up to date
```

### Verificação pós-deploy
```
tabela PipeGrant existe        : OK
enums PipeRole/PipeGrantState  : OK
ENABLE + FORCE RLS             : OK
dono é o migrator (não runtime): OK
as 4 policies                  : OK (pipe_grant_delete,insert,select,update)
índice único PARCIAL (ACTIVE)  : OK   -- WHERE state='ACTIVE'
GRANT sel/ins/upd ao app       : OK
SEM GRANT DELETE (revogar=UPD) : OK (negado)
FK -> Pipe/Membership/Org      : OK (3 FKs)
```

### Smoke do índice único parcial (o coração da 2.2 — "um papel ativo por par")
```
2ª concessão ATIVA ao mesmo (pipe, pessoa) : OK (índice parcial barrou — duplicate key)
revogar e re-conceder                      : OK (slot liberado; nova linha ACTIVE aceita)
```
Prova que a unicidade é do **banco** (não da app), e que a parcialidade (`WHERE state='ACTIVE'`) permite
revogar+re-conceder sem colisão. O mesmo comportamento é coberto pela suíte vitest `pipe-grants-rls.test.ts`
(SC-223) com contexto de transação real.

### Rollback (cirúrgico)
```
PipeGrant removida             : OK
enums PipeRole/State removidos : OK
Pipe PRESERVADA                : OK (intacta)
Membership/Account PRESERVADAS : OK
histórico _prisma_migrations   : OK (linha removida)
```
Reverte **apenas** os objetos da 2.2 — `Pipe`, `Membership`, `Account` e suas linhas permanecem. Um rollback
que levasse a tabela `Pipe` junto (via cascata mal desenhada) seria catastrófico e passaria despercebido num
teste que só olhasse a ausência de `PipeGrant`.

### Reaplicação
```
Applying 20260713130000_pipe_grants → PipeGrant recriada com RLS+FORCE e índice parcial : OK
```

## Características e limitações (registradas)
- **Índice único parcial via raw SQL**, não no schema Prisma: o Prisma 6.19.3 não o expressa no schema (é
  v7.4+ — ver `context7-check`). Vai no SQL da migration, como as policies de RLS. Padrão do projeto.
- **Rollback é destrutivo para concessões** (`DROP TABLE`): reverter apaga todas as `PipeGrant`. Em produção,
  exige backup verificado antes. Próprio de rollback de schema, não defeito.
- **O CI não exercita o rollback** (só deploy) — coberto pelo débito **DBT-ROLLBACK-CI** (L6). O SC-228 prova
  o rollback à mão.
- **Falso negativo do arranjo de teste, corrigido durante a execução:** o smoke inicial usava `psql` em
  autocommit, onde `set_config(...,true)` (transaction-local) não persiste entre statements — a RLS barrava o
  setup e o smoke acusava falha inexistente. Envolver o setup em `BEGIN…COMMIT` explícito resolveu; a
  migration sempre esteve correta.

## Veredito
**APROVADO.** SC-228 satisfeito com evidência de execução real. Estrutura, RLS, índice parcial, GRANT mínimo,
FKs, rollback cirúrgico e reaplicação verificados. Pendências (rollback no CI, perda de dados no rollback)
registradas e não bloqueiam.
