# syntax=docker/dockerfile:1
# ── API (NestJS 11) — multi-stage, non-root, sem segredos na imagem ──
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

# Build: instala deps, GERA o Prisma Client e compila.
#
# O `prisma generate` roda AQUI dentro, e não é copiado do host, porque o query engine é um
# binário NATIVO: o gerado no Windows não executa no Debian desta imagem. Copiá-lo passaria
# no build e quebraria só no boot — exatamente a classe de erro que a Story 1.1 já pagou
# (por isso `apps/api/generated/` está no `.dockerignore`).
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
# `--ignore-scripts`: o `postinstall` da API roda `prisma generate`, mas o schema só é
# copiado no passo seguinte. Aqui o generate é EXPLÍCITO, na ordem certa.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @giraffe/api...
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api ./apps/api
RUN pnpm --filter @giraffe/api exec prisma generate
RUN pnpm --filter @giraffe/api build

# Prod-deps: instalação apenas de produção (node_modules enxuto), mesmo layout do monorepo.
# Precisa ser um stage NOVO: reinstalar com `--prod` sobre a instalação completa não encolhe
# nada, porque o store `.pnpm` continua guardando as devDependencies (medido: 465 MB).
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
# `--ignore-scripts`: o `postinstall` da API roda `prisma generate`, e o CLI do Prisma é
# devDependency — ausente aqui, de propósito. Este stage só monta o node_modules de
# produção; o client já foi gerado no stage `build`.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter @giraffe/api...

# Migrate: imagem ONE-SHOT para aplicar migrations como ETAPA CONTROLADA (AD-17/AD-32) em
# ambientes onde o host não tem o repositório instalado (ex.: staging via Coolify).
#
# Este stage NÃO é o runtime: fica ANTES dele de propósito (o build sem `target` usa o ÚLTIMO
# stage, e o serviço `api` do Compose precisa continuar produzindo o runtime). Ele carrega o
# que o runtime deliberadamente exclui — o CLI do Prisma (devDependency, vindo do stage de
# build) e `prisma/` (migrations, rollback, seed, bootstrap) — porque migrar É o seu único
# propósito. A credencial entra só em runtime, via `MIGRATION_DATABASE_URL` no ambiente do
# `docker compose run` (ver docker-compose.migrate.yml); nenhum segredo é copiado para a imagem.
#
# Concorrência: o `prisma migrate deploy` adquire um ADVISORY LOCK do PostgreSQL (timeout fixo
# de 10s) — duas execuções simultâneas não se atropelam: a segunda falha explicitamente e se
# re-executa. (Documentado em prisma.io/docs/orm/prisma-migrate/workflows/development-and-production.)
FROM node:24-slim AS migrate
ENV NODE_ENV=production
# Mesma redução de superfície do runtime: sem npm/corepack (nada é instalado aqui).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/lib/node_modules/corepack /usr/local/bin/corepack
WORKDIR /repo/apps/api
# node_modules do stage de BUILD (com devDependencies): é onde vive o CLI do Prisma.
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=build /repo/apps/api/prisma /repo/apps/api/prisma
COPY apps/api/package.json /repo/apps/api/package.json
# O runner é o MESMO script do repositório (uma única verdade sobre como se migra):
# ele exige MIGRATION_DATABASE_URL e nunca imprime valor de variável, só nomes.
COPY scripts/db-migrate.mjs /repo/scripts/db-migrate.mjs
USER node
CMD ["node", "../../scripts/db-migrate.mjs", "deploy"]

# Runtime: preserva o layout /repo (store .pnpm na raiz + symlinks em apps/api) para a
# resolução de módulos funcionar; usuário não-root; sem segredos.
FROM node:24-slim AS runtime
ENV NODE_ENV=production

# Remove o npm/corepack que vêm embutidos na imagem base.
#
# O runtime executa `node dist/main.js` — não instala nada, e portanto não precisa de gerenciador de
# pacotes. O npm embutido traz o próprio `undici`, que o Trivy apontou com um HIGH (CVE-2026-12151):
# uma vulnerabilidade num código que nunca é executado aqui, mas que está presente na imagem e
# disponível para quem obtiver execução dentro dela.
#
# Não dá para "atualizar a dependência": ela não é nossa, é do npm que vem na base. Apagar o que não
# se usa resolve o achado e reduz a superfície — um gerenciador de pacotes num container de produção
# é uma ferramenta de instalar código arbitrário à disposição de um atacante.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
  /usr/local/lib/node_modules/corepack /usr/local/bin/corepack

WORKDIR /repo/apps/api
COPY --from=prod-deps /repo/node_modules /repo/node_modules
COPY --from=prod-deps /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=build /repo/apps/api/dist /repo/apps/api/dist
# O client gerado (com o engine nativo Linux) vem do stage de build. Ele é autocontido —
# traz o próprio `runtime/` — e por isso não depende do `@prisma/client` do store.
COPY --from=build /repo/apps/api/generated /repo/apps/api/generated
COPY apps/api/package.json /repo/apps/api/package.json
# Único script operacional que o runtime carrega — o gancho do Scheduled Task do Coolify (D-05):
# `node /repo/scripts/db-cleanup.mjs` roda por `docker exec` NESTE container, com o MESMO ambiente
# (DATABASE_URL do papel de runtime, que tem DELETE em LoginFailure/RateLimit — nunca o migrator).
# Ele importa apenas o client já gerado (`../apps/api/generated/...`), então não reintroduz o CLI
# do Prisma nem gerenciador de pacotes na imagem. Serializado por advisory lock (chave 427050006);
# ver docs/04-operacao/agendamento-coleta-antiabuso.md.
COPY scripts/db-cleanup.mjs /repo/scripts/db-cleanup.mjs
USER node
EXPOSE 3001
# Readiness, não liveness: com o banco fora, a API não está apta a receber tráfego, e o
# `depends_on: service_healthy` do Compose precisa refletir isso. `/health` responderia 200
# com o banco caído e o container entraria em rotação sem conseguir atender nada.
#
# `--timeout=6s` é MAIOR que o deadline interno da sonda (5s, em `prisma.service.ts`), e a
# ordem importa: se o probe morresse antes da sonda responder, o container seria marcado
# unhealthy sem nunca ter sido de fato consultado — um 503 fabricado pelo cronômetro errado.
HEALTHCHECK --interval=30s --timeout=6s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3001)+'/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
