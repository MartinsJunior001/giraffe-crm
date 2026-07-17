# Proposta de design — Automação do encerramento de Story (closure) e CI enxuto para PR administrativo

> **Natureza deste documento:** análise e proposta de design. **Não** implementa nada.
> Nenhum arquivo de CI, código de aplicação, artefato autoritativo (PRD, UX,
> ARCHITECTURE-SPINE, Constitution) ou Story em andamento foi tocado. A implementação
> depende de aprovação explícita e deve seguir a sequência oficial do projeto
> (BMAD → Spec Kit → gates → commit-check).
>
> **Escopo do problema.** Hoje cada Story fecha com dois PRs: o **PR funcional**
> (código + gates + docs da Story) e um **PR administrativo** separado — só docs — que
> vira a Story para `done`, atualiza o `sprint-status.yaml` e consolida artefatos de
> processo. Exemplos reais: PR #6 (`tech/encerra-story-1-5`, commit
> `docs(story-1-5): encerra a Story como done e formaliza o debito D-06`) e PR #8
> (`tech/encerra-story-1-6`, `docs(story-1-6): encerra a Story como done`). Esse PR
> administrativo hoje dispara o **CI completo** — 4 jobs: `qualidade`, `testes`
> (PostgreSQL real), `containers` (boot + smoke Docker) e `seguranca` (Trivy) —, mesmo
> com um diff que não toca uma linha de código. O commit funcional correspondente já
> passou verde no `main`. É desperdício de fila, de tempo e de infraestrutura.

## 0. Diagnóstico do estado atual (fatos verificados)

- **`.github/workflows/ci.yml`** dispara em `pull_request: [main]` e `push:
  [main, story/**, tech/**]`. **Não há** `paths`/`paths-ignore` hoje — nem no
  workflow, nem por job. Todo PR paga os 4 jobs integralmente.
- Os 4 jobs (`qualidade`, `testes`, `containers`, `seguranca`) são separados **por
  natureza do sinal**, deliberadamente. `permissions: contents: read` (o workflow só
  lê). `concurrency` cancela execução obsoleta. Actions fixadas por **SHA**. Senhas de
  banco/segredos **gerados por execução** (`openssl rand`), mascarados no log.
- O banco de CI sobe pelo **Docker Compose** (não `services:`), para haver **uma única
  definição** de provisionamento de papéis (`prisma/bootstrap/00-roles.sql`). Qualquer
  automação nova **não pode** reescrever isso.
- **Fronteira de arquivos** (verificada no repo):
  - **Funcional** (exige os 4 jobs): `apps/**` (inclui `apps/api/prisma/**`,
    `apps/api/generated/**`, `apps/*/Dockerfile`), `package.json`, `pnpm-lock.yaml`,
    `pnpm-workspace.yaml`, `tsconfig.base.json` / `tsconfig*.json`, `docker-compose.yml`,
    `.dockerignore`, `eslint.config.mjs`, `.prettierrc.json`, `.nvmrc`, `.github/**`,
    `scripts/**`.
  - **Administrativo** (checks leves bastam): `_bmad-output/**`, `specs/**`, `docs/**`,
    `skills/**`, `.specify/**`, `*.md` de raiz/documentação.
- Governança dura (CLAUDE.md + Constitution): `sprint-status.yaml` e o `status` da
  Story **só mudam pelo workflow BMAD autorizado**; artefatos autoritativos **não são
  editados pela implementação**; `commit-check` precede qualquer commit; **nunca**
  push/merge/deploy sem autorização; **nunca** `--no-verify`; merge `--no-ff`, jamais
  squash.

---

## A) Path filters do CI para o PR administrativo

### A.1 Princípio de projeto: intenção declarada + diff que confirma

Um PR não é administrativo porque "o diff parece só docs" — é administrativo porque
**alguém declarou** que ele é, e o diff **confirma** essa declaração. Duas portas, e as
duas precisam concordar:

1. **Declaração de intenção** — branch com prefixo `tech/encerra-story-*` **ou** label
   `admin-only` no PR. É o padrão que os PRs #6/#8 já seguem.
2. **Confirmação pelo diff** — o conjunto de arquivos alterados cai **inteiramente**
   dentro dos globs administrativos. Se um único arquivo funcional aparecer, a porta
   fecha.

Roteamento resultante:

| Intenção declarada? | Diff só administrativo? | Rota |
|---|---|---|
| Não | (irrelevante) | **4 jobs completos** (default seguro) |
| Sim | Sim | **Rota leve** (checks administrativos) |
| Sim | **Não** (há arquivo funcional) | **FALHA o PR** — "admin PR carregando código" (ver A.4) |

O default é sempre o caminho pesado. A rota leve é **opt-in** e exige as duas portas
verdes. Isso satisfaz o requisito "falha o PR se houver qualquer arquivo funcional"
sem enfraquecer PRs de código.

### A.2 Por que **não** usar `paths`/`paths-ignore` no nível do workflow

`paths-ignore` no bloco `on:` faz o **workflow inteiro nem iniciar**. Se `qualidade`,
`testes`, `containers` e `seguranca` forem **required status checks** na proteção de
branch (o que este projeto exige — "o PR é o ponto em que a verificação deixa de ser
local", CI verde obrigatório), um check exigido que **nunca reporta** deixa o PR
**travado como pendente para sempre** — não dá para fazer merge. É um modo de falha
conhecido do GitHub. Portanto: **nada de `paths`/`paths-ignore` no `on:`**. Os checks
required precisam **sempre reportar** um estado.

A solução é um **job detector** + jobs pesados **condicionais por `if:`** + um **job
agregador que sempre roda** e é o único check marcado como *required*.

### A.3 Estratégia concreta — job detector com `dorny/paths-filter`

Adicionar um job `deteccao` no topo que classifica o PR e expõe outputs. Os jobs
pesados passam a depender dele e ganham um `if:`. **Preservados intactos** os 4 jobs
para o caminho funcional — só ganham uma guarda de entrada.

```yaml
jobs:
  # ── Detector: classifica o PR. Barato, sem banco, sem Docker. ──
  deteccao:
    name: Detecção de escopo do PR
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      funcional: ${{ steps.filtro.outputs.funcional }}
      admin_declarado: ${{ steps.intencao.outputs.admin }}
    steps:
      - uses: actions/checkout@<SHA>          # pinar por SHA (convenção do projeto)
      # Declaração de intenção: branch tech/encerra-story-* OU label admin-only
      - id: intencao
        run: |
          admin=false
          case "${{ github.head_ref }}" in
            tech/encerra-story-*) admin=true ;;
          esac
          if echo '${{ toJson(github.event.pull_request.labels.*.name) }}' | grep -q '"admin-only"'; then
            admin=true
          fi
          echo "admin=$admin" >> "$GITHUB_OUTPUT"
      # Diff: existe QUALQUER arquivo funcional?
      - id: filtro
        uses: dorny/paths-filter@<SHA>        # pinar por SHA
        with:
          filters: |
            funcional:
              - 'apps/**'
              - 'package.json'
              - 'pnpm-lock.yaml'
              - 'pnpm-workspace.yaml'
              - 'tsconfig*.json'
              - 'docker-compose.yml'
              - '.dockerignore'
              - 'eslint.config.mjs'
              - '.prettierrc.json'
              - '.prettierignore'
              - '.nvmrc'
              - '.github/**'
              - 'scripts/**'
```

Guarda nos jobs pesados — rodam **quando há arquivo funcional OU quando o PR não é
administrativo declarado** (default seguro; qualquer dúvida → roda tudo):

```yaml
  qualidade:
    needs: deteccao
    if: ${{ needs.deteccao.outputs.funcional == 'true' || needs.deteccao.outputs.admin_declarado != 'true' }}
    # ... steps atuais inalterados ...

  testes:      # idêntico if: — NÃO sobe PostgreSQL num PR só-docs
    needs: deteccao
    if: ${{ needs.deteccao.outputs.funcional == 'true' || needs.deteccao.outputs.admin_declarado != 'true' }}
    # ...

  containers:  # idêntico if: — NÃO sobe Docker/smoke num PR só-docs
    needs: deteccao
    if: ${{ needs.deteccao.outputs.funcional == 'true' || needs.deteccao.outputs.admin_declarado != 'true' }}
    # ...

  seguranca:   # idêntico if: — Trivy só quando há código/config
    needs: deteccao
    if: ${{ needs.deteccao.outputs.funcional == 'true' || needs.deteccao.outputs.admin_declarado != 'true' }}
    # ...
```

### A.4 O job administrativo leve

Roda **apenas** para PR administrativo declarado. Substitui os 4 jobs pesados nesse
caso por checks proporcionais ao diff:

```yaml
  administrativo:
    name: Encerramento administrativo (checks leves)
    needs: deteccao
    if: ${{ needs.deteccao.outputs.admin_declarado == 'true' }}
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@<SHA>

      # (1) GUARDA — nenhum arquivo funcional pode viajar num PR administrativo.
      #     Reusa o output do detector; falha explícita se houver código.
      - name: Nenhum código funcional neste PR administrativo
        if: ${{ needs.deteccao.outputs.funcional == 'true' }}
        run: |
          echo "::error::PR administrativo contém arquivo funcional — abra um PR funcional"
          exit 1

      # (2) Validação da Story: frontmatter e status coerentes.
      #     status: done exige que o PR funcional já esteja em main (ver B/C).
      - name: Validar Story (frontmatter/status)
        run: node scripts/ci/validar-story.mjs        # a criar (ver B.7)

      # (3) Consistência do sprint-status.yaml com o status da Story.
      - name: Validar sprint-status
        run: node scripts/ci/validar-sprint-status.mjs

      # (4) Formatação/lint da documentação aplicável (Prettier em *.md; sem tsc/eslint de app).
      - name: Prettier (apenas markdown/yaml do diff)
        run: pnpm exec prettier --check "**/*.{md,yaml,yml}"

      # (5) Commit-check administrativo (variante não-interativa; ver B.6).
      - name: Commit-check administrativo
        run: node scripts/ci/commit-check-admin.mjs
```

O que a rota leve **não** faz, por design: sem `pnpm install --frozen-lockfile` pesado
de app, sem `pnpm typecheck`/`build`, sem PostgreSQL, sem Docker, sem smoke, sem Trivy.
O diff não os justifica e o commit funcional já os pagou no `main`.

### A.5 Job agregador — o único *required check*

Para a proteção de branch continuar exigível **sem** travar em pendência, um job
`ci-ok` que **sempre roda** e resume os antecessores. Ele — e só ele — é marcado como
required na branch protection.

```yaml
  ci-ok:
    name: CI OK
    needs: [deteccao, qualidade, testes, containers, seguranca, administrativo]
    if: ${{ always() }}
    runs-on: ubuntu-latest
    steps:
      - name: Consolidar resultado
        run: |
          # Aprova se cada job necessário terminou em success OU foi legitimamente skipped.
          # Reprova se QUALQUER um falhou ou foi cancelado.
          resultados='${{ toJson(needs) }}'
          echo "$resultados"
          echo "$resultados" | node -e '
            const n = JSON.parse(require("fs").readFileSync(0,"utf8"));
            const ruim = Object.entries(n).filter(([,v]) => !["success","skipped"].includes(v.result));
            if (ruim.length) { console.error("::error::jobs não-verdes:", ruim.map(x=>x[0]).join(",")); process.exit(1); }
            console.log("CI OK");
          '
```

Assim: PR funcional → `administrativo` fica *skipped*, os 4 pesados verdes, `ci-ok`
verde. PR administrativo → 4 pesados *skipped*, `administrativo` verde, `ci-ok` verde.
Em ambos os casos o required check reporta um estado. **Não** mexer nos globs de
`ESLint ignora` nem no provisionamento de papéis — nada disso é tocado.

---

## B) Automação do closure BMAD

Fluxo disparado **após o merge do PR funcional no `main`**, encadeando as etapas que
hoje são manuais, sem violar nenhuma regra de governança. Implementado como um workflow
`fecha-story.yml` acionado manualmente (`workflow_dispatch` com input `story_key`) —
**não** `on: push main` automático, para manter o disparo humano explícito e evitar
laço com merges que não são de Story.

> **Decisão de permissões:** este workflow **é separado** do `ci.yml`. O `ci.yml`
> permanece `contents: read`. O `fecha-story.yml` recebe `contents: write` +
> `pull-requests: write` **apenas para criar branch e abrir PR** — nunca para dar merge
> direto em `main`. O merge continua sendo do GitHub (auto-merge após checks), não do
> script.

### Etapas

1. **Criar a branch de closure** — `tech/encerra-story-<n>` a partir do `main` já com o
   PR funcional integrado. Aborta se a branch já existir (idempotência).

2. **Atualizar Story e sprint-status pelo workflow autorizado** — o script **não edita
   YAML/frontmatter na mão**. Ele invoca o workflow BMAD responsável (a skill de
   sprint/closure BMAD) como a única via que pode virar a Story para `done` e ajustar o
   `sprint-status.yaml`. A automação é o **gatilho**; a mutação continua sendo do
   workflow autorizado. Se o BMAD não expõe entrada não-interativa, a etapa **para** e
   pede execução manual da skill — não improvisa a edição.

3. **Rodar o commit-check administrativo** — variante não-interativa do `commit-check`
   (ver B.6) que valida branch, escopo (só administrativo), ausência de segredo/artefato
   e mensagem `docs(story-<n>): encerra a Story como done`. Só com o equivalente a
   `APPROVED FOR COMMIT` o commit é criado.

4. **Abrir o PR de closure** — `gh pr create` com base `main`, head
   `tech/encerra-story-<n>`, título e corpo padronizados, apontando o PR funcional já
   integrado como evidência.

5. **Habilitar auto-merge SOMENTE após a validação passar** — `gh pr merge --auto
   --no-ff`. O `--auto` **não** funde na hora: entrega ao GitHub, que só conclui quando
   o required check `ci-ok` (rota administrativa) ficar verde. Nunca `--merge`/`--squash`
   imediato; nunca `--admin` (que fura branch protection). `--no-ff` preserva o merge
   commit exigido pelo projeto.

6. **Impedir qualquer arquivo funcional no PR** — dupla trava: a guarda do job
   `administrativo` (A.4, passo 1) já reprova no CI; adicionalmente, o script de closure
   confere `git diff --name-only main...HEAD` contra os globs funcionais **antes** de
   abrir o PR e aborta se achar código. Falha cedo (local) e falha tarde (CI) — duas
   redes.

### B.6 `commit-check-admin` (variante não-interativa)

Subconjunto determinístico do `commit-check.md` adequado a diff administrativo:
verifica branch `tech/encerra-story-*`; escopo **exclusivamente** administrativo (globs
de A.1); ausência de `.env`/segredo/credencial no diff; ausência de artefato de build
(`node_modules/`, `dist/`, `.next/`, `*.tsbuildinfo`); mensagem no padrão
`docs(story-<n>): …` em português; e **nenhum** push/merge/deploy disparado pelo
script. Emite `APPROVED FOR COMMIT` / `CHANGES REQUIRED` / `BLOCKED` — só o primeiro
autoriza o commit. Não substitui o `commit-check` humano para PRs funcionais.

### B.7 `validar-story.mjs` / `validar-sprint-status.mjs`

- **validar-story:** parse do frontmatter da Story; `status: done` exige a
  correspondência com o `sprint-status.yaml` e a existência do `gates/<n>/summary.md`
  com veredito consolidado. Rejeita `done` sem evidência de merge funcional (ver C).
- **validar-sprint-status:** garante que a chave da Story existe em
  `development_status`, que a transição é legal (`review`/`in-progress` → `done`, nunca
  `backlog` → `done` num PR administrativo) e que nenhum artefato autoritativo foi
  alterado no mesmo diff.

---

## C) Invariantes que a automação NUNCA pode violar

| # | Invariante | Como é imposta |
|---|---|---|
| C-1 | **Não marcar Story `done` antes do merge funcional** | `validar-story.mjs` exige, para `status: done`, que o commit/PR funcional referenciado já esteja em `main` (checa `git merge-base --is-ancestor <sha-funcional> origin/main` e a presença do `gates/<n>/summary.md`). O workflow de closure só dispara com `workflow_dispatch` **após** o merge funcional. Sem essa âncora, a etapa 2 **para**. |
| C-2 | **Não alterar PRD/UX/Architecture Spine/Constitution** | Guarda no job `administrativo` e no script de closure: `git diff --name-only` **reprova** se tocar `_bmad-output/planning-artifacts/**` (PRD, UX, ARCHITECTURE-SPINE, epics, readiness) ou `.specify/memory/constitution.md`. Esses são artefatos autoritativos — mudam só pelos seus workflows oficiais, jamais por closure. |
| C-3 | **Não esconder código dentro de PR administrativo** | Dupla trava de A.4/B-6: o detector marca `funcional=true` se **qualquer** glob funcional casar; o job `administrativo` então **falha** explicitamente. O script de closure repete a checagem antes de abrir o PR. Um `.md` continua permitido — o risco de um `.md` que muda comportamento é tratado em D. |
| C-4 | **Não fazer deploy** | O `fecha-story.yml` tem `permissions` só de `contents`/`pull-requests`; **nenhum** step de deploy, publish, registry ou ambiente. `ci.yml` segue `contents: read`. Deploy permanece decisão humana fora desta automação. |
| C-5 | **Não ignorar CI** | O merge é `gh pr merge --auto`, que **respeita** a branch protection: só conclui com `ci-ok` verde. Proibido `--admin`, `--no-verify`, ou marcar checks como não-required. O agregador `ci-ok` sempre reporta, então não há como "passar por pendência". |
| C-6 | **Não permitir merge com inconsistência de status** | `validar-sprint-status.mjs` reprova o PR administrativo se o `status` da Story e a linha do `sprint-status.yaml` divergirem, ou se a transição for ilegal. Como esse job compõe o `ci-ok` required, a inconsistência **bloqueia o merge**. |
| C-7 | **Não editar sprint-status/Story fora do workflow BMAD** | A etapa 2 **invoca** a skill BMAD autorizada; não faz `sed`/`Edit` no YAML nem no frontmatter. Se a skill não puder rodar não-interativa, a automação para e delega ao humano — nunca improvisa a mutação. |
| C-8 | **Nunca `--force`, nunca squash, sempre `--no-ff`** | O merge de closure usa `--no-ff`; o script jamais faz `push --force` (história compartilhada); a branch de closure é nova por Story. |

---

## D) Riscos e recomendação

### Riscos e trade-offs

1. **`.md` que muda comportamento disfarçado de "só docs".** É o risco central. Um
   arquivo em `docs/**` ou `_bmad-output/**` é, por definição, inerte em runtime — não é
   compilado, empacotado nem executado (ESLint e build já os ignoram). O perigo real
   seria um `.md` que é **fonte** de algo gerado (ex.: um `.md` lido por script de
   build). **Mitigação:** manter na lista **funcional** qualquer `.md` que alimente
   geração de código/config (hoje: nenhum — `scripts/**` já está na lista funcional, e
   um `.md` consumido por script viaja junto de mudança em `scripts/`). Se no futuro
   surgir um `.md` load-bearing, movê-lo explicitamente para o glob funcional. O
   `CLAUDE.md` de raiz é documentação, mas por precaução pode entrar na lista funcional
   (muda regra de agente) — decisão a registrar.

2. **Detecção de "código funcional" por glob pode ter buraco.** Um caminho novo não
   previsto (ex.: um `apps/mobile/` futuro, um `Makefile`) cairia por engano na rota
   leve. **Mitigação:** o default é **fail-safe** — a rota leve exige intenção
   **declarada**; qualquer PR sem `tech/encerra-story-*`/label roda os 4 jobs. E o glob
   funcional usa prefixos amplos (`apps/**`, `.github/**`). Revisar a lista sempre que a
   topologia do monorepo mudar; um teste do próprio detector (fixtures de diff → rota
   esperada) evita regressão silenciosa.

3. **Automação de closure com permissão de escrita.** `contents: write` +
   `pull-requests: write` é superfície nova. **Mitigação:** workflow separado do
   `ci.yml`, `workflow_dispatch` (disparo humano), sem permissão de deploy, sem
   `--admin`, merge só via `--auto` respeitando branch protection. O token nunca funde
   direto em `main`.

4. **Acoplamento à skill BMAD não-interativa.** Se a skill de closure BMAD não expõe
   modo batch, a etapa 2 não pode ser 100% automática. **Mitigação:** aceitar
   semi-automação — a automação cobre branch, PR, guardas e auto-merge; a mutação de
   status permanece um passo humano assistido até a skill ganhar entrada não-interativa.
   Isso **preserva** o invariante C-7 em vez de furá-lo por conveniência.

### Recomendação — implementação incremental

Fazer em fatias pequenas e verificáveis, cada uma com seu `commit-check`, **sem**
antecipar a automação inteira:

- **Fase 1 — só o CI enxuto (maior ganho, menor risco).** Implementar A: job
  `deteccao` + `if:` nos 4 jobs + job `administrativo` + agregador `ci-ok`, e apontar a
  branch protection para `ci-ok`. Isso já elimina o desperdício dos PRs #6/#8 sem
  introduzir nenhuma permissão de escrita. Validar com um PR administrativo real
  (próximo encerramento de Story) observando que os 4 pesados ficam *skipped* e `ci-ok`
  fica verde. Pinar `dorny/paths-filter` por **SHA** (convenção do projeto).

- **Fase 2 — guardas e scripts de validação.** Adicionar `validar-story.mjs`,
  `validar-sprint-status.mjs`, `commit-check-admin.mjs` (`scripts/ci/`), com testes de
  fixture. Ainda sem tocar em permissões de escrita.

- **Fase 3 — orquestração de closure (opt-in).** Só depois das duas primeiras
  estáveis: `fecha-story.yml` com `workflow_dispatch`, criação de branch/PR e
  auto-merge. Manter a etapa de mutação de status delegada à skill BMAD (C-7).

Nunca introduzir as três fases num PR só: a Fase 1 é puramente de tooling de CI e não
exige permissão nova; misturá-la com a Fase 3 (que pede `contents: write`) violaria a
separação de escopo do `commit-check` e concentraria risco. Cada fase é uma entrega
versionável independente, com CI verde antes da próxima.
