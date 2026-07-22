# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.5 — Catálogo de Ações internas (Card/Registro) | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA + Security cruzados) | `story/4-5-catalogo-de-acoes-internas-card-registro` / worktree isolado | — | — | Modelo do **principal Automação** (principal interno próprio, não impersona o criador, não amplia poderes; revalida escopo na execução; trilha distingue ator/iniciador/principal — RN-101) | Spec Kit consolidado (D4.1): catálogo de Ações (mover/atribuir/alterar Campo/finalizar/arquivar Card; criar/editar Registro com alvo determinístico) + contrato do principal Automação + revalidação, SEM o motor (4.6). RISCO ALTO. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend — app staging `enl6…gktd`, domínio `https://giraffe-crm-staging.2.24.77.65.sslip.io:3000`; sem canal write/deploy e sem fonte segura da key → ação humana no painel Coolify | smoke real quando pronto → closure → done. **NÃO DONE.** | P0 |

**Épico 4 em progresso — 4.1–4.4 done, 4.5 em impl.** **4.4** (catálogo de Condições + avaliação AND) integrada no main `afbb187` (PR #159): módulo `conditions/` — catálogo fixo de 7 tipos (5 domínios), avaliador AND puro **fail-closed** (nenhum caminho de erro/desconhecido abre), contrato de snapshot pós-Evento; reusa `categoriaDeCampo` (fonte única de `record-query.core` 3.5); enforcement `CONDICAO_FORA_DO_CATALOGO`; **sem migration**. QA + Security independentes 0 BLOCKER/HIGH (fail-closed provado fechado; sem injeção/DoS; sem regressão de 3.5). Débitos **DEB-4-4-SNAPSHOT-BUILDER** (montagem sob RLS = 4.6), **DEB-4-4-RESPONSAVEL-CONDICAO**, **DEB-4-4-DATETIME-TZ** (normalizar `Z`). **4.3**: `domain-events/` outbox + emissão same-tx (main `8c7d9e0`); débitos DEB-4-3-OUTBOX-UNIFICACAO, DEB-4-3-EMISSAO-INCREMENTAL. Gate **DEB-PIPEGRANT-GUEST-CEILING** fechado (`14d998e`); follow-ups **M1**/**M2** (M2 = decisão de Produto pendente, não bloqueia).

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
