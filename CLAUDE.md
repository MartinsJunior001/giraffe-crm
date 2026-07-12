# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Idioma do projeto: **português (pt-BR)**, incluindo comentários de código, documentação e mensagens de commit.

## Comandos

Pré-requisitos: Node 24 (`.nvmrc`) e `corepack enable` (pnpm 10 fixado em `packageManager`).

```bash
pnpm install                 # dev; em CI/validação: pnpm install --frozen-lockfile
pnpm dev                     # web (3000) + api (3001) em paralelo
pnpm lint / pnpm lint:fix    # ESLint 9 flat
pnpm format:check            # Prettier 3
pnpm typecheck               # tsc --noEmit em cada app
pnpm test                    # Vitest 4 em cada app
pnpm build                   # build de api e web
pnpm compose:up / :down      # execução conteinerizada
pnpm smoke                   # valida /health, /ready, /healthz e a casca de um ambiente JÁ no ar
```

Testes de um app ou arquivo (Vitest roda a partir da raiz de cada app):

```bash
pnpm --filter @giraffe/api test                       # só a API
pnpm --filter @giraffe/api exec vitest run test/env.test.ts
pnpm --filter @giraffe/api exec vitest run -t "nome do teste"
```

`pnpm smoke` **não sobe serviços** — exige `pnpm dev` ou `pnpm compose:up` antes. Aceita `API_URL`, `WEB_URL`, `SMOKE_TIMEOUT_MS`.

## Processo obrigatório (precede qualquer código)

Este repositório é governado por `.specify/memory/constitution.md`, cuja versão vigente e princípios estão registrados no próprio arquivo. Ela tem precedência sobre conveniência e hábito. Pontos que mudam o que você pode fazer:

- **Sequência oficial:** Documentação Base → BMAD → Spec Kit → Implementação → Validações por skills → Deploy. Não se escreve código de aplicação antes de a Story ter passado por BMAD e pelo Spec Kit (`specify → clarify → plan → checklist → tasks → analyze`; `converge` quando já há implementação parcial).
- **Gate pré-código:** `skills/pre-implementation-check.md` é obrigatório antes de implementar, corrigir bug funcional, criar migration, adicionar dependência ou mudar arquitetura. Ele produz um relatório com status `APROVADO` / `APROVADO COM RESSALVAS` / `BLOQUEADO`. Depois vem `safe-implementation`, e antes de concluir a Story: `security-check`, `observability-check` e (quando aplicável) `lgpd-check`, `migration-check`, `backup-check`, `performance-check` — todos em `skills/`.
- **Verificação documental antes de escrever código — obrigatória:** sempre que a implementação envolver biblioteca, framework, SDK, API, CLI ou serviço da stack, execute o `context7-check` antes de codificar, mesmo que a API pareça conhecida. Use como baseline a versão efetivamente declarada ou instalada no projeto, conforme `package.json`, `packageManager`, lockfile, Dockerfile ou configuração equivalente. Consulte preferencialmente o MCP do Context7 (`resolve-library-id` → `query-docs`). Quando o Context7 estiver indisponível ou não cobrir a tecnologia, consulte a documentação oficial atual e registre a fonte utilizada. Não invente assinaturas, opções de configuração ou versões. Quando a documentação atual contradisser o plano ou a arquitetura, registre a divergência e escale antes de implementar.
- **Sem antecipar escopo:** nada de Fase 2, nada de abstração especulativa (módulo vazio, repositório genérico, event bus) sem consumidor concreto. Proibição registrada explicitamente em `apps/api/src/kernel/README.md`.
- **Artefatos autoritativos não são editados diretamente pela implementação:** PRD, UX, Architecture Spine, `epics.md` e readiness report só mudam por seus workflows oficiais. O `sprint-status.yaml` e o status da Story só podem ser atualizados pelo workflow BMAD responsável, nunca por edição manual ou por uma implementação fora desse fluxo.
- **Commit:** não commitar antes do `commit-check`; nunca fazer push/deploy sem autorização explícita. Ver **Commit automático por seção**, abaixo.

Referências de decisão: `AD-*` (decisões de arquitetura) e invariantes vivem em `_bmad-output/planning-artifacts/architecture/*/ARCHITECTURE-SPINE.md`; a documentação de produto da Fase 1 está em `docs/01-documentacao-base/` (índice: `00-indice-fase-1.md`). `docs/_arquivo-legado/` **não é fonte oficial**; o protótipo HTML em `08-referencias-visuais/prototypes/` é referência visual, **não** modelo de dados nem arquitetura final.

## Commit automático por seção

Ao concluir cada seção, etapa ou Story com alterações versionáveis:

1. confirme que o escopo foi concluído e os gates obrigatórios estão verdes;
2. execute automaticamente a skill `commit-check`;
3. se o resultado for aprovado, execute automaticamente a skill `commit`;
4. crie um commit pequeno, atômico e com mensagem em português no padrão do projeto;
5. não inclua arquivos fora do escopo, temporários, segredos ou configurações locais;
6. não faça commit de trabalho parcial, bloqueado ou com testes vermelhos;
7. nunca execute `push`, merge, deploy ou mudança de branch sem autorização explícita.

Se a seção não gerar uma entrega versionável, não crie commit e registre apenas:

`SEM COMMIT — nenhuma alteração versionável nesta seção.`

## Invariantes conceituais (nunca erodir)

`Pipe ≠ Database` · `Card ≠ Registro` · `Fase ≠ Status do Card` · `Super Admin (Plataforma) ≠ Admin da Organização` · `Usuário ≠ Organização`. Identidade é Account global + Membership por Organização. Autorização é **deny-by-default** e `PERMISSÃO = AÇÃO + ESCOPO`; isolamento por Organização é o invariante-mãe. Os três Formulários (inicial, de fase, de database) são independentes.

## Arquitetura

Monorepo pnpm workspaces (`apps/*`), TypeScript estrito compartilhado via `tsconfig.base.json` (`strict` + `noUncheckedIndexedAccess`). Nesta Story 1.1, o frontend consome apenas a API interna e nenhuma superfície de API pública é implementada. Nenhuma regra de domínio deve existir no frontend.

**Estado transitório da implementação — Story 1.1 (esqueleto executável).** Não existe domínio: sem banco, sem autenticação, sem Pipes/Cards/Databases. O que existe é a base reproduzível.

Este bloco descreve o estado real do código na Story atual e deve ser revisado ao encerrar esta Story ou iniciar a próxima, para não se tornar uma descrição histórica incorreta.

- `apps/api` — NestJS 11. `main.ts` faz **fail-fast**: `getEnv()` valida o ambiente (Zod, `kernel/config/env.ts`) _antes_ de o Nest subir; CORS restrito sem wildcard; `enableShutdownHooks()`. `AppModule` configura Pino via `forRootAsync` (a validação de env fica no `useFactory`, para que importar o módulo em testes não tenha efeito colateral), com redaction de `authorization`/`cookie`/`set-cookie` e supressão de log dos probes.
- `apps/api/src/kernel/` — fronteira técnica transversal mínima (AD-4/AD-5). **Regra de negócio nunca vive aqui.** Hoje só `config/`.
- `apps/web` — Next.js 16 (App Router, `output: standalone`), React 19, Tailwind 4. `lib/env.ts` lê `API_BASE_URL` (variável de **servidor**, deliberadamente sem `NEXT_PUBLIC_`); `lib/api.ts` consulta `/health` com timeout e devolve **estado honesto e sanitizado** — falha nunca vaza URL interna, stack ou segredo. `GET /healthz` é a liveness da Web: rota local, sem I/O, **não** consulta a API (a saúde do container não pode depender de um serviço terceiro).

**Health vs. readiness são semanticamente distintos**: `GET /health` (liveness) e `GET /ready` (readiness, 503 quando não apto). Hoje `/ready` é temporariamente equivalente a `/health` por não haver dependências externas; quando surgir a primeira dependência externa em uma Story futura, ele passa a refletir a checagem real **sem breaking change** no contrato. Nenhum payload expõe versão, variáveis, paths ou segredos.

## Convenções que o código já assume

- **Segredos e configuração:** `.env` nunca é versionado (só `.env.example`); segredos vêm do cofre/ambiente, nunca de imagem, log ou health. Variável obrigatória ausente → falha honesta, sanitizada, listando apenas _nomes_ de variáveis (ver `ConfigValidationError`).
- **Logs:** estruturados (Pino), sempre sanitizados — nunca senhas, tokens, cookies, headers de auth, corpos de e-mail, prompts/respostas de IA ou PII desnecessária.
- **Versões:** fixadas no `pnpm-lock.yaml`. Nunca `latest`; não trocar a stack sem decisão arquitetural registrada. A API de qualquer biblioteca se confere no MCP do Context7 (ver gate acima), não de memória.
- **Testes:** Vitest com `include: ['test/**/*.test.ts']` — testes ficam em `apps/*/test/`, fora de `src/`. O contrato HTTP (`/health`, `/ready`) é coberto por **teste de integração real**, que sobe o `AppModule` em porta efêmera e faz requisição de verdade: um teste que só chame a função de payload continuaria verde se a rota fosse renomeada. O typecheck da API cobre `src` **e** `test` (`tsconfig.json`); o build usa `tsconfig.build.json`, que exclui os testes de `dist`.
- **ESLint ignora** `docs/`, `_bmad/`, `_bmad-output/`, `skills/`, `specs/`, `.specify/`, `.github/`, `.agent*/` — são tooling e documentação, não código de aplicação.
- **Testes verdes ≠ afirmação:** um critério de aceite só é marcado como concluído com evidência de execução real (Constitution X).
