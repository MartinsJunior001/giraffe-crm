# Analyze — consistência cruzada e veredito (Story 1.1)

Data: 2026-07-12 · Entradas: Story BMAD 1.1, Architecture Spine, readiness, roadmap, context7-check, pre-implementation-check, Constitution v1.0.0, spec/plan/checklist/tasks, código parcial existente.

## Cobertura (spec ⇄ código)

| Requisito | Coberto por | Estado |
|---|---|---|
| FR-101 monorepo pnpm | `package.json`, `pnpm-workspace.yaml`, `apps/*` | ✅ (lockfile pendente) |
| FR-102 health/ready | `apps/api/src/health/*` | ✅ (boot real pendente) |
| FR-103 casca + estado honesto | `apps/web/app/*`, `lib/*` | ✅ (build pendente) |
| FR-104 fail-fast env | `apps/api/src/kernel/config/env.ts`, `main.ts` | ✅ |
| FR-105 segredos fora do repo | `.gitignore`, `.env.example`, Dockerfiles | ✅ |
| FR-106 logs sanitizados | `app.module.ts` (pino redact) | ✅ |
| FR-107 CORS restrito | `main.ts` (`enableCors` por env) | ✅ |
| FR-108 scripts raiz | `package.json` scripts | ✅ |
| FR-109 containers | `apps/*/Dockerfile`, `docker-compose.yml` | ⚠ build a verificar |
| FR-110 deploy/rollback | `README.md` | ✅ |

Nenhum requisito órfão; nenhum código sem requisito.

## Findings

| # | Severidade | Achado | Ação |
|---|---|---|---|
| A1 | **Média (processo)** | Código escrito antes do Spec Kit (viola Princípio I) | Remediado por esta convergência; registrar no memlog; não reincidir |
| A2 | **Média (risco build)** | `apps/api/Dockerfile` usa `pnpm deploy --prod --legacy` — flags a confirmar no pnpm 10.2 | Verificar no build real; ajustar se falhar (item A) |
| A3 | **Média (risco build)** | `apps/web/Dockerfile` depende de layout `standalone` monorepo (`server.js`) | Verificar no build real; ajustar caminhos se necessário |
| A4 | **Baixa (validação)** | `pnpm install` iniciado, ainda **não concluído** (sem lockfile) | Aguardar conclusão; rodar suíte de qualidade real |
| A5 | **Baixa (decisão mínima)** | Zod adotado para validação de env (fora da lista nominal do Seed) | Aceitável; registrado na spec — mecanismo mínimo, não altera a stack |
| A6 | **Baixa (runner)** | Vitest sem swc → testes de API evitam DI/decorators | Aceitável no escopo smoke; e2e/supertest deferred |

**Contradições bloqueadoras:** nenhuma.
**Violações de escopo / Non-Goals:** nenhuma.
**Divergências de stack vs. baseline context7:** nenhuma.

## Constitution gate

PASS com ressalvas (Princípio I: ordem — remediada; Princípio X: validação real pendente). Sem violação estrutural.

## Veredito

**RESUME WITH CORRECTIONS**

Retomar a implementação é seguro, condicionado a:
1. concluir a instalação (lockfile único) — sem 2ª instância concorrente;
2. executar e comprovar a suíte real (`lint`/`format:check`/`typecheck`/`test`/`build`/`smoke`);
3. verificar/ajustar os 2 Dockerfiles (A2/A3) no build real;
4. boot real da API (`/health`,`/ready`) e da Web;
5. `security-check` + `observability-check` + `code-review` + `commit-check` antes de `review`;
6. registrar A1 (ordem) no memlog e não reincidir.

Nenhum arquivo exige reescrita garantida; apenas verificação empírica dos 2 Dockerfiles.
