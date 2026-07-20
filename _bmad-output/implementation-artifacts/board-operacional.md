# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

**Base atual:** `origin/main` = `ef746f3cd1bad98878218ceff7aa9886cdec0b5a` — CI 5/5 verde. Toda Story nova parte deste SHA ou posterior confirmado por `git fetch`.

## Terminais e papéis

| Terminal | Papel | Atribuição atual |
| --- | --- | --- |
| 1 | **Lane 0** — orquestração, integração, release | board, fila, merge, closure · **não escreve código funcional** |
| 2 | **Writer A** | **Story 8.1** — Casca do Painel Administrativo e guarda de acesso |
| 3 | **QA** compartilhado | **aguarda** o novo HEAD do #126 + CI verde — não revisa antes |
| 4 | **Writer B** | **Reconciliar o PR #126** com `origin/main` atual |

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TECH-S1 — Hardening de cabeçalhos de borda | `in-progress` (reconciliação) | Terminal 4 (Writer B) | **suspenso** — aguarda novo HEAD | `tech/s1-hardening-cabecalhos-borda` / `wt-s1-borda` | **#126** aberto | reexecutar após reconciliar | — | **Writer B integra `ef746f3`** → CI verde → só então QA | P0 (segurança de produção) |
| 8.1 — Casca do Painel Administrativo e guarda de acesso | `assigned` | **Terminal 2 (Writer A)** | — | `story/8-1-casca-painel-administrativo` / `wt-8-1` (a criar de `ef746f3`) | — | — | — | criar worktree → BMAD → Spec Kit → implementar → PR | P0 (**caminho crítico**) |
| 4.2 — Ciclo de vida e gestão da Automação | `blocked` | — | — | — | — | — | **ver abaixo** | **não iniciar** | P0 |
| 1.9 — Troca explícita de Organização | `closed` | — | `APPROVED @ bfc40404` | `story/1-9-…` / `wt-1-9` | #127 **merged** (`ecf94b0`) · closure #128 **merged** (`ef746f3`) | 5/5 verde em `ef746f3` | — | **DONE** | P0 |
| 4.1 — Modelo, escopo e referências da Automação | `closed` | — | `APPROVED @ e511a86e` | `story/4-1-…` / `wt-4-1` | #124 **merged** (`2b69f0e`) · closure #125 **merged** (`3032702`) | 5/5 verde | — | **DONE** | P0 |

### 4.2 — bloqueada, dois motivos independentes

1. **Cadeia do Épico 8** — `8.1 → 8.2` (`epics.md:750`). A 8.2 é a dependência direta e ela mesma depende da 8.1, que **começa agora**. É por isso que a 8.1 é caminho crítico e não uma Story qualquer da fila.
2. **`P0-PIPEGRANT-GUEST-CEILING`** — remediação obrigatória **antes** da 4.2, pendente de **decisão de Produto**. A 4.2 é a dona de "Convidado não acessa Automações" (D4.3 / FR-22) e não pode ser aceita sobre uma resolução de poder que ignora o papel de Organização.

Nenhum dos dois se resolve dentro da 4.2. **Não iniciar.** Fechar a 8.1 derruba **um** dos dois — o outro é decisão do dono, não implementação.

**1.11 — não iniciar agora** (decisão da Lane 0). Está elegível e sem gate, mas não destrava nada; a capacidade do Writer A vai para o caminho crítico.

### 4.1 encerrada — 19/07/2026

`sprint-status`: `epic-4: in-progress`, `4-1-…: done` — **Épico 4 em 1/9**.

Registro do ciclo, porque a lição não é sobre esta Story: a aprovação `@ a7b10506` foi **retratada** para que M1/M2 entrassem no mesmo ciclo, e o merge só ocorreu com `QA_STATUS: APPROVED @ e511a86e` — o HEAD exato. Um `QA_STATUS` antigo com HEAD novo é condição de parada, não autorização. A Lane 0 havia conferido que o delta era textual e **ainda assim não mergeou sem o veredito**: conferir ≠ aprovar (§ Papéis).

## Fila de revisão (QA — Terminal 3)

Ordem, conforme `CLAUDE.md` § Fila de revisão. **O CI roda antes da revisão**; QA não revisa PR que ainda falha em check mecânico, nem **revisa SHA já revisado** — o veredito é sempre `@ <sha>` do HEAD corrente.

1. qualquer finding **CRITICAL/HIGH** e migrations;
2. **TECH-S1 (#126)** — segurança de produção — **somente após o novo HEAD reconciliado e o CI verde nele**;
3. **Story 8.1**, quando o PR existir;
4. ordem de chegada, quando as severidades empatarem.

**O QA não revisa o #126 no HEAD atual (`982f493e`).** Ele foi aberto antes do merge da 1.9; revisar agora gastaria a revisão num SHA que vai ser substituído — e o veredito, que é sempre `@ <sha>`, nasceria inválido. Pode aguardar por `/loop`.

## Débitos e itens fora de Story

| Item | Estado | Efeito |
| --- | --- | --- |
| `P0-PIPEGRANT-GUEST-CEILING` (= `DEB-PIPEGRANT-GUEST-CEILING`) | aberto — depende de decisão de Produto (`prd.md:865`; precedente que a fecha em `prd.md:970`) | **bloqueia a 4.2**; não bloqueou o #124 (`SECURITY_TRIAGE: A`) |
| `DEB-BMAD-CLOSURE-WORKFLOW` | **aberto — dono: automação** | ver abaixo |
| `DEB-ENV-TEST-REPRODUZIVEL` | **aberto — dono: Lane 4 / infraestrutura** · **P0 de confiabilidade de testes**, antes do feature freeze | ver abaixo |
| `DEB-TESTE-UPDATE-SEM-WHERE` (F1 da 1.9, LOW) | aberto | nenhum hoje — o cast `::uuid` aborta antes da escrita; risco latente |
| `DEB-TENANT-COMPOSITE-FK-RETROFIT` | aberto | retrofit do par `(orgId, id)` em E2/E3 |
| Automatizar o drill destrutivo da FK composta (L1) | aberto | nenhum — declarado no docstring de `automations-rls.test.ts` |

### `DEB-BMAD-CLOSURE-WORKFLOW`

O `CLAUDE.md` afirma que `sprint-status.yaml` e o status da Story só mudam "pelo workflow BMAD responsável, nunca por edição manual". **Esse workflow não existe como skill instalada** — a busca em `_bmad/`, `skills/` e `.claude/skills/` não encontra nenhum. A prática real, consistente desde a 3.2, é: branch `chore/encerra-<story>`, alteração mínima das duas linhas do `sprint-status.yaml`, PR próprio, CI, merge (PRs #105, #114, #118, #122, #125).

Ou seja: a regra e a realidade não se descrevem com o mesmo vocabulário, e hoje só a disciplina de quem executa separa "closure" de "edição manual proibida".

**A automação deve converter esse precedente numa skill verificável** — a prática já é uniforme o bastante para ser codificada. **Não alterar o processo durante as Stories em voo:** trocar o procedimento de closure no meio de 1.9/TECH-S1 introduziria variável nova sem nenhum ganho de velocidade.

### `DEB-ENV-TEST-REPRODUZIVEL`

| Campo | Conteúdo |
| --- | --- |
| **Problema** | Ambiente local derivado de `.env.example` **não reproduz o CI** — as duas execuções partem de configurações diferentes. |
| **Efeito atual** | 17 falhas locais, incluindo falhas de **autenticação** — entre elas **T013 com 401**. Verde no CI, vermelho na máquina, mesma árvore. |
| **Risco** | Uma falha **real** futura ser classificada como "ambiental conhecida". Quanto mais tempo as 17 durarem sem causa fechada, menos alguém investiga a 18ª. |
| **Correção** | Criar `.env.test` **versionado e seguro** (sem segredo real, determinístico, equivalente ao que o CI monta), adotado por padrão pela suíte local. |
| **Prioridade** | **P0 de confiabilidade de testes**, antes do feature freeze. |
| **Responsável** | **Lane 4 / infraestrutura** |
| **Fechamento** | Suíte local e CI com configuração **equivalente**: as 17 somem ou ganham causa própria, e um vermelho local volta a significar defeito. |

**As 17 falhas locais são AMBIENTAIS — nunca verdes.** O que sustentou o aceite da 1.9 foi o CI verde no HEAD exato, não a alegação local.

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/web/next.config.ts` · `middleware.ts` | **Writer B (TECH-S1)** — até o merge do #126 |
| testes web de cabeçalhos · artefatos do gate TECH-S1 | **Writer B (TECH-S1)** — até o merge do #126 |
| rota/casca do Painel Administrativo (`apps/web/app/**` do Painel) | **Writer A (8.1)** |
| guarda de acesso do Painel no servidor + `ability.ts` / `ability.factory.ts` | **Writer A (8.1)** |

**Atenção — as duas Stories tocam `apps/web`.** Não é colisão: TECH-S1 é `next.config.ts` + `middleware.ts` + testes de cabeçalho; a 8.1 é rota, navegação e casca do Painel. **Arquivos disjuntos, diretório comum.** Writer A **não** toca `next.config.ts` nem `middleware.ts` enquanto o #126 estiver aberto — se a guarda do Painel parecer exigir o middleware, é escalada à Lane 0, não edição.

**Liberadas** — sem dono até nova atribuição da Lane 0: `apps/api/prisma/schema.prisma`, o **slot único de migration**, `ability.ts` / `ability.factory.ts`, `apps/api/src/pipes/`, `MODELOS_AUDITADOS` (fim da 4.1); `apps/api/src/kernel/context/` e a superfície web de seleção de Organização (fim da 1.9).

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. ~~4.1~~ — `2b69f0e`, closure `3032702`. **Slot de migration liberado.**
2. ~~1.9~~ — `ecf94b0`, closure `ef746f3`.
3. **TECH-S1 (#126)** — sem migration; aguardando `QA_STATUS`. Foi aberto antes do merge da 1.9: mesmo com `MERGEABLE/CLEAN`, o QA revisa contra o **`main` atual** (`ef746f3`), e o veredito vale para o SHA que revisar.

## Itens estacionados

| Item | Estado | Condição para sair |
| --- | --- | --- |
| `tech/automacao-multiagente` (`wt-automacao`) | **`LOCAL_ONLY`** — branch publicada só para preservação; **sem PR, sem merge** | 1.9 reconciliada · TECH-S1 em estado conhecido · `main` verde · hooks testados sem afetar sessão ativa |
| PR #25 — checklist de prontidão de staging | **`PARKED`** (aberto desde 14/07) | decisão do dono |
