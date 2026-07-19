# Board operacional

Fotografia do estado operacional. **Escrito exclusivamente pela Lane 0** — Writers e QA leem, não editam.

**Não é fonte de verdade.** A ordem de reconciliação está no `CLAUDE.md` (§ Protocolo Autônomo de Aceleração → Fonte de verdade): `origin/main` → PRs e CI → `sprint-status` → BMAD/Spec Kit → branches e worktrees → **board** → MEMORY. Divergiu do repositório, o errado é o board.

Estados: `backlog` · `assigned` · `in-progress` · `pr-open` · `in-review` · `ready-to-merge` · `merged` · `closed` · `blocked`.

## Stories em voo

| Story | Estado | Writer | QA | Branch / worktree | PR | CI | Bloqueio | Próxima ação | Prio |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.1 — Modelo, escopo e referências da Automação | `in-review` | Writer A | pendente em `e511a86e` | `story/4-1-modelo-automacao-pipe` / `wt-4-1` | #124 (aberto, `MERGEABLE`/`CLEAN`) | 5/5 verde em `e511a86e` | QA final não emitido no HEAD atual | **QA revisar `e511a86e`** e publicar veredito no PR; só então a Lane 0 libera o merge | P0 |
| 1.9 — Troca explícita de Organização | `assigned` | Writer B | — | `story/1-9-troca-explicita-de-organizacao` / `wt-1-9` (em `b6fa176`, sem commit próprio) | — | — | — | BMAD + Spec Kit — não iniciada | P0 |

### Bloqueio ativo — 4.1 aguarda QA no HEAD corrente

O `QA_STATUS: APPROVED` de 19/07 17:48 vale para `a7b10506`, **não** para o HEAD atual. A própria Lane 0 retratou aquele SHA às 18:23 (“**Não aprovar `a7b10506`**”) ao mandar M1/M2 para dentro do ciclo; o Writer entregou `e511a86e` às 18:33 e declarou `READY_FOR_QA`. **Nenhum veredito de QA existe em `e511a86e`** — o último evento do PR é o pedido de revisão.

O delta `a7b10506..e511a86e` foi conferido pela Lane 0 e é textual: em `ability.factory.ts` só linhas de comentário mudam (`can('ler','Automacao',{orgId})` intacto) e nos dois testes só três strings de rótulo de `it`. **Isso não substitui o veredito**: quem integra não aprova o que vai mergear (§ Papéis). Evento pendente: `CI_GREEN_READY_FOR_QA` → **QA**.

## Débitos e P0 fora do PR #124

| Item | Estado | Efeito |
| --- | --- | --- |
| `P0-PIPEGRANT-GUEST-CEILING` (= `DEB-PIPEGRANT-GUEST-CEILING`) | aberto — depende de decisão de Produto (`prd.md:865`, precedente em `prd.md:970`) | **bloqueia a 4.2**; não bloqueia o #124 (`SECURITY_TRIAGE: A`) |
| Automatizar o drill destrutivo da FK composta (L1) | aberto | nenhum — registrado no docstring de `automations-rls.test.ts` |

## Reservas ativas (anticolisão)

Superfícies com Writer exclusivo enquanto a Story estiver em voo. Quem não é o dono não edita.

| Superfície | Reservada por |
| --- | --- |
| `apps/api/prisma/schema.prisma` | Writer A (4.1) |
| migration nova + fila de migrations | Writer A (4.1) — slot único |
| `apps/api/src/kernel/authz/ability.ts` e `ability.factory.ts` | Writer A (4.1) |
| `apps/api/src/pipes/` | Writer A (4.1) |
| `MODELOS_AUDITADOS` em `apps/api/src/kernel/db/tenant-context.ts` | Writer A (4.1) |
| `apps/api/src/kernel/context/` | Writer B (1.9) |
| superfície web de seleção de Organização | Writer B (1.9) |

## Fila de integração

Um merge por vez, ordenado pela Lane 0. **Uma migration integrada por vez.**

1. 4.1 (detém o slot de migration)
2. 1.9 (sem migration; pode integrar fora do slot)
