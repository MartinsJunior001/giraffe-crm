# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.6 — Motor de disparo e avaliação | `assigned` | Subagente Writer (Lane 0) | Lane 0 (QA + Security cruzados) | `story/4-6-motor-de-disparo-e-avaliacao` / worktree isolado | — | — | Gate de Arquitetura pesado (outbox/fila/retries/backoff/timeout/concorrência/idempotência/recuperação de jobs); **requisito duro M-1** (contenção do alvo derivado do Evento ao Pipe proprietário + teste cross-Pipe) | Spec Kit consolidado (D4.2): motor at-least-once consumindo 4.3(eventos)+4.4(condições)+4.5(ações/principal); dedup por Execução e Ação; ordem/falha/efeitos parciais. RISCO ALTO — executa mutações reais. | P0 |
| 8.2 — Convite: criar/reenviar/cancelar | `merged` | Terminal B | Terminal A | `story/8-2-...` | #132 | 5/5 | **EXTERNAL_GATE** Resend — app staging `enl6…gktd`, domínio `https://giraffe-crm-staging.2.24.77.65.sslip.io:3000`; sem canal write/deploy e sem fonte segura da key → ação humana no painel Coolify | smoke real quando pronto → closure → done. **NÃO DONE.** | P0 |

**Épico 4 em progresso — 4.1–4.5 done, 4.6 em impl.** **4.5** (catálogo de Ações + principal Automação) integrada no main `996d237` (PR #161): módulo `actions/` — catálogo fixo de 8 Ações, `PrincipalAutomacao` (escopo restrito + capacidades deny-by-default; **não carrega o criador** → impossível herdar poder), `action-revalidation.core` puro fail-closed (não-ampliação provada), trilha ator/iniciador/principal; enforcement `ACAO_FORA_DO_CATALOGO`; **sem migration**. QA + Security independentes 0 BLOCKER/HIGH. **Requisitos passados à 4.6: M-1 `DEB-4-5-EVENTO-ALVO-CONTAINMENT`** (a entrega do Evento deve conter `recordId`/`linkedRecordIds` a um Card do Pipe proprietário + teste de rejeição cross-Pipe/foreign-Database), **L-1** (executar por `permitido`, não por `exigeConfirmacaoHumana`), **DEB-4-5-MEMBERSHIP-REF** (SC-2101/2102 na execução). **4.4**: `conditions/` fail-closed (main `afbb187`; DEB-4-4-SNAPSHOT-BUILDER = a 4.6 monta o snapshot sob RLS). **4.3**: `domain-events/` outbox (main `8c7d9e0`; DEB-4-3-OUTBOX-UNIFICACAO = a 4.6 reconcilia o consumo). Gate **DEB-PIPEGRANT-GUEST-CEILING** fechado; follow-ups **M1**/**M2** (M2 = decisão de Produto pendente, não bloqueia).

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
