# Giraffe CRM — Fase 1

Monorepo do Giraffe CRM.

- **Story 1.1 — Esqueleto executável e ambiente base**: base reproduzível front+back.
- **Story 1.2 — Modelo multi-tenant e isolamento por RLS**: `Account`, `Organization` e
  `Membership` no PostgreSQL, com isolamento **imposto pelo banco** via Row-Level Security.

Ainda sem autenticação, Pipes/Cards/Databases etc.

## Stack

| Camada      | Tecnologia                                                  |
| ----------- | ----------------------------------------------------------- |
| Runtime     | Node.js **24 LTS**                                          |
| Gerenciador | **pnpm 10** (via Corepack)                                  |
| Monorepo    | pnpm workspaces (`apps/*`)                                  |
| Backend     | NestJS **11** (`apps/api`) + Pino                           |
| Banco       | PostgreSQL **16** + Prisma **6** + **Row-Level Security**   |
| Frontend    | Next.js **16** + React **19** + Tailwind **4** (`apps/web`) |
| Linguagem   | TypeScript **5.9**                                          |
| Qualidade   | ESLint 9 (flat) · Prettier 3 · Vitest 4                     |
| Container   | Docker (node:24-slim) + Docker Compose                      |

> Versões exatas fixadas em `pnpm-lock.yaml`. Não use `latest`.

## Pré-requisitos

- **Node.js 24** (veja `.nvmrc` — `nvm use`).
- **Corepack** habilitado: `corepack enable` (usa o pnpm fixado em `packageManager`).
- **Docker** + **Docker Compose** (necessário: o PostgreSQL de desenvolvimento sobe no
  Compose, e os testes de isolamento exigem um banco **real**).

## Configuração

```bash
cp .env.example .env
```

Variáveis (todas em `.env.example`, sem valores sensíveis):

| Variável                 | App     | Tipo     | Descrição                                                          |
| ------------------------ | ------- | -------- | ------------------------------------------------------------------ |
| `NODE_ENV`               | api     | privada  | `development`/`test`/`production`                                  |
| `API_PORT`               | api     | privada  | porta da API (default 3001)                                        |
| `CORS_ALLOWED_ORIGINS`   | api     | privada  | **obrigatória**; origens permitidas (sem wildcard)                 |
| `LOG_LEVEL`              | api     | privada  | nível de log Pino                                                  |
| `DATABASE_URL`           | api     | privada  | **obrigatória**; papel `giraffe_app` (runtime)                     |
| `MIGRATION_DATABASE_URL` | scripts | privada  | papel `giraffe_migrator` (dono do schema) — **só migrations**      |
| `POSTGRES_PASSWORD`      | compose | privada  | **obrigatória**; superusuário do container de banco                |
| `MIGRATOR_PASSWORD`      | compose | privada  | **obrigatória**; senha de `giraffe_migrator`                       |
| `APP_PASSWORD`           | compose | privada  | **obrigatória**; senha de `giraffe_app`                            |
| `API_BASE_URL`           | web     | servidor | URL base da API interna, lida server-side (não exposta ao browser) |

Segredos **nunca** são versionados: `.env` está no `.gitignore`; só `.env.example` é rastreado.

As três senhas **não têm valor padrão** no Compose: sem elas, `docker compose up` falha dizendo qual falta. Um default silencioso é uma credencial insegura — o ambiente que esquece a variável não quebra, ele sobe com uma senha conhecida e publicada no Git.

### Por que duas URLs de banco

A aplicação e as migrations usam **papéis diferentes**, e essa separação é o que sustenta o
isolamento:

- `giraffe_app` (runtime) — `NOSUPERUSER`, `NOBYPASSRLS`, **não é dono** das tabelas. Não
  consegue ignorar as policies nem executar DDL.
- `giraffe_migrator` — dono do schema, usado **apenas** pelas migrations.

O `MIGRATION_DATABASE_URL` **não** é lido pelo `env.ts` da API: o processo que atende
requisições nunca tem em mãos uma credencial capaz de contornar o RLS. Há um teste que
garante isso.

## Banco de dados

```bash
docker compose up -d db                 # PostgreSQL (porta 5434 no host, só em 127.0.0.1)
pnpm --filter @giraffe/api db:migrate   # aplica as migrations (papel migrator)
pnpm --filter @giraffe/api db:seed      # fixture: Organizações A, B e C (desenvolvimento)
pnpm --filter @giraffe/api db:status    # estado das migrations
```

O client do Prisma é gerado no `pnpm install` (via `postinstall`) em `apps/api/generated/` —
artefato de build, não versionado.

### Papéis (bootstrap) — precede as migrations

Criar papel exige privilégio administrativo, que nem o `giraffe_migrator` tem. Por isso o
bootstrap **não** é uma migration do Prisma: ele vive em
`apps/api/prisma/bootstrap/00-roles.sql`, é **idempotente** e é o **mesmo arquivo em todos os
ambientes** — no `compose up` quem o executa é o entrypoint do container; num PostgreSQL
gerenciado, quem o executa é você.

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 \
  --set=migrator_password="$MIGRATOR_PASSWORD" \
  --set=app_password="$APP_PASSWORD" \
  --set=db_name=giraffe \
  -f apps/api/prisma/bootstrap/00-roles.sql
```

Sem este passo, a migration morre em `role "giraffe_app" does not exist` — ela **concede**
privilégios aos papéis, não os cria. Rodar o script de novo **rotaciona a senha** dos papéis;
não há procedimento separado para isso.

### Isolamento (RLS)

`Organization` e `Membership` têm `ENABLE` **e** `FORCE ROW LEVEL SECURITY`. O contexto é
definido por transação:

```sql
SELECT set_config('app.current_org_id', '<uuid>', true);  -- `true` = escopo da TRANSAÇÃO
```

O `true` não é detalhe: com `false`, o contexto gruda na **conexão**, que volta ao pool — e a
requisição seguinte, de outra Organização, herdaria o contexto. Sem contexto, nenhuma policy
casa e o banco nega (_deny-by-default_). Não existe caminho de bypass.

Havendo Organização ativa, **ela é a única fronteira**: a policy de leitura de `Membership`
só considera a conta quando **não** há contexto de Organização (o caso do login, que pergunta
"a quais Orgs pertenço?" antes de existir uma ativa). Sem essa exclusão mútua, uma conta que
pertence a duas Organizações arrastaria o vínculo da outra para dentro de uma consulta
escopada — e isso não é hipótese: era o comportamento real, e existe teste de regressão.

`Account` é **global e sem RLS** (a identidade não pertence a um tenant); `Account.email` é
PII e nunca vai para log.

### O GRANT também isola

Onde a RLS não alcança, quem nega é o privilégio. O papel de runtime tem **DML mínima**:

| Tabela         | `giraffe_app` pode            | Por quê                                                                                                                                                                   |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Account`      | `SELECT`                      | sem RLS ⇒ sem policy que a proteja; com `DELETE`, a cascata da FK apagaria Memberships de **todas** as Organizações — ações referenciais rodam com bypass de row security |
| `Organization` | `SELECT`, `UPDATE`            | criar/apagar Organização não é operação de runtime (é da Story 1.4). A policy sozinha não bastava: `WITH CHECK (id = current_org_id())` é auto-satisfazível               |
| `Membership`   | `SELECT/INSERT/UPDATE/DELETE` | CRUD dentro da Organização do contexto — as policies dizem qual                                                                                                           |

Ao conceder um privilégio novo, escreva junto o teste que prova o escopo dele.

### Rollback da migration

```bash
pnpm --filter @giraffe/api db:rollback   # ⚠️ DESTRUTIVO — reverte a migration mais recente
```

O Prisma não gera migration reversa — o SQL de rollback está em `apps/api/prisma/rollback/` e
é **exercitado** (aplicar → reverter → reaplicar), não apenas descrito.

## Instalação

```bash
corepack enable
pnpm install
# validação/CI/deploy usam instalação imutável:
pnpm install --frozen-lockfile
```

## Desenvolvimento

```bash
pnpm dev            # sobe web (3000) + api (3001) em paralelo
```

## Qualidade e testes

```bash
pnpm lint           # ESLint (não corrige)
pnpm lint:fix       # ESLint corrigindo
pnpm format:check   # Prettier (não escreve)
pnpm typecheck      # tsc --noEmit por app
pnpm test           # Vitest (unitários/smoke lógico)
pnpm build          # build de api e web
```

## Health / Readiness

A API expõe **dois endpoints distintos**; a Web expõe o seu próprio:

| Serviço | Endpoint       | Semântica                          | Sucesso                  | Indisponível |
| ------- | -------------- | ---------------------------------- | ------------------------ | ------------ |
| api     | `GET /health`  | liveness — processo vivo           | `200 { "status": "ok" }` | —            |
| api     | `GET /ready`   | readiness — apto a receber tráfego | `200 { "status": "ok" }` | `503`        |
| web     | `GET /healthz` | liveness — processo Next vivo      | `200 { "status": "ok" }` | —            |

> Desde a Story 1.2, `/ready` **consulta o banco**: PostgreSQL fora ⇒ **503**. O payload de
> sucesso continua sendo exatamente `{ "status": "ok" }` — sem versão, variáveis, paths ou
> segredos —, e o erro do driver (que carrega host, porta e usuário) **nunca** vai ao corpo.
>
> `/health` **não** consulta o banco, de propósito: com o banco caído o processo continua
> vivo, e reiniciá-lo não traria o banco de volta. Quem reflete a dependência é o `/ready`.
> O `HEALTHCHECK` do container da API usa `/ready`, para que `depends_on: service_healthy`
> signifique de fato "apto a atender".

> O `/healthz` da Web **não** consulta a API: a saúde do container não pode depender da
> disponibilidade nem da latência de um serviço terceiro. A página `/` continua exibindo o
> estado da API, mas isso é experiência do usuário, não liveness.

## Execução por container (Docker Compose)

```bash
pnpm compose:up     # build + sobe api e web em containers
pnpm smoke          # verifica /health, /ready, /healthz e a casca (ambiente já no ar)
pnpm compose:down   # derruba
```

Imagens: multi-stage, usuário **não-root**, **sem** cópia de `.env`/segredos, com
`HEALTHCHECK`. A Web usa saída `standalone` do Next.

## Integração contínua (GitHub Actions)

`.github/workflows/ci.yml` — roda em `pull_request` para `main` e em `push` nas branches de
Story. Quatro jobs, separados por **natureza do sinal**: um job monolítico diria apenas
"vermelho"; quatro dizem **onde**.

| Job          | O que prova                                                                                          |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| `qualidade`  | instalação imutável, `format`, `lint`, `typecheck`, `build`, e que `dist/` não carrega teste         |
| `testes`     | suíte contra **PostgreSQL real**, com papéis provisionados e **migrations aplicadas em banco vazio** |
| `containers` | imagens sobem de verdade, ficam `healthy`, `smoke` passa, e a imagem **não carrega `.env`**          |
| `seguranca`  | Trivy: dependências, misconfiguração e segredos — `CRITICAL`/`HIGH` **reprova**                      |

O banco do CI sobe pelo **Docker Compose**, não por `services:`. O `services:` inicia os
containers antes do checkout, então não conseguiria montar o `prisma/bootstrap/00-roles.sql` — e
a saída seria reescrever o provisionamento de papéis dentro do YAML, criando uma **segunda
definição** de quem são `giraffe_app` e `giraffe_migrator`. A que vale em produção seria a que
ninguém testa. Uma definição só, exercitada pelo CI.

As senhas do banco de CI são **geradas por execução** (`openssl rand`) e mascaradas no log.
Nenhuma credencial vive no workflow.

Actions de terceiros são **fixadas por SHA**, não por tag: tag é mutável, e um `@v4` pode passar
a apontar para código diferente do que foi revisado.

**Pendente de configuração na plataforma** (exige acesso administrativo ao GitHub, não é código):
branch protection com o CI como check obrigatório, CodeQL, secret scanning com push protection e
Dependabot.

## Deploy manual (alvo Coolify)

> Procedimento **manual reproduzível**. O CI verifica; ele ainda **não publica** — não há
> destino de deploy configurado.

1. Build das imagens a partir dos `Dockerfile` de `apps/api` e `apps/web`.
2. Configurar variáveis/segredos **no cofre/painel do ambiente** (nunca no repo/imagem).
3. **Provisionar os papéis** (`00-roles.sql`, seção "Papéis (bootstrap)"), com um papel
   administrativo. É idempotente e precede tudo. Num banco gerenciado não existe
   `docker-entrypoint-initdb.d`: se este passo for pulado, a migration falha em
   `role "giraffe_app" does not exist`.
4. **Backup do banco, com restore verificado** — backup concluído não prova recuperabilidade
   (AD-33).
5. Aplicar as migrations como **etapa controlada**, com o papel `giraffe_migrator`
   (`db:migrate`). Migration **não** roda no boot do container: um container que migra ao
   subir transforma cada réplica e cada restart numa tentativa concorrente de DDL.

   Rode a partir de um **checkout do repositório** (CI job, task de release ou shell de
   operação), **não de dentro da imagem de produção**: a imagem é enxuta de propósito — não
   carrega o CLI do Prisma (`devDependency`), nem `scripts/`, nem `prisma/migrations/`. O
   papel `giraffe_migrator` também não está no ambiente do container de runtime, e é essa
   ausência que garante que o processo que atende requisição não consegue contornar o RLS.

6. Publicar cada serviço (api e web) como container separado.
7. Configurar as sondas do orquestrador — e **não** cabear `/ready` como liveness:

   | Sonda         | api       | web        |
   | ------------- | --------- | ---------- |
   | **liveness**  | `/health` | `/healthz` |
   | **readiness** | `/ready`  | `/healthz` |

   A distinção é a razão de as duas rotas existirem. `/ready` reprova quando o banco está
   fora; usado como **liveness**, um blip de 40s no PostgreSQL reprovaria **todas** as
   réplicas da API, que seriam mortas e reiniciadas em cascata — e a recuperação automática
   (a conexão do Prisma é preguiçosa justamente para isso) nunca aconteceria. Liveness
   pergunta "o processo travou?"; readiness pergunta "posso mandar tráfego?". Só a segunda
   depende do banco.

8. Verificar `/health` e `/ready` pós-publicação.

### Rollback manual

1. Identificar a **imagem/tag ou deployment anterior** (bom estado conhecido).
2. Reapontar o serviço para a versão anterior (re-deploy da tag anterior).
3. **Preservar** as configurações externas (variáveis/segredos do cofre).
4. Reiniciar de forma controlada (encerramento gracioso já suportado).
5. Verificar `/health` e `/ready` após o rollback.
6. **Se a migration precisar ser revertida**: restaurar o backup verificado (passo 3 do
   deploy) ou aplicar o SQL de `apps/api/prisma/rollback/` — que é **destrutivo** e apaga os
   dados. Reverter schema e preservar dados são objetivos diferentes; só o backup entrega os
   dois.

> "Reverter o commit" **não** é um plano de rollback completo — o rollback opera sobre a
> imagem/deployment publicado e sobre o **estado do banco**, conforme acima.

## Limitações e itens diferidos

Fora do escopo (Stories posteriores): Redis/BullMQ, Socket.IO, autenticação/sessão/CASL,
MinIO, IA, e-mail, Notificações, Relatórios, E2E (Playwright — entra quando houver fluxo de
interface completo), e o **CD** (o CI existe e verifica; publicar é outra etapa).

A matriz de permissões de papéis (`ADMIN`/`MEMBER`/`GUEST`) existe no schema, mas **não é
aplicada** nesta Story — quem decide o que cada papel pode fazer é a Story 1.6. O isolamento
entregue aqui é **entre Organizações**, não entre papéis.

### Riscos conhecidos e aceitos (registrados, não escondidos)

- **`MembershipState` ainda não governa acesso.** `SUSPENDED`/`REMOVED` são gravados e lidos,
  mas nenhuma policy os consulta. Quem transforma uma Membership em contexto de sessão é a
  Story 1.4 — e é lá que `state != 'ACTIVE'` precisa deixar de conceder contexto. Enquanto
  isso não existir, não há sessão para conceder: o risco é de projeto, não de exposição.
- **`withTenantContext` confia no `orgId` que recebe.** Ele não verifica que a conta tem
  Membership naquela Organização — a RLS impõe o isolamento _entre_ Organizações, ela não
  decide _a qual_ o requisitante pertence. Derivar o contexto de uma Membership validada no
  servidor (nunca de algo que o cliente enviou) é contrato da Story 1.3.
- **Constraints únicas atravessam a RLS.** É comportamento documentado do PostgreSQL: a
  verificação de unicidade não passa por policy. Logo `Organization.slug` e `Account.email`,
  sendo únicos globais, funcionam como oráculo de existência — um `P2002` confirma que
  aquele slug/e-mail existe em algum lugar da plataforma, sem revelar onde. Fechar isso exige
  unicidade por Organização (ou hashing), decisão que pertence à Story que introduzir o
  cadastro.
- **`$queryRaw` não passa pela extensão de contexto.** Falha **fechada** (sem contexto,
  nenhuma linha organizacional é visível — há teste), mas quem usar SQL cru não ganha
  contexto de graça.
- **Custo do isolamento não foi medido.** Cada operação de modelo virou uma transação com
  dois `set_config`. É a decisão certa em segurança, e não há consumidor de domínio ainda
  para medir contra — o `performance-check` fica para a Story que introduzir carga real.

## Troubleshooting mínimo

- **`pnpm` não encontrado:** rode `corepack enable`.
- **API não sobe / "Configuração inválida":** falta variável obrigatória (ex.:
  `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`) — copie `.env.example` para `.env`.
- **Web mostra "API indisponível":** a API não está no ar ou `API_BASE_URL`
  aponta para o host errado (em Compose use `http://api:3001`).
- **`/ready` retorna 503:** o banco não está acessível. `docker compose ps` e
  `docker compose logs db`. O 503 é honesto — não o silencie.
- **Testes de RLS falham com "DATABASE_URL ausente":** suba o banco (`docker compose up -d
db`) e rode as migrations. A suíte **não** pula quando o banco está fora: banco
  indisponível é falha, não ausência de evidência.
- **`P1000`/autenticação falhou:** duas causas distintas, nesta ordem de probabilidade.
  (1) Você mudou `APP_PASSWORD`/`MIGRATOR_PASSWORD` no `.env` **depois** do primeiro
  `compose up`: o bootstrap só roda com o volume vazio, então o papel manteve a senha antiga.
  Reaplique o `00-roles.sql` (ele rotaciona a senha) ou recrie o volume com
  `docker compose down -v`. (2) A partir do host, outra instância de PostgreSQL pode estar
  ocupando a porta — o Compose publica em **5434** exatamente por isso.
- **`role "giraffe_app" does not exist` ao migrar:** o bootstrap de papéis não rodou. Ver
  "Papéis (bootstrap)". A migration concede privilégios; ela não cria os papéis.
