# Checklist de qualidade — Story 1.2 (multi-tenant + RLS)

Estado: `[x]` atendido · `[~]` pendente de validação real · `[ ]` não atendido · `N/A`.

## Escopo e princípios
- [ ] Escopo estrito: `Account`, `Organization`, `Membership` — nenhuma entidade de domínio
- [ ] Nenhum `packages/` especulativo (CR2-09 não reaberto indevidamente)
- [ ] Sem CASL, sem sessão, sem login (Stories 1.3–1.6)
- [ ] Artefatos autoritativos intactos
- [ ] Nenhuma decisão de Produto presumida (`OQ-1..4` continua aberta e não bloqueia)

## Modelo de dados
- [ ] `Account` global: sem `orgId`, sem RLS, e-mail único global
- [ ] `Organization` como raiz do tenant
- [ ] `Membership` com papel **único** (`ADMIN`/`MEMBER`/`GUEST`) e estado (`ACTIVE`/`SUSPENDED`/`REMOVED`)
- [ ] Unicidade `(accountId, orgId)`
- [ ] `orgId` NOT NULL + FK em toda tabela organizacional
- [ ] Índice composto com `orgId` como **primeira** coluna
- [ ] IDs estáveis (uuid), sem sequencial exposto
- [ ] Sem `deletedAt` paralelo ao `state` (fonte de verdade única)

## RLS
- [ ] `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela organizacional
- [ ] Policies explícitas por operação: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- [ ] **`WITH CHECK`** presente em toda policy de escrita
- [ ] `Membership`: `SELECT` permite `orgId = ctx` **OU** `accountId = ctx` (login da 1.4)
- [ ] `Membership`: escrita restrita a `orgId = ctx`
- [ ] **Nenhuma** policy/flag/caminho de bypass alcançável em runtime
- [ ] SQL de RLS versionado **na migration**, não aplicado à mão

## Contexto de tenant
- [ ] `set_config(..., true)` — **transaction-local**, nunca global no pool
- [ ] Contexto definido **dentro da mesma transação** da query
- [ ] Sem contexto ⇒ acesso negado (deny-by-default)
- [ ] Contexto **nunca** vem do cliente (AD-7)

## Papéis de banco
- [ ] `giraffe_app`: sem `BYPASSRLS`, sem `SUPERUSER`, **não proprietário**
- [ ] `giraffe_migrator`: separado, usado só em migration
- [ ] `GRANT` mínimo à aplicação (sem DDL)
- [ ] URLs de conexão distintas, validadas no kernel com fail-fast

## Testes (positivos e negativos)
- [ ] Rodam contra **PostgreSQL real** (nenhum mock de RLS)
- [ ] Fixture com **duas** Organizações
- [ ] Positivo: no contexto da Org A, R/C/U/remoção lógica da Org A funcionam
- [ ] Negativo: leitura cruzada → 0 linhas
- [ ] Negativo: `INSERT` com `orgId` alheio → **rejeitado**
- [ ] Negativo: `UPDATE` cruzado → 0 linhas
- [ ] Negativo: remoção lógica cruzada → 0 linhas
- [ ] Negativo: `orgId` forjado → não alcança a outra Org
- [ ] Negativo: sem contexto → nega tudo
- [ ] Negativo: `pg_roles` prova ausência de `BYPASSRLS`/`SUPERUSER`
- [ ] Negativo: conexão reciclada do pool não herda contexto
- [ ] Positivo: conta lê as **próprias** Memberships sem contexto de Org
- [ ] Negativo: conta **não** lê Memberships de outra conta

## Migrations, backup e recuperação
- [ ] Migration versionada, **etapa controlada** (não no boot do container)
- [ ] Plano de **rollback** verificável
- [ ] Seed com duas Organizações, sem dado real de produção
- [ ] `migration-check` executado (deixa de ser N/A)
- [ ] `backup-check` executado (deixa de ser N/A)
- [ ] Restore documentado; backup concluído **não** é prova de recuperabilidade (AD-33)

## Segurança e LGPD
- [ ] `security-check` executado
- [ ] `lgpd-check` executado (**primeira PII do projeto**: `Account.email`)
- [ ] String de conexão nunca em log, erro ou payload
- [ ] Sem credencial padrão; segredos fora do repo e da imagem

## Observabilidade
- [ ] Organização do contexto no log estruturado
- [ ] Negação por contexto ausente/inválido é **visível** (não falha silenciosa)
- [ ] Auditoria mínima de `Organization`/`Membership` (ator, org, ação, recurso, resultado, timestamp)
- [ ] `observability-check` executado

## Containers e regressão da Story 1.1
- [ ] Serviço `db` no Compose com healthcheck e volume; `api` `depends_on` healthy
- [ ] `prisma generate` no build; client **e binários de engine** na imagem final
- [ ] **Boot real** do container de produção conectando ao banco (build verde ≠ boot)
- [ ] `/ready`: 200 com banco no ar, **503** com banco fora; payload sem campos extras
- [ ] `/health` **não** checa o banco
- [ ] Testes/smoke da Story 1.1 atualizados para cobrir os dois caminhos — **sem afrouxar asserção**
- [ ] Suíte completa verde; `commit-check` antes de qualquer commit
