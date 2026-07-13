# Tarefa técnica 1: CI independente (GitHub Actions)

Status: done

Tipo: **tarefa técnica** (não é Story de produto — não entrega valor ao usuário final, entrega
capacidade de verificação). Rastreada no `sprint-status.yaml` como `tech-1-ci-github-actions`.

## Contexto

O Épico 1 chegou à Story 1.2 sem nenhuma verificação automática independente. Todos os gates
executados até aqui rodaram **na máquina de quem implementou** — que é exatamente a condição em
que "funciona na minha máquina" vira história compartilhada.

Isso importa mais nesta base que na média, por uma razão concreta: o Code Review da Story 1.2
encontrou **dois vazamentos cross-tenant** que a suíte anterior não pegava. A suíte que os pega
hoje só é verde se rodar contra um **PostgreSQL real, com os papéis provisionados e as
migrations aplicadas**. Sem CI, nada impede que uma regressão de isolamento entre no `main` sem
que ninguém tenha rodado essa suíte.

## Objetivo

Um pipeline que reproduza, do zero e sem intervenção, o mesmo ciclo que hoje é manual — e que
seja **obrigatório** para integração.

## Critérios de aceite

- **AC1** — O CI roda em `pull_request` para `main` e em `push` nas branches de Story. Um PR com
  qualquer gate vermelho não pode ser integrado.
- **AC2** — Instalação **imutável** (`--frozen-lockfile`). Lockfile dessincronizado reprova.
- **AC3** — `format:check`, `lint`, `typecheck` (cobrindo `src` **e** `test`) e `build` verdes.
- **AC4** — Suíte completa contra **PostgreSQL real**, com papéis provisionados e **migrations
  aplicadas em banco vazio** — a migration é exercitada a cada execução, não presumida.
- **AC5** — Ciclo de containers: build das imagens, `up`, todos `healthy`, `smoke` verde, `down`.
- **AC6** — Varredura de segurança (Trivy): dependências, configuração e **segredos**. Achado
  `CRITICAL`/`HIGH` reprova.
- **AC7** — Higiene de pipeline: `timeout-minutes` em todo job, `concurrency` cancelando
  execuções obsoletas do mesmo ref, `permissions` mínimas (`contents: read`), actions de
  terceiros **fixadas por SHA**.
- **AC8** — Falha produz **evidência**: logs dos containers são anexados como artifact.
- **AC9** — Nenhuma credencial no repositório. As senhas do banco de CI são **geradas por
  execução**.

## Decisões

- **O banco do CI sobe pelo Docker Compose, não por `services:`.** O `services:` do GitHub
  Actions inicia os containers **antes** do checkout, então ele não consegue montar o
  `prisma/bootstrap/00-roles.sql` — e a alternativa seria reescrever o provisionamento de papéis
  dentro do YAML. Isso criaria uma **segunda definição** de quem são `giraffe_app` e
  `giraffe_migrator`, e a que vale em produção seria a que ninguém testa. É precisamente o
  defeito que o Code Review da Story 1.2 encontrou (papéis presos ao init do Docker) e corrigiu.
  Uma definição só, exercitada pelo CI.
- **Senhas geradas por execução** (`openssl rand -hex`). Fixá-las no YAML seria reintroduzir a
  credencial padrão que a mesma revisão removeu do Compose (Constitution VI).
- **Jobs separados por natureza do sinal**: `qualidade` (estático), `testes` (banco real),
  `containers` (imagem + smoke), `seguranca` (Trivy). Um job monolítico diria apenas "vermelho";
  quatro dizem **onde**.
- **Sem cache de `node_modules`.** O cache do pnpm store (via `setup-node`) já cobre o download.
  Cachear `node_modules` num monorepo com `postinstall: prisma generate` é como se envenena um
  pipeline: o client gerado fica obsoleto e o erro aparece longe da causa.

## Fora do escopo (registrado)

- E2E (Playwright) — não há fluxo de interface ainda. Entra quando houver (protocolo, §5).
- Redis/BullMQ — não existem no projeto.
- CodeQL, Dependabot, branch protection — configuração da **plataforma**, não do repositório;
  exigem acesso administrativo ao GitHub. Registrado como pendência de configuração, não de
  código.
- Publicação de imagem em registry — não há destino de deploy definido ainda.

## Dev Agent Record

### Arquivos

- `.github/workflows/ci.yml` (novo)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (entrada `tech-1-ci-github-actions`)

### Change Log

| Data | Mudança |
| --- | --- |
| 2026-07-12 | Tarefa criada a partir do protocolo (CI é prioridade imediata após a Story 1.2, e não existia). Workflow implementado com 4 jobs, banco real via Compose, migrations em banco vazio, smoke em container, Trivy e higiene de pipeline. |
