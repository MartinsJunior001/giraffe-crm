# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8.5 — Suspensão e reativação da Membership | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA cruzado) | `story/8-5-suspensao-e-reativacao-da-membership` / worktree isolado | — | — | — | Spec Kit consolidado (D-1 step-up + D-2 último-Admin na suspensão + D-3 invalidação de sessão/abilities) → impl → PR. RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend (API key + domínio verificado + APP_PUBLIC_URL HTTPS no Coolify) | smoke real quando o ambiente estiver pronto → closure → done. **NÃO DONE.** | P0 |

Recentemente encerradas (Épico 8 + cadeia): **8.1** done · **8.3** done (PR #134) · **1.12** done (PR #140, `a840c77`) · **8.4** done (PR #142, main `782ec65`, alteração de papel + proteção atômica do último Admin `FOR UPDATE` + evento canônico `MembershipEvent`; QA cruzado 0 BLOCKER/HIGH; migration aditiva). Cadeia: **8.5** → 8.6 → 8.7 (D-2/D-3); **8.8** paralelizável (D-4).

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/src/organizations/members/` (suspensão/reativação da Membership) | Subagente Writer (8.5) |
| endpoint/controller/service de suspensão e reativação da Membership | Subagente Writer (8.5) |
| `apps/api/src/organizations/invites/` | Terminal B (8.2, EXTERNAL_GATE — congelado até o smoke) |

`apps/api/src/kernel/auth/` (step-up) e o evento canônico `MembershipEvent` (8.4) são **contratos estáveis** consumidos pela 8.5 sem reabrir a superfície — a 8.5 acrescenta transições de `state` (SUSPENDED/ACTIVE) e novos tipos de evento, não altera o núcleo de papel da 8.4.

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. 8.5 (suspensão/reativação; provável migration aditiva de novos tipos de evento — assume o slot único com drill de rollback)
2. 8.2 (integrada; aguardando só o smoke externo do Resend para closure/done)
