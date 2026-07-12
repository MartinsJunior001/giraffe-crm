# Implementation Plan: Esqueleto executável e ambiente base (Story 1.1)

**Branch**: `story/1-1-esqueleto-executavel-e-ambiente-base` · **Date**: 2026-07-12 · **Spec**: `./spec.md`
**Mode**: convergência retroativa (implementação parcial existente; código NÃO é alterado durante o Spec Kit).

## Summary

Base executável do produto: monorepo pnpm com `apps/api` (NestJS 11, health/ready, Pino, config fail-fast, CORS, shutdown) e `apps/web` (Next.js 16 + React 19 + Tailwind 4, casca vazia, estado honesto), qualidade (ESLint 9 flat, Prettier 3, Vitest 4), containers (Dockerfile multi-stage non-root + Compose) e deploy/rollback manual documentado. Sem domínio/persistência.

## Technical Context

- **Linguagem/Runtime**: TypeScript 5.9 · Node.js 24 LTS
- **Gerenciador**: pnpm 10 (Corepack, `packageManager` com hash sha512), lockfile único `pnpm-lock.yaml`
- **Frontend**: Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4 (`@tailwindcss/postcss`)
- **Backend**: NestJS 11 (platform-express), nestjs-pino/pino, Zod (validação de env)
- **Testes**: Vitest 4 (runner único; unit/lógico — sem DI/decorators no caminho de teste)
- **Container**: Docker (node:24-slim), Compose para local
- **Storage/DB/Fila/Auth/IA**: N/A nesta Story (deferred)

## Constitution Check

| Princípio | Situação | Nota |
|---|---|---|
| I. Processo antes de código | ⚠ **violado na ordem** (código antes do Spec Kit) → sendo remediado por esta convergência | registrar; não reincidir |
| II. Só Story aprovada; sem antecipar | ✅ | escopo estrito ao esqueleto; nada de domínio |
| III. Stack canônica + TS estrito | ✅ | baseline context7; TS strict via `tsconfig.base` |
| IV. Isolamento tenant + deny-by-default | ✅ (N/A dados) | sem persistência; RLS começa em 1.2 |
| V. Account+Membership; distinções | ✅ (N/A) | nenhuma erosão possível (sem domínio) |
| VI. Segurança/segredos fail-closed | ✅ | fail-fast, `.env` ignorado, sem segredo em health/imagem |
| VII. Observabilidade sanitizada | ✅ | Pino + redaction |
| VIII. Fonte única, migração/backup, idempotência | ✅ (N/A) | sem dados; sem migração |
| IX. LGPD/minimização | ✅ (N/A) | sem PII |
| X. Testes + gates | ⚠ pendente | testes escritos; execução real ainda não concluída (install em andamento) |
| XI. Preservar artefatos + invariantes | ✅ | nenhum artefato autoritativo alterado |

**Resultado**: PASS com 2 ressalvas registradas (I: ordem — remediada; X: validação real pendente). Nenhuma violação estrutural.

## Convergência — classificação do código existente

Legenda: **C** compatível · **A** aceitável com ajuste · **D** divergente · **F** fora do escopo.

| Arquivo | Classe | Observação |
|---|---|---|
| `package.json` (raiz) | C | scripts/engines/packageManager corretos; hash pnpm fixado pelo Corepack |
| `pnpm-workspace.yaml` | C | `apps/*` |
| `tsconfig.base.json` | C | strict; apps estendem |
| `.nvmrc` (24) · `.gitignore` · `.dockerignore` · `.env.example` | C | higiene de Git/segredos ok |
| `eslint.config.mjs` (flat) · `.prettierrc.json` · `.prettierignore` | C | ESLint 9 flat + tseslint 8 |
| `scripts/smoke.mjs` | C | smoke honesto contra ambiente no ar |
| `apps/api/*` (Nest, health/ready, kernel/config, Pino, main) | C | contrato mínimo; fail-fast; redaction |
| `apps/api/test/*` (health, env) | C | unit sem DI; testa sanitização |
| `apps/api/Dockerfile` | **A** | usa `pnpm deploy --prod --legacy` — **verificar** flags no pnpm 10.2 durante build; ajustar se falhar |
| `apps/web/*` (Next casca, lib env/api, page) | C | estado honesto; sem domínio |
| `apps/web/test/*` (env, api) | C | pura; sem jsdom |
| `apps/web/Dockerfile` | **A** | standalone monorepo — **verificar** caminhos `.next/standalone`/`server.js` no build real |
| `docker-compose.yml` | C | web/api; `NEXT_PUBLIC_API_URL=http://api:3001` (server-side) |
| `README.md` | C | execução, health, deploy/rollback, troubleshooting |
| `.specify/**`, `specs/**`, `.specify/memory/constitution.md` | C | Spec Kit (não são código de app) |

**Divergências (D):** nenhuma.
**Fora do escopo (F):** nenhuma — nenhum arquivo de domínio/persistência foi criado.
**Ajustes (A):** apenas os 2 Dockerfiles precisam de **verificação empírica** no build (não são reescritas garantidas; podem estar corretos).

## Plano de convergência (o que falta para concluir)

1. **Concluir a instalação** já iniciada (aguardar `pnpm-lock.yaml`); NÃO iniciar 2ª instância.
2. **Validação real** (quando autorizado a retomar): `pnpm lint` · `format:check` · `typecheck` · `test` · `build` · `smoke`.
3. **Verificar Dockerfiles** (build api e web); ajustar `pnpm deploy`/standalone se o build real acusar.
4. **Boot real** api (`node dist/main.js`) + `curl /health` e `/ready`; boot web + fetch root.
5. **Checks finais**: `security-check`, `observability-check`, `code-review`, `commit-check`.
6. Atualizar Dev Agent Record/File List da Story; só então `review`.

## Project Structure

```text
package.json · pnpm-workspace.yaml · tsconfig.base.json · .nvmrc · .gitignore · .dockerignore
.env.example · docker-compose.yml · eslint.config.mjs · .prettierrc.json · README.md · scripts/smoke.mjs
apps/api/  → NestJS 11 (src/main.ts, app.module.ts, health/, kernel/config/), test/, Dockerfile, vitest.config.ts
apps/web/  → Next.js 16 (app/, lib/), test/, Dockerfile, next.config.ts, postcss.config.mjs, vitest.config.ts
specs/1-1-esqueleto-executavel-e-ambiente-base/ → spec.md, plan.md, checklist.md, tasks.md, analyze.md
```

## Complexity Tracking

Nenhuma complexidade adicional além do mínimo. `packages/` deliberadamente ausente (sem contrato concreto). Kernel restrito a `config` (consumidor real). Runner único (Vitest) sem swc por manter testes fora do caminho de decorators.
