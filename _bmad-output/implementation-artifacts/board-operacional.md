# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8.8 — Auditoria administrativa (write+read-side técnico) | `assigned` | Subagente Writer B (Lane 0) | Lane 0 (QA cruzado) | `story/8-8-auditoria-administrativa` / worktree isolado | — | — | — | Spec Kit consolidado (D-4): read-side Admin-only sobre a trilha `MembershipEvent`, filtros/paginação/ordem determinística, `AUDIT_LOG_VIEWED`, minimização; retenção 24m = gate de PRODUÇÃO (não bloqueia impl). RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend (API key + domínio verificado + APP_PUBLIC_URL HTTPS no Coolify) | smoke real quando o ambiente estiver pronto → closure → done. **NÃO DONE.** | P0 |

Recentemente encerradas (Épico 8 + cadeia): **8.1** done · **8.3** done · **1.12** done · **8.4** done (`782ec65`) · **8.5** done (`c37e82e`) · **8.6** done (`7690f7f`, `REVOKE DELETE` fechando DEB-MEMBERSHIP-EVENT-CASCADE) · **8.7** done (PR #148, main `25b1a21`, roster read-side; isolamento cross-tenant provado incl. filtro por e-mail; visão reduzida do Membro no servidor; sem migration; QA cruzado 0 BLOCKER/HIGH). **8.8** é a ÚLTIMA Story de impl do Épico 8; depois só resta o smoke externo da **8.2** (Resend) para o épico fechar.

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| novo módulo de **auditoria** (`apps/api/src/organizations/audit/` ou equivalente, read-side sobre `MembershipEvent`) | Subagente Writer B (8.8) |
| `apps/api/src/organizations/invites/` (write-side) | Terminal B (8.2, EXTERNAL_GATE — congelado) |

`kernel/auth` (step-up), `MembershipEvent` (8.4–8.6, taxonomia completa) e os padrões de autz fina são contratos estáveis lidos pela 8.8. O subdomínio de roster (`members/roster*`, 8.7) já está integrado no main — a 8.8 não o toca.

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. 8.8 (auditoria read-side; migration só se persistir `AUDIT_LOG_VIEWED` em tabela — do contrário read-side puro)
2. 8.2 (integrada; aguardando só o smoke externo do Resend para closure/done)
