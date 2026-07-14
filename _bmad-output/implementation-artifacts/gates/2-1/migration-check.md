# migration-check — Story 2.1 (SC-206: deploy, rollback e reaplicação)

## Objeto
Migration `20260713120000_pipes` (enum `PipeState`, tabela `Pipe`, índice, FK, RLS, GRANT) e seu rollback
`prisma/rollback/20260713120000_pipes.down.sql`.

## Como foi verificado
**PostgreSQL 16 descartável**, container efêmero na porta 5439 — o banco de desenvolvimento (5434) **não
foi tocado**. Os papéis (`giraffe_migrator`, `giraffe_app`) vieram do **mesmo** `prisma/bootstrap/00-roles.sql`
que o Compose e o deploy usam: uma definição só de provisionamento, para que o que vale em produção não
seja justamente a que ninguém testa. Ambiente destruído ao final.

A migration **não foi editada** para facilitar o teste.

### Comandos (reproduzíveis)

```bash
# 1. banco limpo, descartável (senhas efêmeras, geradas por execução)
docker run -d --name giraffe-sc206 \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$SUPER_PW" -e POSTGRES_DB=giraffe \
  -p 127.0.0.1:5439:5432 postgres:16-alpine

# 2. bootstrap dos papéis — o MESMO arquivo versionado do Compose/deploy
docker cp apps/api/prisma/bootstrap/00-roles.sql giraffe-sc206:/tmp/00-roles.sql
docker exec giraffe-sc206 psql -U postgres -d giraffe -v ON_ERROR_STOP=1 \
  --set=migrator_password="$MIG_PW" --set=app_password="$APP_PW" --set=db_name=giraffe \
  -f /tmp/00-roles.sql

# 3. deploy / 9. rollback / 11. reaplicação (papel dono do schema, via MIGRATION_DATABASE_URL)
cd apps/api
export MIGRATION_DATABASE_URL="postgresql://giraffe_migrator:$MIG_PW@127.0.0.1:5439/giraffe?schema=public"
node ../../scripts/db-migrate.mjs deploy
node ../../scripts/db-migrate.mjs status
node ../../scripts/db-migrate.mjs rollback     # ⚠️ DESTRUTIVO
node ../../scripts/db-migrate.mjs deploy       # reaplicação

# 13. destruição do ambiente
docker rm -f giraffe-sc206
```

## Resultado — 13/13 passos verdes

### Deploy (banco limpo)
```
3 migrations found in prisma/migrations
Applying migration `20260712000000_init_tenancy_rls`
Applying migration `20260713000000_auth_e_antiabuso`
Applying migration `20260713120000_pipes`
All migrations have been successfully applied.
→ status: Database schema is up to date!
```

### Verificação pós-deploy (estrutura, RLS, privilégios)
```
tabela Pipe existe            : OK
enum PipeState existe         : OK
indice (orgId,state)          : OK          -- Pipe_orgId_state_idx
FK orgId -> Organization      : OK          -- Pipe_orgId_fkey
ENABLE ROW LEVEL SECURITY     : OK
FORCE ROW LEVEL SECURITY      : OK
dono NAO e o runtime          : OK (migrator)
as 4 policies                 : OK (pipe_delete,pipe_insert,pipe_select,pipe_update)
GRANT SELECT  ao giraffe_app  : OK
GRANT INSERT  ao giraffe_app  : OK
GRANT UPDATE  ao giraffe_app  : OK
SEM GRANT DELETE (AC3)        : OK (negado)
```
`FORCE` foi verificado **além** de `ENABLE`: sem ele o dono da tabela escaparia das policies, e `ENABLE`
sozinho daria uma falsa sensação de isolamento. O dono é o `giraffe_migrator`, nunca o runtime.

### Smoke com o papel de runtime (`giraffe_app`)
```
INSERT+SELECT no contexto proprio : OK (1 visivel)
outro tenant NAO ve o Pipe        : OK (0 visivel)
SEM contexto, nada e visivel      : OK (0 visivel)
SEM contexto, INSERT e NEGADO     : OK (RLS barrou)
DELETE pelo runtime e NEGADO      : OK (sem GRANT — permission denied)
```

### Rollback
```
[db] revertendo a migration mais recente: 20260713120000_pipes.down.sql
Script executed successfully.   (down.sql)
Script executed successfully.   (DELETE FROM "_prisma_migrations")

tabela Pipe removida          : OK
enum PipeState removido       : OK
policies de Pipe removidas    : OK
historico _prisma_migrations  : OK (linha removida)
Organization PRESERVADA       : OK (2 orgs intactas)
Membership PRESERVADA         : OK
Account PRESERVADA            : OK
→ status: Following migration have not yet been applied  (coerente com o banco real)
```
A remoção é **cirúrgica**: só os objetos da 2.1 saem. As tabelas do L1 e seus dados permanecem — um
rollback que levasse `Organization` junto seria catastrófico e passaria despercebido num teste que só
olhasse a ausência de `Pipe`.

O passo do `_prisma_migrations` **não é cosmético**: sem ele, o `deploy` seguinte responderia "nada
pendente" com **exit 0** e o banco sem a tabela — a ferramenta afirmando que está tudo certo enquanto a
aplicação quebra em toda requisição.

### Reaplicação
```
Applying migration `20260713120000_pipes`
All migrations have been successfully applied.
→ status: Database schema is up to date!

tabela Pipe recriada          : OK
RLS ENABLE+FORCE de novo      : OK
as 4 policies de novo         : OK
SEM GRANT DELETE de novo      : OK
tabela recriada VAZIA         : OK
```

## Características e limitações (registradas, não escondidas)

- **O rollback oficial é manual, por `.down.sql`.** O Prisma não oferece "des-aplicar" migration
  bem-sucedida (`migrate resolve --rolled-back` só aceita migration em estado `FAILED`, `P3012`). O
  procedimento do projeto é `pnpm --filter @giraffe/api db:rollback`, que executa o `.down.sql` **e**
  remove a linha do histórico. É operação **administrativa e destrutiva**, nunca automática, nunca no boot.
- **Rollback de schema NÃO preserva dados de Pipe.** `DROP TABLE` apaga todos os Pipes; a reaplicação
  recria a tabela **vazia** (confirmado acima). Em produção, reverter esta migration é uma operação **com
  perda de dados** e exige backup verificado antes — ver `backup-check.md`. Isto é próprio de rollback de
  schema, não um defeito desta migration.
- **O CI não exercita o rollback** (só o `deploy`). O SC-206 prova que ele funciona hoje, mas uma migration
  futura que quebre o `.down.sql` só seria descoberta durante um incidente. Registrado como risco **R-3**
  em `specs/2-1-.../analyze.md`; corrigi-lo é tarefa técnica própria (infra de CI), fora do escopo
  congelado da 2.1.
- **Falso negativo do arranjo de teste, corrigido durante a execução.** A primeira versão do script usava
  `psql | grep -q` sob `pipefail`: o `grep -q` fecha o pipe, o psql morre de SIGPIPE e o pipeline reporta
  falha **mesmo quando o padrão casa**. As duas provas de segurança (INSERT sem contexto negado; DELETE
  negado) apareceram como `FALHOU` por causa disso. A saída passou a ser capturada em variável antes de
  ser inspecionada, e ambas são **OK**. Fica registrado porque um arranjo de teste que mente é exatamente
  o que esta base já aprendeu a desconfiar — e aqui ele mentiu no sentido seguro (alarme falso), mas
  poderia ter mentido no outro.

## Conformidade

- **AD-17** — migration versionada, aplicada como etapa controlada, reversível e não destrutiva para os
  dados existentes (só cria objetos novos).
- **AD-6** — dois papéis distintos; runtime sem `BYPASSRLS` e não-dono; GRANT mínimo.
- **Constitution X** — nada aqui é afirmação: cada linha acima é saída de execução real.

## Veredito

**APROVADO.** SC-206 satisfeito com evidência de execução real. Pendências registradas (R-3, R-4) são
riscos operacionais conhecidos, escalados, e não bloqueiam a Story.
