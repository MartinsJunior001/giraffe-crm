# Tasks — Story 1.1 (esqueleto executável)

Mapeamento direto às tarefas BMAD **T1–T8**. Estado: `[x]` implementado (código escrito) · `[~]` implementado, validação real pendente · `[ ]` não iniciado.

> Convergência: o código já existe. Estas tasks refletem o que foi feito e o que falta **validar** (não reimplementar). Nenhuma alteração de código durante o Spec Kit.

## T1 — Monorepo e TypeScript (US1)
- [x] `package.json` raiz (scripts, engines Node ≥24, `packageManager` pnpm@10.2.0+hash)
- [x] `pnpm-workspace.yaml` (`apps/*`), `tsconfig.base.json` (strict)
- [x] `.nvmrc` (24), `.gitignore`, `.dockerignore`, `.prettier*`, `eslint.config.mjs` (flat)
- [~] instalação gera **um único** `pnpm-lock.yaml`; nenhum 2º lockfile

## T2 — API NestJS + health/ready (US1)
- [x] bootstrap (`main.ts`) com fail-fast, CORS, `enableShutdownHooks`
- [x] `HealthController` (`/health`, `/ready`) + payloads puros `{status:"ok"}`
- [~] boot real e endpoints 200 verificados; smoke da API

## T3 — Web Next.js casca vazia (US1)
- [x] `app/layout.tsx` + `app/page.tsx` (casca, estado honesto), `lib/env.ts` + `lib/api.ts`
- [x] Tailwind 4 (`globals.css` + `postcss.config.mjs`), `next.config.ts` (standalone)
- [~] `next build` e render da casca verificados

## T4 — Kernel transversal (US1)
- [x] `apps/api/src/kernel/config/env.ts` (único conteúdo com consumidor real) + `kernel/README.md`
- [x] sem pasta/abstração especulativa (AD-4)

## T5 — Config + fail-fast + segredos (US2)
- [x] `.env.example` sanitizado; `.env` ignorado; validação Zod server-side; fail-fast
- [x] separação pública (`NEXT_PUBLIC_*`) × privada; CORS por env
- [~] teste "config ausente → falha honesta" executado (verde)

## T6 — Logs estruturados sanitizados (US2)
- [x] `nestjs-pino` + `redact` (authorization/cookie/set-cookie); base serviço/ambiente
- [~] `observability-check`; asserção "sem segredo no log/health"

## T7 — Containers + deploy/rollback (US3)
- [x] `apps/api/Dockerfile` + `apps/web/Dockerfile` (multi-stage, non-root, healthcheck)
- [x] `docker-compose.yml`; sem `.env` na imagem
- [~] **build real** api/web; ajustar `pnpm deploy`/standalone se necessário (itens A do plano)
- [x] rollback manual documentado (README) — sem migração

## T8 — Scripts de qualidade + doc (US3)
- [x] scripts raiz (`dev/build/lint/lint:fix/format/format:check/typecheck/test/smoke/compose:*`)
- [x] `README.md` (pré-requisitos, execução, health, deploy/rollback, troubleshooting)
- [~] suíte completa verde em instalação limpa

## Validação final (pós-retomada)
- [~] `pnpm lint · format:check · typecheck · test · build · smoke`
- [~] `docker compose up` healthy + `pnpm smoke`
- [~] `security-check` · `observability-check` · `code-review` · `commit-check`
- [ ] Atualizar Dev Agent Record/File List; mover Story para `review`
