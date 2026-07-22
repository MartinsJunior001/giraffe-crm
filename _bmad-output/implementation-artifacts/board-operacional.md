# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8.4 — Alteração de papel da Membership | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA cruzado) | `story/8-4-alteracao-de-papel-da-membership` / `wt-8-4` | — | — | — | Spec Kit consolidado (D-1 step-up + D-2 último-Admin + D-3 sessão) → impl → PR. RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend (API key + domínio verificado + APP_PUBLIC_URL HTTPS no Coolify) | smoke real quando o ambiente estiver pronto → closure → done. **NÃO DONE.** | P0 |

Recentemente encerradas (Épico 8 + cadeia): **8.1** done · **8.3** done (PR #134) · **1.12** done (PR #140, main `a840c77`, step-up + política central de senha; 0 BLOCKER/HIGH; sem migration). Cadeia liberada: **8.4** → 8.5 → 8.6 → 8.7 (D-2/D-3); **8.8** paralelizável (write/read-side técnico desbloqueado por D-4; retenção = gate de produção).

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/src/organizations/members/` (alteração de papel + proteção do último Admin) | Subagente Writer (8.4) |
| endpoint/controller/service de alteração de papel da Membership | Subagente Writer (8.4) |
| `apps/api/src/organizations/invites/` | Terminal B (8.2, EXTERNAL_GATE — congelado até o smoke) |

`apps/api/src/kernel/auth/` (step-up + política de senha) foi **liberado** com o encerramento da 1.12 — a 8.4 **consome** o `StepUpService`/`PasswordPolicy` como contrato estável, sem reabrir a superfície.

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. 8.4 (alteração de papel; migration só se D-2 exigir coluna de versão de autorização — assume o slot único com drill de rollback)
2. 8.2 (integrada; aguardando só o smoke externo do Resend para closure/done)
