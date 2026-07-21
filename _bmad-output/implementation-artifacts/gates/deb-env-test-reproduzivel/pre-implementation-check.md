# Pre-Implementation Check Report

## Identificação da tarefa

Lane P0 (tech debt): **`DEB-TEST-CI-LOCAL-ORQUESTRACAO`** + **`DEB-ENV-TEST-REPRODUZIVEL`** —
tornar `pnpm test:ci` **reproduzível localmente**. Débitos registrados no gate da TECH-S1
(`gates/tech-s1/evidencia-execucao.md`) e diagnosticados por experimento. Base `origin/main`
`95733e2`. Branch `tech/deb-env-test-reproduzivel`.

## Fase e etapa atual

Fase 1, tooling de teste. Não é código de aplicação nem antecipa Fase 2. Lane de hardening P0 do
Terminal A, **não concorrente** com o caminho funcional do Terminal B (8.1→8.2→4.2).

## Objetivo

`pnpm test:ci` na raiz produzir o **mesmo** resultado das suítes isoladas, de forma reproduzível no
Windows local, e falhar com **mensagem clara** quando o banco não autentica (em vez de 83 falhas
confusas).

## Escopo incluído

1. **Orquestração serial** — root `test:ci` passa a rodar api e web **em sequência**, não
   concorrentes. Fecha `DEB-TEST-CI-LOCAL-ORQUESTRACAO`.
2. **Preflight de banco** — `scripts/test-preflight.mjs` checa autenticação/alcance do Postgres e
   emite mensagem acionável (P1000 → "suba o banco descartável"); exposto como `pnpm test:local`.
3. **`apps/api/.env.test.example`** versionado, **sem segredos**, documentando a config do banco
   descartável de teste. Avança `DEB-ENV-TEST-REPRODUZIVEL`.

## Fora do escopo

- **Não** alterar o caminho do CI (`.github/workflows/ci.yml`) — o CI já é verde e provisiona seu
  próprio banco efêmero. A mudança em `test:ci` é compatível (serial ainda passa em CI).
- **Não** trocar o mecanismo de carregamento de env dos testes (invasivo) — o `.env.test.example`
  documenta; a isolação plena por `.env.test` fica como follow-up com condição de fechamento própria.
- **Não** tocar Docker/compose de produção. O banco descartável usa o compose já existente.

## Regras de negócio / permissões / dados afetados

**Nenhuma.** É tooling de teste: sem entidade, sem migration, sem RLS, sem GRANT, sem autorização,
sem PII. Isolamento multi-tenant intocado.

## Dependências técnicas

pnpm 10 (`--filter`, sequenciamento de scripts), Node 24, o `db:status` já existente
(`scripts/db-migrate.mjs status`). Nenhuma dependência nova.

## Skills obrigatórias

- `commit-check` (antes do commit). `security-check`/`migration-check`/`lgpd-check` **não aplicáveis**
  (sem superfície de ataque nova, sem migration, sem dado pessoal).

## Riscos

1. **Mudar root `test:ci` afeta o CI.** Mitigação: serial é um superconjunto seguro do concorrente
   (mesmos comandos, ordem determinística); CI segue verde, só mais lento. Validado por: rodar
   `pnpm test:ci` serial local com banco descartável + CI autoritativo no PR.
2. **Ordem api-depois-web** — se api falhar, web não roda. É o comportamento desejado (fail-fast),
   e o preflight dá a mensagem certa quando a causa é o banco.

## Plano mínimo

1. `package.json` raiz: `test:ci` → `pnpm --filter @giraffe/api test:ci && pnpm --filter @giraffe/web test:ci`; adicionar `test:local`.
2. `scripts/test-preflight.mjs` (preflight de banco, mensagem acionável).
3. `apps/api/.env.test.example` (sem segredos).
4. Validar: banco descartável (compose deste worktree) + `pnpm test:ci` serial verde; preflight pega DATABASE_URL errada.
5. `format:check`, `commit-check`, commit, push, PR. QA cruzado = Terminal B.

**Não alterar:** `.github/workflows/ci.yml`, `apps/**/src`, prisma, compose de produção, artefatos autoritativos.

## Estratégia de rollback

`git revert` — mudança textual em `package.json` + arquivos novos. Sem estado, sem migration.

## Status final

**APROVADO**
