# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend (API key + domínio verificado + APP_PUBLIC_URL HTTPS no Coolify) | smoke real quando o ambiente estiver pronto → closure → done. **NÃO DONE.** | P0 |

**Implementação do Épico 8 COMPLETA.** Encerradas: **8.1 · 8.3 · 8.4 · 8.5 · 8.6 · 8.7 · 8.8** (+ dependência **1.12**), todas com QA cruzado 0 BLOCKER/HIGH. Última integrada: **8.8** (PR #150, main `ec42225`, auditoria read-side sobre `MembershipEvent`; projeção allowlist AD-30 fail-closed; `AUDIT_LOG_VIEWED` sem copiar resultados; sem migration; retenção 24m = gate de PRODUÇÃO deferido). **Único item pendente do Épico 8 = smoke externo da 8.2 (Resend)** — `EXTERNAL_BLOCKER` humano. `epic-8` fica `in-progress` até o smoke da 8.2.

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/src/organizations/invites/` (write-side) | Terminal B (8.2, EXTERNAL_GATE — congelado até o smoke) |

Nenhuma Story de implementação em voo — o Épico 8 está code-complete. Todas as superfícies de `organizations/` (members, roster, audit) estão integradas no main. `invites/` segue congelado só para o smoke da 8.2.

## Fila de integração

Nenhuma integração de código pendente. Resta:

1. **Smoke externo da 8.2** (Resend: API key + domínio verificado + `APP_PUBLIC_URL` HTTPS no Coolify — gate humano) → closure 8-2→done → `epic-8` fecha.
2. Gate de PRODUÇÃO da auditoria (D-4): retenção 24m/legal-hold/anonimização/backups com Governança/Jurídico (`DEB-8-8-RETENCAO-PRODUCAO`) — não bloqueia staging, bloqueia produção.
3. `epic-8-retrospective` (optional).
