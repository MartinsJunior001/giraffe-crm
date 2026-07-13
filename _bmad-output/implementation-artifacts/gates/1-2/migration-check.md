# migration-check — Story 1.2

**Status: APROVADO** (após correção de 1 achado bloqueante)

## Classificação da migration

`20260712000000_init_tenancy_rls` — **aditiva**. Cria enums, três tabelas, índices, FKs, duas
funções de contexto, oito policies e os GRANTs. **Nenhuma** operação destrutiva, **nenhuma**
transformação de dados, **nenhuma** coluna removida. Banco novo, sem dados anteriores.

Não é bloqueante (não há tabela em uso), não é irreversível (há `.down.sql`, exercitado).

## Achado BLOQUEANTE encontrado e corrigido

### M1 — A migration concedia privilégios a papéis que ela não criava

`CREATE ROLE giraffe_migrator` / `giraffe_app` existiam **apenas** em
`docker/db/init/01-roles.sh` — que o entrypoint do PostgreSQL executa **uma única vez, e só
quando o diretório de dados está vazio**.

Consequência: em qualquer PostgreSQL gerenciado, em qualquer volume preexistente, ou em
qualquer banco não criado por este Compose, os papéis **não existem** — e a migration morre em
`GRANT ... TO giraffe_app` com `role "giraffe_app" does not exist`. O runbook de publicação do
README não tinha passo de provisionamento de papéis. O deploy real quebraria na primeira
tentativa.

Agravante de processo: as tasks T008/T009 diziam literalmente "**na migration, versionado**" e
estavam marcadas `[x]`.

**Correção:** o SQL de papéis foi extraído para `apps/api/prisma/bootstrap/00-roles.sql` —
versionado ao lado das migrations, **idempotente** (`DO $$ IF NOT EXISTS ... $$` + `ALTER
ROLE`), e o **mesmo arquivo em todos os ambientes**. O `01-roles.sh` deixou de ter SQL: ele só
executa esse arquivo. O README ganhou o passo de bootstrap no runbook. Rodar o script de novo
**rotaciona a senha**, o que elimina a necessidade de um procedimento separado.

Não pode ser uma migration do Prisma: `CREATE ROLE` exige privilégio administrativo, que o
`giraffe_migrator` (quem executa as migrations) não tem — por decisão. Registrado como
**Divergência D2** no `tasks.md`.

## Migration como etapa controlada (AD-32)

Não roda no boot do container. `pnpm --filter @giraffe/api db:migrate` usa
`MIGRATION_DATABASE_URL` (papel dono do schema), que o serviço `api` **não** recebe.

Um container que migra ao subir transforma cada réplica e cada restart numa tentativa
concorrente de DDL.

Documentado no README que a migration roda a partir de um **checkout do repositório**, não de
dentro da imagem de produção — a imagem não carrega o CLI do Prisma (`devDependency`), nem
`scripts/`, nem `prisma/migrations/`, e isso é proposital.

## Rollback — EXERCITADO, não descrito

Executado nesta rodada, do início ao fim:

```
1. db:rollback   → "Script executed successfully"
2. estado:         tabelas=1 (só _prisma_migrations) · policies=0 · funcoes=0
3. db:migrate    → "All migrations have been successfully applied"
4. db:seed       → "Script executed successfully"
5. estado final:   policies=8 · orgs=3 · memberships=4 · accounts=4
                   Account   rls=false force=false
                   Organization rls=true force=true
                   Membership   rls=true force=true
```

Estado final **idêntico** ao anterior ao rollback. O `.down.sql` também remove a linha de
`_prisma_migrations`, então o Prisma volta a considerar a migration não aplicada — é isso que
permite reaplicar.

## Achados menores corrigidos

- `db:rollback` era citado na documentação e **não existia** como script. Criado.
- O caminho do arquivo de rollback era **fixo** no `db-migrate.mjs`: com uma segunda migration,
  `rollback` reverteria a **primeira**, derrubando as tabelas base por baixo da mais nova.
  Agora resolve a mais recente (ordem lexicográfica = cronológica, pelo timestamp) e aceita um
  nome explícito.
- Falha ao *spawnar* o CLI (`result.error`, ex.: ENOENT) saía com código 1 **sem imprimir
  nada**. Migration que falha em silêncio é a pior classe de falha possível aqui. Corrigido.

## Reprodutibilidade do zero

`docker compose down -v` → `up -d db` (bootstrap de papéis roda) → `db:migrate` → `db:seed` →
**62/62 testes verdes**. Executado nesta rodada.
