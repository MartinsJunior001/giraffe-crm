# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8.7 — Roster de membros e convites (read-side) | `assigned` | Subagente Writer A (Lane 0) | Lane 0 (QA cruzado) | `story/8-7-roster-de-membros-e-convites` / worktree isolado | — | — | — | Spec Kit consolidado → read-side (listagem de membros por estado/papel + convites pendentes), paginação/ordem determinística, autz Admin da Org, sem migration esperada. RISCO MÉDIO. | P0 |
| 8.8 — Auditoria administrativa (write+read-side técnico) | `assigned` | Subagente Writer B (Lane 0) | Lane 0 (QA cruzado) | `story/8-8-auditoria-administrativa` / worktree isolado | — | — | — | Spec Kit consolidado (D-4): read-side Admin-only sobre a trilha `MembershipEvent`, filtros/paginação/ordem determinística, `AUDIT_LOG_VIEWED`, minimização; retenção 24m = gate de PRODUÇÃO (não bloqueia impl). RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend (API key + domínio verificado + APP_PUBLIC_URL HTTPS no Coolify) | smoke real quando o ambiente estiver pronto → closure → done. **NÃO DONE.** | P0 |

Recentemente encerradas (Épico 8 + cadeia): **8.1** done · **8.3** done · **1.12** done · **8.4** done (`782ec65`) · **8.5** done (`c37e82e`) · **8.6** done (PR #146, main `7690f7f`, remoção/saída voluntária + `REVOKE DELETE ON Membership` fechando DEB-MEMBERSHIP-EVENT-CASCADE; 4 testes fundacionais fortalecidos; QA cruzado 0 BLOCKER/HIGH). Eixo do ciclo de vida de Membership COMPLETO (CREATED/ROLE_CHANGED/SUSPENDED/REACTIVATED/REMOVED) → **8.7 e 8.8 paralelizadas** (superfícies disjuntas); depois só resta o smoke da 8.2.

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/src/organizations/members/` — subdomínio de **LEITURA** roster (`roster*`/read-side) | Subagente Writer A (8.7) |
| novo módulo de **auditoria** (`apps/api/src/organizations/audit/` ou equivalente, read-side sobre `MembershipEvent`) | Subagente Writer B (8.8) |
| `apps/api/src/organizations/invites/` (write-side) | Terminal B (8.2, EXTERNAL_GATE — congelado; 8.7 apenas LÊ dados de convite, não edita o write-side) |

**Disjunção 8.7 × 8.8:** 8.7 é read-side de roster (listagem de membros/convites); 8.8 é read-side de auditoria (novo módulo sobre a trilha `MembershipEvent`). Não compartilham arquivos de escrita. `kernel/auth` (step-up), `MembershipEvent` (8.4–8.6) e os padrões de autz fina (`resolverPoder*`) são contratos estáveis lidos por ambas.

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.** 8.7 e 8.8 são read-side; se alguma trouxer migration (ex.: config de retenção da 8.8), ela assume o slot único sozinha — a outra rebaseia após.

1. 8.7 (roster read-side; sem migration esperada) OU 8.8 (auditoria) — ordem por quem passar o QA primeiro
2. 8.2 (integrada; aguardando só o smoke externo do Resend para closure/done)
