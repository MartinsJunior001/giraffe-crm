# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Idioma do projeto: **português (pt-BR)**, incluindo comentários de código, documentação e mensagens de commit.

## Comandos

Pré-requisitos: Node 24 (`.nvmrc`) e `corepack enable` (pnpm 10 fixado em `packageManager`).

```bash
pnpm install                 # dev; em CI/validação: pnpm install --frozen-lockfile
pnpm dev                     # web (3000) + api (3001) em paralelo
pnpm lint / pnpm lint:fix    # ESLint 9 flat
pnpm format:check            # Prettier 3
pnpm typecheck               # tsc --noEmit em cada app
pnpm test                    # Vitest 4 em cada app — EXIGE PostgreSQL no ar (ver abaixo)
pnpm build                   # build de api e web
pnpm compose:up / :down      # execução conteinerizada
pnpm smoke                   # valida /health, /ready, /healthz e a casca de um ambiente JÁ no ar
```

Banco (a partir da Story 1.2 — `pnpm test` não passa sem ele):

```bash
cp .env.example .env                       # o Compose EXIGE as senhas; sem elas, `up` falha
docker compose up -d db                    # PostgreSQL 16 (host 127.0.0.1:5434)
pnpm --filter @giraffe/api db:migrate      # migrations (papel giraffe_migrator)
pnpm --filter @giraffe/api db:seed         # fixture: Orgs A, B e C
pnpm --filter @giraffe/api db:status       # estado das migrations
pnpm --filter @giraffe/api db:rollback     # ⚠️ DESTRUTIVO — reverte a migration mais recente
```

A suíte de RLS roda contra um PostgreSQL **real** e fica **vermelha** — não pulada — se o banco estiver fora: quem nega o acesso é o banco, e um mock não provaria nada. Banco indisponível é falha, não ausência de evidência.

Testes de um app ou arquivo (Vitest roda a partir da raiz de cada app):

```bash
pnpm --filter @giraffe/api test                       # só a API
pnpm --filter @giraffe/api exec vitest run test/env.test.ts
pnpm --filter @giraffe/api exec vitest run -t "nome do teste"
```

`pnpm smoke` **não sobe serviços** — exige `pnpm dev` ou `pnpm compose:up` antes. Aceita `API_URL`, `WEB_URL`, `SMOKE_TIMEOUT_MS`.

## Processo obrigatório (precede qualquer código)

Este repositório é governado por `.specify/memory/constitution.md`, cuja versão vigente e princípios estão registrados no próprio arquivo. Ela tem precedência sobre conveniência e hábito. Pontos que mudam o que você pode fazer:

- **Sequência oficial:** Documentação Base → BMAD → Spec Kit → Implementação → Validações por skills → Deploy. Não se escreve código de aplicação antes de a Story ter passado por BMAD e pelo Spec Kit (`specify → clarify → plan → checklist → tasks → analyze`; `converge` quando já há implementação parcial).
- **Gate pré-código:** `skills/pre-implementation-check.md` é obrigatório antes de implementar, corrigir bug funcional, criar migration, adicionar dependência ou mudar arquitetura. Ele produz um relatório com status `APROVADO` / `APROVADO COM RESSALVAS` / `BLOQUEADO`. Depois vem `safe-implementation`, e antes de concluir a Story: `security-check`, `observability-check` e (quando aplicável) `lgpd-check`, `migration-check`, `backup-check`, `performance-check` — todos em `skills/`.
- **Verificação documental antes de escrever código — obrigatória:** sempre que a implementação envolver biblioteca, framework, SDK, API, CLI ou serviço da stack, execute o `context7-check` antes de codificar, mesmo que a API pareça conhecida. Use como baseline a versão efetivamente declarada ou instalada no projeto, conforme `package.json`, `packageManager`, lockfile, Dockerfile ou configuração equivalente. Consulte preferencialmente o MCP do Context7 (`resolve-library-id` → `query-docs`). Quando o Context7 estiver indisponível ou não cobrir a tecnologia, consulte a documentação oficial atual e registre a fonte utilizada. Não invente assinaturas, opções de configuração ou versões. Quando a documentação atual contradisser o plano ou a arquitetura, registre a divergência e escale antes de implementar.
- **Sem antecipar escopo:** nada de Fase 2, nada de abstração especulativa (módulo vazio, repositório genérico, event bus) sem consumidor concreto. Proibição registrada explicitamente em `apps/api/src/kernel/README.md`.
- **Artefatos autoritativos não são editados diretamente pela implementação:** PRD, UX, Architecture Spine, `epics.md` e readiness report só mudam por seus workflows oficiais. O `sprint-status.yaml` e o status da Story só podem ser atualizados pelo workflow BMAD responsável, nunca por edição manual ou por uma implementação fora desse fluxo.
- **Commit:** não commitar antes do `commit-check`; nunca fazer push/deploy sem autorização explícita. Ver **Commit automático por seção**, abaixo.

Referências de decisão: `AD-*` (decisões de arquitetura) e invariantes vivem em `_bmad-output/planning-artifacts/architecture/*/ARCHITECTURE-SPINE.md`; a documentação de produto da Fase 1 está em `docs/01-documentacao-base/` (índice: `00-indice-fase-1.md`). `docs/_arquivo-legado/` **não é fonte oficial**; o protótipo HTML em `08-referencias-visuais/prototypes/` é referência visual, **não** modelo de dados nem arquitetura final.

## Commit automático por seção

Ao concluir cada seção, etapa ou Story com alterações versionáveis:

1. confirme que o escopo foi concluído e os gates obrigatórios estão verdes;
2. execute automaticamente a skill `commit-check`;
3. se o resultado for aprovado, execute automaticamente a skill `commit`;
4. crie um commit pequeno, atômico e com mensagem em português no padrão do projeto;
5. não inclua arquivos fora do escopo, temporários, segredos ou configurações locais;
6. não faça commit de trabalho parcial, bloqueado ou com testes vermelhos;
7. nunca execute `push`, merge, deploy ou mudança de branch sem autorização explícita.

Se a seção não gerar uma entrega versionável, não crie commit e registre apenas:

`SEM COMMIT — nenhuma alteração versionável nesta seção.`

## Git e integração

- **Branch por Story** (`story/<n>-<slug>`) ou por tarefa técnica (`tech/<slug>`). Nunca se trabalha direto em `main`.
- **Integração por Pull Request**, com o CI verde. O PR é o ponto em que a verificação deixa de ser local.
- **Merge commit (`--no-ff`), não squash.** Os commits desta base são atômicos e cada um carrega o _porquê_ no corpo — o commit que corrige um vazamento cross-tenant explica como ele foi reproduzido. Squash funde tudo numa mensagem só e joga fora exatamente a informação que um `git bisect` ou uma investigação de incidente vai procurar. Rebase reescreveria história já publicada.
- **Nunca `--force`** em história compartilhada, e nunca `--no-verify`.

## Invariantes conceituais (nunca erodir)

`Pipe ≠ Database` · `Card ≠ Registro` · `Fase ≠ Status do Card` · `Super Admin (Plataforma) ≠ Admin da Organização` · `Usuário ≠ Organização`. Identidade é Account global + Membership por Organização. Autorização é **deny-by-default** e `PERMISSÃO = AÇÃO + ESCOPO`; isolamento por Organização é o invariante-mãe. Os três Formulários (inicial, de fase, de database) são independentes.

## Arquitetura

Monorepo pnpm workspaces (`apps/*`), TypeScript estrito compartilhado via `tsconfig.base.json` (`strict` + `noUncheckedIndexedAccess`). O frontend consome apenas a API interna e nenhuma superfície de API pública é implementada. Nenhuma regra de domínio deve existir no frontend.

**Estado transitório da implementação — Story 2.3 (gerenciamento de Fases).** O L1 está fechado: existe banco com isolamento por RLS, autenticação e sessão (1.4/1.5), contexto de Organização resolvido no servidor (1.3), autorização por papel (1.6, CASL deny-by-default) e a casca navegável (1.7/1.8). O Épico 2 avançou: **existe `Pipe`** (2.1 — ciclo de vida/catálogo, Admin da Org), **`PipeGrant`** (2.2 — concessão de papel por Pipe + acesso por concessão: toda Membership ativa com concessão ACTIVE lê o Pipe concedido, não-enumeração 404; ciclo de vida/config do Pipe só do Admin da Org) e **`Phase`** (2.3 — Fase do fluxo dentro de um Pipe: criar/renomear/reordenar/arquivar/restaurar, ordenação fracionária, invariante "≥1 Fase ativa").

**O papel de Pipe deixou de ser dormente para _config_.** Na 2.2 o `PipeRole` era armazenado mas inerte (decisão SC-222=B). Na 2.3, **gerenciar Fases é "config do Pipe"** (PRD §7) e ativa o diferencial: gerencia o **Admin da Org** (qualquer Pipe) **ou** o **Admin do Pipe** (concessão `role=ADMIN` ACTIVE, com `Membership` ACTIVE); MEMBER/VIEWER concedidos só leem. A guarda grossa das rotas de Fase é `@Requer('ler','Pipe')`; o diferencial vive no `PhasesService` (DBT-AUTHZ-01), sem tocar o guard/`ability.ts` (C3 congelado). A outra metade do papel (Membro do Pipe **opera cards**) continua deferida a 2.7/2.10 (DBT-2.2-ROLE-DORMENTE).

**Não** existe ainda: Formulários (2.4+), **Cards** (2.7+) nem Databases. As travas "não arquivar Pipe com Cards ativos" (2.11) e "não arquivar Fase com Cards ativos" (ciclo de vida do Card) são **contrato futuro** — não há tabela de Card, e nenhuma foi materializada para preparar o futuro (AD-11).

Este bloco descreve o estado real do código na Story atual e deve ser revisado ao encerrar esta Story ou iniciar a próxima, para não se tornar uma descrição histórica incorreta.

- `apps/api` — NestJS 11. `main.ts` faz **fail-fast**: `getEnv()` valida o ambiente (Zod, `kernel/config/env.ts`) _antes_ de o Nest subir; CORS restrito sem wildcard; `enableShutdownHooks()`. `AppModule` configura Pino via `forRootAsync` (a validação de env fica no `useFactory`, para que importar o módulo em testes não tenha efeito colateral), com redaction de `authorization`/`cookie`/`set-cookie` e supressão de log dos probes.
- `apps/api/src/kernel/` — fronteira técnica transversal mínima (AD-4/AD-5). **Regra de negócio nunca vive aqui.** Hoje `config/`, `db/`, `context/` (contexto de Organização por requisição) e `authz/` (substrato CASL + guard deny-by-default).
- `apps/api/src/pipes/` — domínio do Épico 2. `PipesService`/`PipeGrantsService`/`PhasesService` fazem **toda** query por `withTenantContext` — não há um único `where orgId` manual, porque um `where` se esquece e a policy não. Nenhuma rota aceita `orgId` do cliente. **Não há rota de exclusão** em nenhuma das três entidades: o runtime **não tem GRANT de DELETE** em `Pipe`/`PipeGrant`/`Phase`. Arquivar/revogar é mudança de estado (preserva os dados) e idempotente; transições respondem **200**, criação **201**. Subdomínios: `grants/` (concessões, 2.2) e `phases/` (Fases, 2.3). A autorização FINA por recurso (qual Pipe cada não-Admin acessa; quem gerencia Fases) vive **no serviço** (DBT-AUTHZ-01), não no guard.
- `apps/api/src/kernel/db/` — `PrismaService` (client do runtime, papel `giraffe_app`) e `tenant-context.ts`. **A conexão é preguiçosa por decisão**: um `$connect()` ansioso mataria o processo com o banco fora no boot, antes de abrir a porta — sem `/health`, sem `/ready`, sem 503.
- `apps/web` — Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4. `lib/env.ts` lê `API_BASE_URL` (variável de **servidor**, deliberadamente sem `NEXT_PUBLIC_`); `lib/api.ts` consulta `/health` com timeout e devolve **estado honesto e sanitizado** — falha nunca vaza URL interna, stack ou segredo. `GET /healthz` é a liveness da Web: rota local, sem I/O, **não** consulta a API (a saúde do container não pode depender de um serviço terceiro).

**Health vs. readiness são semanticamente distintos**: `GET /health` (liveness, nunca toca o banco) e `GET /ready` (readiness). Desde a Story 1.2, `/ready` **consulta o banco** e devolve **503** quando ele não está apto — a sonda lê uma tabela do schema (`LIMIT 0`), o que prova conexão, migrations aplicadas e GRANT concedido. Um `SELECT 1` provaria só o socket, e um container com o schema ausente responderia `200 ok` para falhar em toda requisição real. Nenhum payload expõe versão, variáveis, paths ou segredos.

### Isolamento multi-tenant (o invariante-mãe)

- Quem isola é o **banco**, não a aplicação: `Organization`, `Membership`, `Pipe`, `PipeGrant` e `Phase` têm `ENABLE` **e** `FORCE ROW LEVEL SECURITY`. `Account` é global e **sem RLS** (AD-10) — a identidade não pertence a um tenant.
- **Toda tabela organizacional nova replica esse padrão** (`Pipe`, `PipeGrant` e `Phase` no Épico 2): policies `select/insert/update/delete` por `orgId = current_org_id()`, com `WITH CHECK` no INSERT **e** no UPDATE — sem o `WITH CHECK`, um INSERT com `orgId` alheio seria aceito e ficaria invisível, e um UPDATE poderia **mover** a linha para outra Organização.
- **Nenhuma query organizacional pode passar fora de `withTenantContext()`/`withAccountContext()`** (`kernel/db/tenant-context.ts`). O contexto é definido por **transação** (`set_config(..., true)`); com `false` ele grudaria na conexão e vazaria pelo pool.
- **Não existe, e não pode passar a existir, caminho de bypass de RLS alcançável em runtime** (AD-6). O exemplo oficial do Prisma sugere uma `bypass_rls_policy` — proibida aqui.
- **Dois papéis de banco, nunca o mesmo:** `giraffe_app` (runtime; sem `BYPASSRLS`, não é dono das tabelas, DML mínima) e `giraffe_migrator` (dono do schema, só migrations). O processo que atende requisição **nunca** tem em mãos a credencial do dono.
- **O `GRANT` é fronteira de segurança, não detalhe administrativo.** Onde a RLS não alcança, é ele que nega: `Account` não tem policy, então o runtime tem **só `SELECT`** nela — com `DELETE`, a cascata da FK apagaria Memberships de **todas** as Organizações, porque ações referenciais rodam com bypass de row security. Pela mesma razão o runtime não pode criar nem apagar `Organization`. Em `Pipe`, o runtime tem `SELECT/INSERT/UPDATE` e **não** `DELETE`: "sem exclusão definitiva" é garantido pelo banco, não pela ausência de rota — uma rota de DELETE acrescentada por engano amanhã bateria em `permission denied`. Ao conceder um privilégio novo, escreva o teste que prova o escopo dele.
- `$transaction` no client com contexto é **recusada** (erro de compilação e de runtime): a extensão fecha sobre o client raiz, então uma transação externa rodaria em outra conexão, sem contexto. Transação com contexto é escopo da Story 1.3.
- **Mutação de entidade organizacional entra na trilha de auditoria** (`MODELOS_AUDITADOS` em `tenant-context.ts` — hoje `Organization`, `Membership`, `Pipe`, `PipeGrant`, `Phase`), inclusive a **tentativa negada**: um `updateMany` filtrado pela policy volta `{ count: 0 }` com sucesso aparente, e sem isso a tentativa mais óbvia de vandalismo cross-tenant seria registrada como `allowed`. O troco é um falso positivo conhecido: uma operação idempotente legítima (arquivar um Pipe/Fase já arquivado) também produziria `count: 0` — por isso os caminhos idempotentes retornam SEM emitir o `updateMany`.

## Convenções que o código já assume

- **Segredos e configuração:** `.env` nunca é versionado (só `.env.example`); segredos vêm do cofre/ambiente, nunca de imagem, log ou health. Variável obrigatória ausente → falha honesta, sanitizada, listando apenas _nomes_ de variáveis (ver `ConfigValidationError`).
- **Logs:** estruturados (Pino), sempre sanitizados — nunca senhas, tokens, cookies, headers de auth, corpos de e-mail, prompts/respostas de IA ou PII desnecessária.
- **Versões:** fixadas no `pnpm-lock.yaml`. Nunca `latest`; não trocar a stack sem decisão arquitetural registrada. A API de qualquer biblioteca se confere no MCP do Context7 (ver gate acima), não de memória.
- **Migrations:** versionadas e aplicadas como **etapa controlada** (`db:migrate`), nunca no boot do container — um container que migra ao subir transforma cada réplica e cada restart numa tentativa concorrente de DDL. `prisma db push` não substitui migration versionada. O bootstrap dos **papéis** (`apps/api/prisma/bootstrap/00-roles.sql`) é idempotente, roda com papel administrativo e **precede** as migrations: criar papel exige privilégio que nem o migrator tem.
- **Testes:** Vitest com `include: ['test/**/*.test.ts']` — testes ficam em `apps/*/test/`, fora de `src/`. O contrato HTTP (`/health`, `/ready`) e o isolamento por RLS são cobertos por **teste de integração real** (AppModule em porta efêmera; PostgreSQL de verdade): um teste que só chamasse a função de payload continuaria verde se a rota fosse renomeada, e um mock de banco não provaria isolamento nenhum. Os arquivos de teste rodam em **paralelo** — Orgs A e B são fixture de **leitura**; escreva na **Org C**, ou o seu teste quebra o do vizinho por contagem. O typecheck da API cobre `src` **e** `test` (`tsconfig.json`); o build usa `tsconfig.build.json`, que exclui os testes de `dist`.
- **Um teste pode passar pelo motivo errado.** Nesta base isso já aconteceu duas vezes: o `create` do Prisma emite `INSERT ... RETURNING`, e o RETURNING esbarra na policy de **SELECT** — o teste de inserção cruzada ficava verde mesmo com o `WITH CHECK` desligado (por isso existe a versão com `createMany`, que não tem RETURNING). E o teste de "não é dono das tabelas" nunca olhava para `relowner`. Ao escrever um teste de segurança, **prove a fase vermelha**: quebre a policy de propósito e confirme que ele falha.
- **ESLint ignora** `docs/`, `_bmad/`, `_bmad-output/`, `skills/`, `specs/`, `.specify/`, `.github/`, `.agent*/` — são tooling e documentação, não código de aplicação.
- **CI:** `.github/workflows/ci.yml` — 4 jobs (`qualidade`, `testes`, `containers`, `seguranca`). O banco do CI sobe pelo **Docker Compose**, para que exista **uma única** definição de provisionamento de papéis; reescrevê-la no YAML criaria uma segunda verdade, e a que vale em produção seria a que ninguém testa. Senhas de CI são geradas por execução; actions são fixadas por **SHA**, nunca por tag (tag é mutável).
- **Testes verdes ≠ afirmação:** um critério de aceite só é marcado como concluído com evidência de execução real (Constitution X).
