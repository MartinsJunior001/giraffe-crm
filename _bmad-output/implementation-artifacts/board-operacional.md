# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.7 — Encadeamento e prevenção de ciclos | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA + Security cruzados) | `story/4-7-encadeamento-e-prevencao-de-ciclos` / worktree isolado | — | — | Gate de Arquitetura: **números** dos limites (profundidade/tentativas/timeouts/retenção/dead-letter) — consolidar de precedente (4.6) + defaults, escalar se decisão de Produto | Spec Kit consolidado (NFR-7/AD-18): encadeamento legítimo (Ação→Evento→Automação) + prevenção de ciclos (`executionChainId`/`causationId`, profundidade máx, assinatura de visita determinística, dedup, timeouts, dead-letter). RISCO ALTO — loop infinito = DoS. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend — app staging `enl6…gktd`, domínio `https://giraffe-crm-staging.2.24.77.65.sslip.io:3000`; sem canal write/deploy e sem fonte segura da key → ação humana no painel Coolify | smoke real quando pronto → closure → done. **NÃO DONE.** | P0 |

**Épico 4 em progresso — 4.1–4.6 done, 4.7 em impl.** **4.6** (Motor de disparo e avaliação) integrada no main `4bf24c9` (PR #164): módulo `engine/` — outbox→drain→executors, ledger `AutomationExecution` (dedup por Execução) + `AutomationActionResult` (append-only, dedup por Ação), claim `FOR UPDATE SKIP LOCKED`, recuperação por lease, retry/backoff; snapshot builder sob RLS (fecha DEB-4-4, aplica **M-1** com guarda simétrica); executores reais (3 Ações executam com SC-2101/2102; 5 sensíveis `BLOCKED_CONFIRMATION` por L-1); migration com GRANT column-scoped + append-only + FK composta. **QA + Security independentes 0 BLOCKER/HIGH** (não-ampliação provada; dedup em 2 camadas; provas de integração de SC-2101/lease-recovery/confirmação adicionadas por exigência da Lane 0 — Constituição X). Fecha DEB-4-4-SNAPSHOT-BUILDER, DEB-4-5-EVENTO-ALVO-CONTAINMENT, DEB-4-5-MEMBERSHIP-REF. **Débitos novos:** DEB-4-6-DRIVER-CONTINUO (loop contínuo/dead-letter → 4.7), DEB-4-6-SNAPSHOT-LIVE-STATE, DEB-4-6-CLAIM-AUDIT, DEB-4-6-DENIED-NOISE, DEB-4-6-CONFIRMACAO-CONTINUACAO. Gate **DEB-PIPEGRANT-GUEST-CEILING** fechado; **M2** (`DEB-GUEST-CEILING-CARDGRANT`, decisão de Produto pendente) e **DEB-4-4-DATETIME-TZ** não bloqueiam. **CVE `sharp`** corrigido (#163).

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
