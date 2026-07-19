# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 — Modelo, escopo e referências da Automação | `in-progress` | Writer A | — | `story/4-1-modelo-automacao-pipe` / `wt-4-1` | — | — | — | concluir gates locais (generate → typecheck → testes → drill de rollback) e abrir PR | P0 |
| 1.9 — Troca explícita de Organização | `assigned` | Writer B | — | `story/1-9-troca-explicita-de-organizacao` / `wt-1-9` | — | — | — | BMAD + Spec Kit | P0 |

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

1. 4.1 (detém o slot de migration)
2. 1.9 (sem migration; pode integrar fora do slot)
