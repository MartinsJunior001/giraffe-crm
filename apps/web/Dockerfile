# syntax=docker/dockerfile:1
# ── WEB (Next.js 16) — multi-stage, standalone, non-root, sem segredos ──
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @giraffe/web...
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/web ./apps/web
RUN pnpm --filter @giraffe/web build

FROM node:24-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Next standalone lê HOSTNAME/PORT; no Docker, HOSTNAME vira o ID do container.
# Forçar 0.0.0.0 para bindar em todas as interfaces (healthcheck e acesso externo).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app
# Saída standalone do Next em monorepo: server.js + node_modules sob a raiz de tracing.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
# Sonda /healthz (rota local, sem I/O): a liveness deste container não pode depender da
# disponibilidade nem da latência da API, como aconteceria ao sondar a página `/`.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
