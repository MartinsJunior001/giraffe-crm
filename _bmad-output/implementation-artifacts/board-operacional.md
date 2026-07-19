# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 — Modelo, escopo e referências da Automação | `closed` | Writer A | `APPROVED @ e511a86e` | `story/4-1-modelo-automacao-pipe` / `wt-4-1` | #124 **merged** (`2b69f0e`) · closure #125 **merged** (`3032702`) | 5/5 verde em `3032702` | — | — | P0 |
| 1.9 — Troca explícita de Organização | `assigned` | Writer B | — | `story/1-9-troca-explicita-de-organizacao` / `wt-1-9` (em `b6fa176`, sem commit próprio) | — | — | — | BMAD + Spec Kit — não iniciada | P0 |

### 4.1 encerrada — 19/07/2026

`origin/main` = **`3032702a4bc0f4e9b5bc2a4aa05f759789bd1310`**, CI 5/5 verde. `sprint-status`: `epic-4: in-progress`, `4-1-…: done` — **Épico 4 em 1/9**.

Registro do ciclo, porque a lição não é sobre esta Story: a aprovação `@ a7b10506` foi **retratada** para que M1/M2 entrassem no mesmo ciclo, e o merge só ocorreu com `QA_STATUS: APPROVED @ e511a86e` — o HEAD exato. Um `QA_STATUS` antigo com HEAD novo é condição de parada, não autorização. A Lane 0 havia conferido que o delta era textual e **ainda assim não mergeou sem o veredito**: conferir ≠ aprovar (§ Papéis).

## Débitos e P0 fora do PR #124

| Item | Estado | Efeito |
| --- | --- | --- |
| `P0-PIPEGRANT-GUEST-CEILING` (= `DEB-PIPEGRANT-GUEST-CEILING`) | aberto — depende de decisão de Produto (`prd.md:865`, precedente em `prd.md:970`) | **bloqueia a 4.2**; não bloqueia o #124 (`SECURITY_TRIAGE: A`) |
| Automatizar o drill destrutivo da FK composta (L1) | aberto | nenhum — registrado no docstring de `automations-rls.test.ts` |

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/prisma/schema.prisma` | Writer A (4.1) |
| migration nova + fila de migrations | Writer A (4.1) — slot único |
| `apps/api/src/kernel/authz/ability.ts` e `ability.factory.ts` | Writer A (4.1) |
| `apps/api/src/pipes/` | Writer A (4.1) |
| `MODELOS_AUDITADOS` em `apps/api/src/kernel/db/tenant-context.ts` | Writer A (4.1) |
| `apps/api/src/kernel/context/` | Writer B (1.9) |
| superfície web de seleção de Organização | Writer B (1.9) |

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. ~~4.1~~ — integrada em `2b69f0e`, closure em `3032702`. **Slot de migration liberado.**
2. 1.9 (sem migration; pode integrar fora do slot)
