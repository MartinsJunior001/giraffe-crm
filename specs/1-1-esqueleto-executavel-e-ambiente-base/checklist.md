# Checklist de qualidade — Story 1.1 (esqueleto executável)

Estado: `[x]` atendido · `[~]` pendente de validação real · `[ ]` não atendido · `N/A`.

## Escopo e princípios
- [x] Escopo estrito ao esqueleto (sem domínio/persistência)
- [x] Non-Goals preservados (sem PostgreSQL/auth/RLS/IA/e-mail/CI-CD)
- [x] Sem `packages/` especulativo; kernel só com `config` (consumidor real)
- [x] Artefatos autoritativos intactos (PRD/UX/Spine/epics/readiness/roadmap)
- [x] Nenhuma decisão BMAD reaberta

## Baseline técnica (context7)
- [x] Node 24 · pnpm 10 (Corepack, hash fixo) · lockfile único previsto
- [x] Next 16 · React 19 · Tailwind 4 · NestJS 11 · TS 5.9 · ESLint 9 flat · Vitest 4 · Pino
- [x] Sem `latest`; ranges caret; patches via lockfile
- [~] `pnpm install --frozen-lockfile` valida em repo limpo (após lockfile gerado)

## Backend (API)
- [x] `/health` e `/ready` distintos; payload `{status:"ok"}` mínimo
- [x] Equivalência health≈ready documentada (sem breaking change futuro)
- [x] Encerramento gracioso (`enableShutdownHooks`)
- [x] CORS restrito e configurável (sem wildcard)
- [x] Validação de env server-side + fail-fast sanitizado
- [~] Boot real + `/health`/`/ready` 200 verificados

## Frontend (Web)
- [x] App Router; casca vazia navegável; sem domínio/dado fictício
- [x] URL da API por env; estado honesto quando indisponível
- [~] `next build` (standalone) e render verificados

## Segurança
- [x] `.env` ignorado; só `.env.example` sem valores
- [x] Sem segredo em log/health/imagem; sem credencial padrão
- [x] Redaction de auth nos logs
- [~] `security-check` executado antes de concluir

## Observabilidade
- [x] Logs estruturados (serviço/ambiente/nível); startup/erro visíveis
- [~] `observability-check` executado antes de concluir

## Containers e deploy
- [x] Dockerfile por app, multi-stage, non-root, healthcheck
- [x] Compose local; sem `.env` na imagem
- [~] `docker compose up` healthy (build verificado)
- [x] Rollback manual documentado (sem migração)

## Testes e qualidade
- [x] Testes escritos (api: health/env; web: env/api)
- [~] `lint`/`format:check`/`typecheck`/`test`/`build`/`smoke` verdes em instalação limpa

## Migração/backup
- [x] N/A registrado (sem persistência)

## Processo
- [x] Constitution vigente
- [x] Spec Kit: specify/clarify/plan/checklist/tasks/analyze
- [~] Checks finais (`code-review`, `commit-check`) antes de `review`
