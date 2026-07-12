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
| `API_BASE_URL`           | web     | servidor | URL base da API interna, lida server-side (não exposta ao browser) |

Segredos **nunca** são versionados: `.env` está no `.gitignore`; só `.env.example` é rastreado.

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
docker compose up -d db     # sobe o PostgreSQL (porta 5434 no host, só em 127.0.0.1)
pnpm --filter @giraffe/api db:migrate   # aplica as migrations (papel migrator)
pnpm --filter @giraffe/api db:seed      # fixture de duas Organizações (desenvolvimento)
```

O client do Prisma é gerado no `pnpm install` (via `postinstall`) em `apps/api/generated/` —
artefato de build, não versionado.

### Isolamento (RLS)

`Organization` e `Membership` têm `ENABLE` **e** `FORCE ROW LEVEL SECURITY`. O contexto é
definido por transação:

```sql
SELECT set_config('app.current_org_id', '<uuid>', true);  -- `true` = escopo da TRANSAÇÃO
```

O `true` não é detalhe: com `false`, o contexto gruda na **conexão**, que volta ao pool — e a
requisição seguinte, de outra Organização, herdaria o contexto. Sem contexto, nenhuma policy
casa e o banco nega (_deny-by-default_). Não existe caminho de bypass.

`Account` é **global e sem RLS** (a identidade não pertence a um tenant); `Account.email` é
PII e nunca vai para log.

### Rollback da migration

```bash
pnpm --filter @giraffe/api exec node ../../scripts/db-migrate.mjs rollback   # ⚠️ destrutivo
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

## Deploy manual (alvo Coolify)

> Sem CI/CD nesta Story (decisão posterior). Procedimento **manual reproduzível**:

1. Build das imagens a partir dos `Dockerfile` de `apps/api` e `apps/web`.
2. Configurar variáveis/segredos **no cofre/painel do ambiente** (nunca no repo/imagem).
3. **Backup do banco, com restore verificado** — backup concluído não prova recuperabilidade
   (AD-33).
4. Aplicar as migrations como **etapa controlada**, com o papel `giraffe_migrator`
   (`db:migrate`). Migration **não** roda no boot do container: um container que migra ao
   subir transforma cada réplica e cada restart numa tentativa concorrente de DDL.
5. Publicar cada serviço (api e web) como container separado.
6. Configurar o healthcheck do orquestrador para `/ready` (api) e `/healthz` (web).
7. Verificar `/health` e `/ready` pós-publicação.

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
MinIO, IA, e-mail, Notificações, Relatórios, CI/CD, E2E.

A matriz de permissões de papéis (`ADMIN`/`MEMBER`/`GUEST`) existe no schema, mas **não é
aplicada** nesta Story — quem decide o que cada papel pode fazer é a Story 1.6. O isolamento
entregue aqui é **entre Organizações**, não entre papéis.

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
- **`P1000`/autenticação falhou a partir do host:** outra instância de PostgreSQL pode estar
  ocupando a porta. O Compose publica em **5434** exatamente por isso.
