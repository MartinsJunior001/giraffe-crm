# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

**Base atual:** `origin/main` = `3032702a4bc0f4e9b5bc2a4aa05f759789bd1310` — CI 5/5 verde. Toda Story nova parte deste SHA ou posterior confirmado por `git fetch`.

## Terminais e papéis

| Terminal | Papel | Atribuição atual |
| --- | --- | --- |
| 1 | **Lane 0** — orquestração, integração, release | board, fila, merge, closure |
| 2 | **Writer A** | Story 1.9 — Troca explícita de Organização |
| 3 | **QA** compartilhado | fila de revisão (abaixo) |
| 4 | **Writer B** | TECH-S1 — Hardening de cabeçalhos de borda |

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 — Modelo, escopo e referências da Automação | `closed` | — | `APPROVED @ e511a86e` | `story/4-1-modelo-automacao-pipe` / `wt-4-1` | #124 **merged** (`2b69f0e`) · closure #125 **merged** (`3032702`) | 5/5 verde em `3032702` | — | **DONE** | P0 |
| 1.9 — Troca explícita de Organização | `assigned` | **Terminal 2 (Writer A)** | — | `story/1-9-troca-explicita-de-organizacao` / `wt-1-9` | — | — | — | fast-forward para `3032702` → BMAD → Spec Kit → implementar → PR | P0 |
| TECH-S1 — Hardening de cabeçalhos de borda | `assigned` | **Terminal 4 (Writer B)** | — | `tech/s1-hardening-cabecalhos-borda` / `wt-s1-borda` (a criar de `3032702`) | — | — | — | criar worktree → BMAD/Spec Kit proporcional → implementar → PR | P0 (segurança de produção) |
| 4.2 — Ciclo de vida e gestão da Automação | `blocked` | — | — | — | — | — | **ver abaixo** | **não iniciar** | P0 |

### 4.2 — bloqueada, dois motivos independentes

1. **Dependência da 8.2** — não satisfeita.
2. **`P0-PIPEGRANT-GUEST-CEILING`** — remediação obrigatória **antes** da 4.2, pendente de **decisão de Produto**. A 4.2 é a dona de "Convidado não acessa Automações" (D4.3 / FR-22) e não pode ser aceita sobre uma resolução de poder que ignora o papel de Organização.

Nenhum dos dois se resolve dentro da 4.2. **Não iniciar.**

### 4.1 encerrada — 19/07/2026

`sprint-status`: `epic-4: in-progress`, `4-1-…: done` — **Épico 4 em 1/9**.

Registro do ciclo, porque a lição não é sobre esta Story: a aprovação `@ a7b10506` foi **retratada** para que M1/M2 entrassem no mesmo ciclo, e o merge só ocorreu com `QA_STATUS: APPROVED @ e511a86e` — o HEAD exato. Um `QA_STATUS` antigo com HEAD novo é condição de parada, não autorização. A Lane 0 havia conferido que o delta era textual e **ainda assim não mergeou sem o veredito**: conferir ≠ aprovar (§ Papéis).

## Fila de revisão (QA — Terminal 3)

Ordem, conforme `CLAUDE.md` § Fila de revisão. **O CI roda antes da revisão**; QA não revisa PR que ainda falha em check mecânico, nem **revisa SHA já revisado** — o veredito é sempre `@ <sha>` do HEAD corrente.

1. qualquer finding **CRITICAL/HIGH** e migrations;
2. **TECH-S1** — segurança de produção;
3. **Story 1.9**;
4. ordem de chegada, quando as severidades empatarem.

Pode aguardar por `/loop`.

## Débitos e itens fora de Story

| Item | Estado | Efeito |
| --- | --- | --- |
| `P0-PIPEGRANT-GUEST-CEILING` (= `DEB-PIPEGRANT-GUEST-CEILING`) | aberto — depende de decisão de Produto (`prd.md:865`; precedente que a fecha em `prd.md:970`) | **bloqueia a 4.2**; não bloqueou o #124 (`SECURITY_TRIAGE: A`) |
| `DEB-BMAD-CLOSURE-WORKFLOW` | **aberto — dono: automação** | ver abaixo |
| `DEB-TENANT-COMPOSITE-FK-RETROFIT` | aberto | retrofit do par `(orgId, id)` em E2/E3 |
| Automatizar o drill destrutivo da FK composta (L1) | aberto | nenhum — declarado no docstring de `automations-rls.test.ts` |

### `DEB-BMAD-CLOSURE-WORKFLOW`

O `CLAUDE.md` afirma que `sprint-status.yaml` e o status da Story só mudam "pelo workflow BMAD responsável, nunca por edição manual". **Esse workflow não existe como skill instalada** — a busca em `_bmad/`, `skills/` e `.claude/skills/` não encontra nenhum. A prática real, consistente desde a 3.2, é: branch `chore/encerra-<story>`, alteração mínima das duas linhas do `sprint-status.yaml`, PR próprio, CI, merge (PRs #105, #114, #118, #122, #125).

Ou seja: a regra e a realidade não se descrevem com o mesmo vocabulário, e hoje só a disciplina de quem executa separa "closure" de "edição manual proibida".

**A automação deve converter esse precedente numa skill verificável** — a prática já é uniforme o bastante para ser codificada. **Não alterar o processo durante as Stories em voo:** trocar o procedimento de closure no meio de 1.9/TECH-S1 introduziria variável nova sem nenhum ganho de velocidade.

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/src/kernel/context/` | **Writer A (1.9)** |
| superfície web de seleção de Organização | **Writer A (1.9)** |
| `apps/web/next.config.ts` | **Writer B (TECH-S1)** |
| testes web de cabeçalhos | **Writer B (TECH-S1)** |
| artefatos exclusivos do gate TECH-S1 | **Writer B (TECH-S1)** |

**Liberadas com o fim da 4.1** — sem dono até nova atribuição da Lane 0: `apps/api/prisma/schema.prisma`, o **slot único de migration**, `apps/api/src/kernel/authz/ability.ts` e `ability.factory.ts`, `apps/api/src/pipes/`, `MODELOS_AUDITADOS` em `tenant-context.ts`.

**TECH-S1 é web-only:** sem migration, Prisma, CASL, API ou arquivo do Épico 4. As duas Stories em voo não têm superfície comum — 1.9 é `kernel/context/` + seleção de Org; TECH-S1 é `next.config.ts` + testes de cabeçalho.

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. ~~4.1~~ — integrada em `2b69f0e`, closure em `3032702`. **Slot de migration liberado.**
2. TECH-S1 (sem migration) e 1.9 (sem migration) — podem integrar fora do slot; a ordem entre elas é por chegada do `QA_APPROVED`.

## Itens estacionados

| Item | Estado | Condição para sair |
| --- | --- | --- |
| `tech/automacao-multiagente` (`wt-automacao`) | **`LOCAL_ONLY`** — branch publicada só para preservação; **sem PR, sem merge** | 1.9 reconciliada · TECH-S1 em estado conhecido · `main` verde · hooks testados sem afetar sessão ativa |
| PR #25 — checklist de prontidão de staging | **`PARKED`** (aberto desde 14/07) | decisão do dono |
