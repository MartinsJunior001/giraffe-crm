# Feature Specification: Esqueleto executável e ambiente base (Story 1.1)

**Feature Branch**: `story/1-1-esqueleto-executavel-e-ambiente-base`

**Created**: 2026-07-12

**Status**: Draft (Spec Kit retroativo — implementação parcial existente)

**Input**: Story BMAD 1.1 (`_bmad-output/implementation-artifacts/1-1-esqueleto-executavel-e-ambiente-base.md`), Architecture Spine (AD-1..AD-5, AD-29, AD-31, AD-32, Stack/Structural Seed), readiness report, roadmap, context7-check (2026-07-12), pre-implementation-check (GO WITH CONDITIONS).

> **Nota de convergência:** esta spec é escrita APÓS uma implementação parcial. Ela descreve o comportamento esperado do esqueleto e serve de baseline para o `plan` classificar o código existente (compatível / ajustável / divergente / fora do escopo). Não amplia o escopo BMAD nem reabre decisões fechadas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Base executável front+back (Priority: P1)

Como **time de desenvolvimento**, quero um monorepo conteinerizado com uma API (NestJS) e uma Web (Next.js) que sobem, expõem saúde e servem uma casca vazia, para que todas as Stories seguintes assentem sobre uma base consistente e reproduzível.

**Why this priority**: é a fundação; nenhuma outra Story pode começar sem ela.

**Independent Test**: em repositório recém-clonado, `pnpm install --frozen-lockfile` + subir web+api → `GET /health` e `GET /ready` respondem `200 {status:"ok"}` e a casca é navegável.

**Acceptance Scenarios**:

1. **Given** o repo recém-clonado **When** o ambiente sobe (scripts/containers) **Then** web e API respondem health/readiness com sucesso.
2. **Given** a API no ar **When** consulto `/health` **Then** recebo estado saudável **sem** expor segredos/versão sensível.
3. **Given** o frontend no ar **When** acesso a casca **Then** ela é servida e navegável (sem domínio), consumindo **apenas** a API interna.

### User Story 2 — Configuração honesta e segredos fora do repo (Priority: P1)

Como **operador**, quero que a aplicação falhe de forma honesta quando mal configurada e nunca versione segredos, para evitar subir "meio configurada" ou vazar credenciais.

**Why this priority**: segurança de base; bloqueia risco de vazamento desde o dia 1.

**Independent Test**: remover variável obrigatória → serviço falha com mensagem clara sanitizada; inspecionar repo → nenhum segredo versionado (só `.env.example`).

**Acceptance Scenarios**:

1. **Given** uma variável obrigatória ausente **When** o serviço inicia **Then** falha fail-fast, sanitizado, sem subir.
2. **Given** os segredos **When** inspeciono o repo **Then** nenhum está versionado (só `.env.example` sem valores sensíveis).

### User Story 3 — Qualidade e deploy/rollback reproduzíveis (Priority: P2)

Como **time**, quero scripts de qualidade determinísticos e um procedimento manual de deploy/rollback, para garantir consistência e reversibilidade.

**Why this priority**: sustenta manutenção e operação, mas depende das duas anteriores.

**Independent Test**: em instalação limpa, `lint`/`format:check`/`typecheck`/`test`/`build`/`smoke` verdes; procedimento de rollback documentado e verificável.

**Acceptance Scenarios**:

1. **Given** o monorepo **When** rodo os scripts de qualidade **Then** todos passam em instalação limpa.
2. **Given** a app em execução **When** existe procedimento manual de deploy/rollback **Then** é reproduzível e documentado.

### Edge Cases

- Variável obrigatória ausente ou inválida → falha honesta sanitizada (sem valor no erro).
- API indisponível para a Web → estado honesto "indisponível — sem conexão" (sem stack trace).
- Origem não autorizada em CORS → bloqueada (sem wildcard).
- Payload de health/ready NÃO deve conter versão/variáveis/paths/segredos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-101**: O sistema MUST prover um monorepo pnpm com `apps/web` (Next.js) e `apps/api` (NestJS), lockfile único.
- **FR-102**: A API MUST expor `GET /health` (liveness) e `GET /ready` (readiness) como endpoints distintos, retornando `{status:"ok"}` sem dados sensíveis.
- **FR-103**: A Web MUST servir uma casca vazia navegável consumindo **apenas** a API interna, com estado honesto quando a API estiver indisponível.
- **FR-104**: O sistema MUST validar variáveis de ambiente no servidor e **falhar fail-fast** (sanitizado) quando obrigatórias faltarem.
- **FR-105**: Segredos MUST ficar fora do repositório (`.env` ignorado; só `.env.example`); nenhum segredo em log/health/imagem.
- **FR-106**: Logs MUST ser estruturados (serviço/ambiente/nível), com redaction de auth/segredos.
- **FR-107**: CORS MUST ser restrito e configurável (sem wildcard em produção).
- **FR-108**: O sistema MUST prover scripts raiz determinísticos (`dev/build/lint/lint:fix/format/format:check/typecheck/test/smoke/compose:up/compose:down`).
- **FR-109**: O sistema MUST prover containers (Dockerfile por app, multi-stage, non-root, healthcheck) e Compose para execução local.
- **FR-110**: O sistema MUST documentar procedimento manual de deploy e **rollback** verificável (sem migração de banco nesta Story).

### Non-Functional / Constraints

- **NFR-1**: proteção de segredos (AD-31). **AD-1..AD-5**: fronteiras/monorepo/kernel/dependências. **AD-29**: observabilidade sanitizada. **AD-32**: deploy/health/rollback.

### Key Entities

- Nenhuma entidade de domínio nesta Story (sem persistência). O "kernel" contém apenas `config` (validação de ambiente), único conteúdo transversal com consumidor concreto.

## Success Criteria *(mandatory)*

- **SC-001**: `pnpm install --frozen-lockfile` conclui em repo limpo e gera/consome um único `pnpm-lock.yaml`.
- **SC-002**: `/health` e `/ready` retornam `200 {status:"ok"}`; payload sem campos além de `status`.
- **SC-003**: remover variável obrigatória impede a inicialização com erro claro e sanitizado.
- **SC-004**: `lint`/`format:check`/`typecheck`/`test`/`build`/`smoke` verdes em instalação limpa.
- **SC-005**: `docker compose up` sobe web+api healthy; imagem sem `.env`; rollback documentado.

## Clarifications *(Spec Kit — sem reabrir decisões BMAD)*

Não há questão bloqueadora. As micro-decisões abaixo já estão resolvidas/rastreadas e **não** requerem esclarecimento adicional:

- Baseline de versões (Node 24 / pnpm 10 / Next 16 / React 19 / NestJS 11 / TS 5.9 / Tailwind 4 / ESLint 9 / Vitest 4 / Pino) — fechada no `context7-check` (2026-07-12).
- Patches exatos → fixados pelo lockfile (deferred deliberado).
- Verificação Coolify → `coolify-deploy-check` antes de deploy real (MCP exige autorização).
- `migration-check`/`backup-check` → **N/A** (sem persistência).
- Zod para validação de env: escolha mínima de mecanismo (não altera a stack Seed); registrada.

## Assumptions

- Ambiente de dev possui Node 24 e Corepack (pnpm fixado por `packageManager`).
- Não há sistema/serviço externo a integrar nesta Story (sem banco/cache/fila).
- Reuso do tooling/documentação BMAD existente; a aplicação é criada **ao lado** (greenfield para o app).
- Deploy real (Coolify) é posterior; aqui só o procedimento manual documentado.
