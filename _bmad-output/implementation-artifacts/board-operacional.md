# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.2 — Ciclo de vida e gestão da Automação | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA + Security cruzados) | `story/4-2-ciclo-de-vida-e-gestao-da-automacao` / worktree isolado | — | — | — | Spec Kit consolidado (D4.3): criar/editar/ativar/desativar/arquivar/restaurar/duplicar + snapshot em edição ativa; autz "config do Pipe" consumindo o teto de Convidado já imposto. RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend — app staging `enl6…gktd`, domínio `https://giraffe-crm-staging.2.24.77.65.sslip.io:3000`; sem canal write/deploy e sem fonte segura da key → ação humana no painel Coolify | smoke real quando pronto → closure → done. **NÃO DONE.** | P0 |

**Épico 4 reaberto — Story 4.2 em impl.** O gate **DEB-PIPEGRANT-GUEST-CEILING** foi **fechado** (unidade `tech/pipegrant-guest-ceiling`, PR #153, main `14d998e`): CONVIDADO limitado a `VIEWER` no PipeGrant; write-side na tx, read-side fail-closed p/ dado legado, reconciliação Membership→GUEST sem rebaixamento silencioso. **Dois revisores independentes** (QA + Security) 0 BLOCKER/HIGH. Follow-ups: **DEB-PROFILE-RELATED-PIPES-CEILING** (M1, display-only no Perfil) e **DEB-GUEST-CEILING-CARDGRANT** (M2, decisão de Produto pendente — o teto cobre PipeGrant, não CardGrant operacional; não bloqueia a 4.2).

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
