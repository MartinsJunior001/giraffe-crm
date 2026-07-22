# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1.12 — Troca autenticada de senha (step-up) | `assigned` | Terminal B | Terminal A | `story/1-12-troca-autenticada-de-senha` / `wt-1-12` | — | — | — | reconciliar contratos (D-1/AD-7/AD-9/Better Auth) → Spec Kit consolidado → impl → PR. RISCO ALTO. Publicar `WRITER_STARTED`. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend (API key + domínio verificado + APP_PUBLIC_URL HTTPS no Coolify) | smoke real quando o ambiente estiver pronto → closure → done. **NÃO DONE.** | P0 |

Recentemente encerradas (Épico 8): **8.1** done · **8.3** done (PR #134, main `a44b886`). Cadeia após 1.12: 8.4 → 8.5 → 8.6 → 8.7 (gated por 1.12/D-2/D-3); **8.8** paralelizável (write-side/read-side técnico desbloqueado por D-4; política de retenção = gate de produção).

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/src/kernel/auth/` (step-up + política central de senha) | Terminal B (1.12) |
| endpoint/controller/service de troca autenticada de senha | Terminal B (1.12) |
| integração de revogação de sessões (Better Auth) + tokens de recuperação pendentes | Terminal B (1.12) |
| `apps/api/src/organizations/invites/` | Terminal B (8.2, EXTERNAL_GATE — congelado até o smoke) |

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. 1.12 (sem migration esperada; se surgir schema, assume o slot único de migration com drill de rollback)
2. 8.2 (integrada; aguardando só o smoke externo do Resend para closure/done)
