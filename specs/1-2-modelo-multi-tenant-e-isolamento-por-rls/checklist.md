# Checklist de qualidade — Story 1.2 (multi-tenant + RLS)

Estado: `[x]` atendido · `[~]` pendente de validação real · `[ ]` não atendido · `N/A`.

Preenchido em 2026-07-12, **após** o Code Review adversarial e as correções CR3. Cada `[x]`
tem evidência em `_bmad-output/implementation-artifacts/gates/1-2/` ou num teste que falharia
se o comportamento regredisse. Onde o item revelou um defeito, ele está anotado na linha.

## Escopo e princípios
- [x] Escopo estrito: `Account`, `Organization`, `Membership` — nenhuma entidade de domínio
- [x] Nenhum `packages/` especulativo (CR2-09 não reaberto indevidamente)
- [x] Sem CASL, sem sessão, sem login (Stories 1.3–1.6)
- [x] Artefatos autoritativos intactos (PRD, UX, Spine, `epics.md`, readiness não foram tocados)
- [x] Nenhuma decisão de Produto presumida (`OQ-1..4` continua aberta e não bloqueia)

## Modelo de dados
- [x] `Account` global: sem `orgId`, sem RLS, e-mail único global
- [x] `Organization` como raiz do tenant
- [x] `Membership` com papel **único** (`ADMIN`/`MEMBER`/`GUEST`) e estado (`ACTIVE`/`SUSPENDED`/`REMOVED`)
- [x] Unicidade `(accountId, orgId)`
- [x] `orgId` NOT NULL + FK em toda tabela organizacional
- [x] Índice composto com `orgId` como **primeira** coluna (`Membership_orgId_state_idx`)
- [x] IDs estáveis (uuid), sem sequencial exposto
- [x] Sem `deletedAt` paralelo ao `state` (fonte de verdade única)

## RLS
- [x] `ENABLE` **e** `FORCE ROW LEVEL SECURITY` em toda tabela organizacional — verificado em `pg_class`
- [x] Policies explícitas por operação: `SELECT`, `INSERT`, `UPDATE`, `DELETE` (8 no total)
- [x] **`WITH CHECK`** presente em toda policy de escrita
- [x] `Membership`: `SELECT` permite `orgId = ctx` **OU** (`ctx` de Org ausente **E** `accountId = ctx`) — **CORRIGIDO no review**: o `OR` solto vazava o vínculo da conta em outra Organização quando os dois contextos estavam definidos, que é o caminho de produção. Havendo Org ativa, ela é a única fronteira. Ver CR3-01 / T056.
- [x] `Membership`: escrita restrita a `orgId = ctx`
- [x] **Nenhuma** policy/flag/caminho de bypass alcançável em runtime (AD-6)
- [x] SQL de RLS versionado **na migration**, não aplicado à mão
- [x] O **`GRANT`** também isola, onde a RLS não alcança — **descoberto no review**: `Account` não tem policy, e `DELETE` nela cascateava para Memberships de todas as Organizações (ações referenciais rodam com bypass de row security). Ver CR3-02 / T057.

## Contexto de tenant
- [x] `set_config(..., true)` — **transaction-local**, nunca global no pool
- [x] Contexto definido **dentro da mesma transação** da query
- [x] Sem contexto ⇒ acesso negado (deny-by-default) — incluindo por SQL cru
- [x] Contexto **nunca** vem do cliente (AD-7) — hoje não há requisição; a fronteira está documentada como contrato da Story 1.3, e `withTenantContext` diz explicitamente que **confia** no contexto que recebe
- [x] `$transaction` no client com contexto é **recusada** (erro de compilação e de runtime), em vez de corromper o contexto em silêncio — CR3-04 / T062

## Papéis de banco
- [x] `giraffe_app`: sem `BYPASSRLS`, sem `SUPERUSER`, **não proprietário** — as três provadas em teste (a de propriedade **não era testada**: ver CR3 / T011)
- [x] `giraffe_migrator`: separado, usado só em migration
- [x] `GRANT` mínimo à aplicação (sem DDL) — `Account`: `SELECT` · `Organization`: `SELECT`,`UPDATE` · `Membership`: CRUD
- [x] URLs de conexão distintas — `DATABASE_URL` validada no kernel com fail-fast; `MIGRATION_DATABASE_URL` **deliberadamente fora** do env do runtime (Divergência D1)
- [x] Papéis versionados e reprodutíveis fora do Compose (`prisma/bootstrap/00-roles.sql`, idempotente) — **corrigido no review**: existiam só no init do Docker, e a migration concedia privilégio a papéis que ela não criava (Divergência D2)

## Testes (positivos e negativos)
- [x] Rodam contra **PostgreSQL real** (nenhum mock de RLS); banco fora ⇒ suíte **vermelha**, não pulada
- [x] Fixture com **duas** Organizações (A e B) — mais a Org C, vazia, como área de escrita dos testes paralelos
- [x] Positivo: no contexto da Org A, R/C/U/remoção lógica funcionam — **o caminho positivo de `UPDATE` e de remoção lógica NÃO era testado**: uma policy que negasse toda escrita passaria na suíte antiga (CR3 / T066)
- [x] Negativo: leitura cruzada → 0 linhas
- [x] Negativo: `INSERT` com `orgId` alheio → **rejeitado** (e também **sem RETURNING**, via `createMany`: com RETURNING o teste passava pelo motivo errado, esbarrando na policy de SELECT)
- [x] Negativo: `UPDATE` cruzado → 0 linhas / `P2025` explícito
- [x] Negativo: remoção lógica cruzada → 0 linhas
- [x] Negativo: `orgId` forjado → não alcança a outra Org (inclusive mover uma linha própria para outra Org, barrado pelo `WITH CHECK`)
- [x] Negativo: sem contexto → nega tudo (leitura, escrita, e SQL cru)
- [x] Negativo: `pg_roles` prova ausência de `BYPASSRLS`/`SUPERUSER`
- [x] Negativo: `pg_class.relowner` prova que o runtime **não é dono** das tabelas
- [x] Negativo: conexão reciclada do pool não herda contexto
- [x] Positivo: conta lê as **próprias** Memberships sem contexto de Org (login da 1.4)
- [x] Negativo: conta **não** lê Memberships de outra conta
- [x] Negativo: com Org ativa, a conta **não arrasta** os vínculos dela em outras Organizações (regressão do CR3-01)
- [x] Negativo: runtime não cria/apaga `Organization`, não escreve em `Account`
- [x] Suíte estável: 3 execuções consecutivas, 62/62

## Migrations, backup e recuperação
- [x] Migration versionada, **etapa controlada** (não no boot do container)
- [x] Plano de **rollback** verificável — **exercitado** (aplicar → reverter → reaplicar → re-semear), não descrito
- [x] Seed sem dado real de produção (LGPD)
- [x] `migration-check` executado e **registrado** → `gates/1-2/migration-check.md`
- [x] `backup-check` executado e **registrado** → `gates/1-2/backup-check.md`
- [x] Restore documentado **e testado**; o banco restaurado preserva policies, `FORCE RLS`, deny-by-default e a rejeição de escrita cruzada (AD-33)

## Segurança e LGPD
- [x] `security-check` executado e **registrado** → `gates/1-2/security-check.md` (4 achados bloqueantes corrigidos)
- [x] `lgpd-check` executado e **registrado** → `gates/1-2/lgpd-check.md` (APROVADO COM RESSALVAS)
- [x] String de conexão nunca em log, erro ou payload — verificado em container real: `grep` nos logs da API → **0 ocorrências**
- [x] Sem credencial padrão — **corrigido no review**: o Compose usava `${VAR:-senha}`, e um ambiente sem a variável subia com senha conhecida e versionada. Agora `${VAR:?}` (Constitution VI)
- [x] Segredos fora do repo e da imagem (`.gitignore`, `.dockerignore`)

## Observabilidade
- [x] Organização do contexto no log estruturado
- [x] Negação por contexto ausente/inválido é **visível** (não falha silenciosa)
- [x] Toda forma de negação é visível — **corrigido no review**: o `USING` **filtra** em vez de lançar, então `updateMany`/`deleteMany` cruzados voltavam `{count: 0}` com sucesso e eram auditados como `allowed`; `update`/`delete` cruzados lançavam `P2025` e não geravam evento nenhum (CR3-04 / T059)
- [x] Auditoria mínima de `Organization`/`Membership` (ator, org, ação, recurso, resultado, timestamp) — os seis campos testados um a um
- [x] `logger` **obrigatório** na fronteira de banco: o default no-op fazia a trilha sumir em silêncio para quem esquecesse o argumento (CR3 / T061)
- [x] `observability-check` executado e **registrado** → `gates/1-2/observability-check.md`

## Containers e regressão da Story 1.1
- [x] Serviço `db` no Compose com healthcheck e volume; `api` `depends_on` healthy
- [x] `prisma generate` no build; client **e binários de engine** na imagem final
- [x] **Boot real** do container de produção conectando ao banco (build verde ≠ boot)
- [x] Boot com o banco **fora**: a aplicação sobe, `/health` 200, `/ready` 503, `RestartCount = 0`, recuperação automática — teste de regressão com o `AppModule` real
- [x] `/ready`: 200 com banco no ar, **503** com banco fora; payload sem campos extras
- [x] `/ready` prova **aptidão**, não só conectividade — lê uma tabela do schema: com as migrations não aplicadas, um `SELECT 1` responderia `200 ok` e o container entraria em rotação para falhar em toda requisição (CR3 / T063)
- [x] `/health` **não** checa o banco
- [x] Testes/smoke da Story 1.1 atualizados para cobrir os dois caminhos — **sem afrouxar asserção**
- [x] Suíte completa verde (API 62/62 · Web 8/8 · smoke 4/4); `commit-check` antes de qualquer commit

## Itens que NÃO estão atendidos (registrados, não escondidos)
- `N/A` `performance-check` — não há consumidor de domínio nem carga; medir produziria número sem significado. Custo introduzido (1 transação + 2 `set_config` por operação) está **registrado** em `gates/1-2/performance-check.md`, não omitido.
- [ ] `MembershipState` **não governa acesso**: `SUSPENDED`/`REMOVED` são gravados e lidos, mas nenhuma policy os consulta. Não há sessão a conceder ainda — vira requisito da Story 1.4.
- [ ] Constraints únicas atravessam a RLS (comportamento do PostgreSQL): `Organization.slug` e `Account.email`, únicos globais, funcionam como **oráculo de existência** entre Organizações. Fechar exige unicidade por Org ou hashing — decisão da Story do cadastro.
- [ ] `withTenantContext` **não verifica** que a conta tem Membership na Organização do contexto. A RLS isola *entre* Organizações; ela não decide *a qual* o requisitante pertence. Derivar o contexto de uma Membership validada no servidor é contrato da **Story 1.3**.
