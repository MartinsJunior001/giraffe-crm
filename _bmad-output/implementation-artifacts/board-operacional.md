# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.4 — Catálogo de Condições + avaliação AND | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA + Security cruzados) | `story/4-4-catalogo-de-condicoes-e-avaliacao-and` / worktree isolado | — | — | Gate de Arquitetura (fuso oficial + semântica de comparação) — consolidar no Spec Kit derivando do precedente (operadores do Form Builder 2.4/2.5; `Timestamptz`/DIV-1) | Spec Kit consolidado (D4.2): domínios Card/Campo/prazo/relacionamento/Fase; operadores do Form Builder; AND; snapshot pós-Evento; fail-closed. RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend — app staging `enl6…gktd`, domínio `https://giraffe-crm-staging.2.24.77.65.sslip.io:3000`; sem canal write/deploy e sem fonte segura da key → ação humana no painel Coolify | smoke real quando pronto → closure → done. **NÃO DONE.** | P0 |

**Épico 4 em progresso — 4.1, 4.2 e 4.3 done, 4.4 em impl.** **4.3** (catálogo de Eventos/gatilhos) integrada no main `8c7d9e0` (PR #157): módulo `domain-events/` (catálogo fixo de 16 tipos núcleo + contrato de extensão E5/E6, envelope canônico uuidv5 determinístico com `schemaVersion`, emissão opt-in same-tx), outbox `DomainEvent` (RLS FORCE + WITH CHECK + GRANT append-only SELECT/INSERT + FK composta tenant-safe), `CARD_CREATED` fiado em 2.7/2.8; **QA + Security independentes 0 BLOCKER/HIGH** (cascata segura pois runtime não deleta Pipe; regressão dos sítios aditiva). Débitos **DEB-4-3-OUTBOX-UNIFICACAO** (2 outboxes até 4.6) e **DEB-4-3-EMISSAO-INCREMENTAL** (15/16 tipos sem produtor fiado — AD-11). **4.2**: `AutomationVersion` + 1º UPDATE column-scoped (main `b16715d`); débito **DEB-4-2-AUDIT-PROJECTION**. O gate **DEB-PIPEGRANT-GUEST-CEILING** foi **fechado** (main `14d998e`); follow-ups **M1** (`DEB-PROFILE-RELATED-PIPES-CEILING`) e **M2** (`DEB-GUEST-CEILING-CARDGRANT`, decisão de Produto pendente — não bloqueia).

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
