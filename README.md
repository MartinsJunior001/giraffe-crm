# Giraffe CRM — Fase 1

Monorepo do Giraffe CRM. **Story 1.1 — Esqueleto executável e ambiente base**: base
reproduzível front+back sobre a qual as próximas capacidades assentam. Ainda **sem
domínio** (sem autenticação, banco, Pipes/Cards/Databases etc.).

## Stack (Story 1.1)

| Camada      | Tecnologia                                                  |
| ----------- | ----------------------------------------------------------- |
| Runtime     | Node.js **24 LTS**                                          |
| Gerenciador | **pnpm 10** (via Corepack)                                  |
| Monorepo    | pnpm workspaces (`apps/*`)                                  |
| Backend     | NestJS **11** (`apps/api`) + Pino                           |
| Frontend    | Next.js **16** + React **19** + Tailwind **4** (`apps/web`) |
| Linguagem   | TypeScript **5.9**                                          |
| Qualidade   | ESLint 9 (flat) · Prettier 3 · Vitest 4                     |
| Container   | Docker (node:24-slim) + Docker Compose                      |

> Versões exatas fixadas em `pnpm-lock.yaml`. Não use `latest`.

## Pré-requisitos

- **Node.js 24** (veja `.nvmrc` — `nvm use`).
- **Corepack** habilitado: `corepack enable` (usa o pnpm fixado em `packageManager`).
- **Docker** + **Docker Compose** (apenas para execução conteinerizada).

## Configuração

```bash
cp .env.example .env
```

Variáveis (todas em `.env.example`, sem valores sensíveis):

| Variável               | App | Tipo     | Descrição                                                          |
| ---------------------- | --- | -------- | ------------------------------------------------------------------ |
| `NODE_ENV`             | api | privada  | `development`/`test`/`production`                                  |
| `API_PORT`             | api | privada  | porta da API (default 3001)                                        |
| `CORS_ALLOWED_ORIGINS` | api | privada  | **obrigatória**; origens permitidas (sem wildcard)                 |
| `LOG_LEVEL`            | api | privada  | nível de log Pino                                                  |
| `API_BASE_URL`         | web | servidor | URL base da API interna, lida server-side (não exposta ao browser) |

Segredos **nunca** são versionados: `.env` está no `.gitignore`; só `.env.example` é rastreado.

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

> Nesta Story não há dependências externas, então `/ready` é **temporariamente
> equivalente** a `/health`. Os endpoints permanecem semanticamente separados; quando
> surgir a 1ª dependência (Story 1.2+), `/ready` passa a refletir a checagem real **sem
> breaking change** no contrato. Os payloads não expõem versão, variáveis, paths ou segredos.

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
3. Publicar cada serviço (api e web) como container separado.
4. Configurar o healthcheck do orquestrador para `/health` (api) e `/healthz` (web).
5. Verificar `/health` e `/ready` pós-publicação.

### Rollback manual

1. Identificar a **imagem/tag ou deployment anterior** (bom estado conhecido).
2. Reapontar o serviço para a versão anterior (re-deploy da tag anterior).
3. **Preservar** as configurações externas (variáveis/segredos do cofre).
4. Reiniciar de forma controlada (encerramento gracioso já suportado).
5. Verificar `/health` e `/ready` após o rollback.
6. **Sem migração de banco nesta Story** — não há estado de dados a reverter.

> "Reverter o commit" **não** é um plano de rollback completo — o rollback opera sobre a
> imagem/deployment publicado, conforme acima.

## Limitações e itens diferidos (Story 1.1)

Fora do escopo (Stories posteriores): PostgreSQL/Prisma, RLS, Redis/BullMQ, Socket.IO,
autenticação/Membership/CASL, MinIO, IA, e-mail, Notificações, Relatórios, CI/CD, E2E.

## Troubleshooting mínimo

- **`pnpm` não encontrado:** rode `corepack enable`.
- **API não sobe / "Configuração inválida":** falta variável obrigatória (ex.:
  `CORS_ALLOWED_ORIGINS`) — copie `.env.example` para `.env`.
- **Web mostra "API indisponível":** a API não está no ar ou `API_BASE_URL`
  aponta para o host errado (em Compose use `http://api:3001`).
