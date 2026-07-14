---
story_key: 2-9-kanban-e-espaco-operacional-do-card
epic: 2
status: draft
release: CORE (bloco 2.9; ver roadmap)
risco: MEDIO
baseline_commit: empilha sobre a 2.7 (Card/CardHistory; índice [orgId, pipeId, phaseId] preparado para o Kanban)
divergencia_de_escopo: |
  DECISÃO DO DONO PENDENTE (Q1). O brief desta tarefa e os comentários da migration da 2.7
  (20260714140000_cards, linhas 68 e 98: "Mover o Card entre Fases (2.9) … são UPDATE") assumem que a 2.9
  introduz a MOVIMENTAÇÃO de Card (GRANT UPDATE + evento MOVED + posição). O artefato AUTORITATIVO epics.md
  escopa a 2.9 como SUPERFÍCIE DE LEITURA e coloca a movimentação na Story 2.14 (Fora: movimentação (2.14);
  AC: "nenhuma movimentação é executada aqui"). A referência "(2.9)" na migration é anterior a uma renumeração
  do epics.md. Estes artefatos seguem o AUTORITATIVO (2.9 = leitura, sem migration/GRANT UPDATE). O design de
  movimentação está no Apêndice A da spec, pronto para a 2.14. Não implementar antes de Q1 decidida.
gate_arquitetura: |
  Fatia de LEITURA sobre Card/Phase já materializados (2.7/2.3): SEM schema, SEM migration, SEM mudança de GRANT
  (runtime já tem SELECT em Card e Phase; NÃO ganha UPDATE — invariante da 2.7 preservado, movimentação é 2.14).
  Kanban = Cards do Pipe agrupados por Fase (Fases ativas por position; escopo Org por RLS), consumindo
  @@index([orgId, pipeId, phaseId]) criado na 2.7. Espaço do Card (três painéis UX-DR10) = valores + Fase atual
  (nome/visível) + contrato de "ações permitidas" derivado do poder (resolverPoderNoPipe: gerenciar/operar/ler),
  sem revelar administrativas. Autorização de leitura = acesso ao Pipe (VIEWER concedido LÊ; sem acesso → 404
  não-enumerante) via pipe-authz reusado; guard/ability.ts (C3) intocados (DBT-AUTHZ-01). "Estado atual" = a
  Fase (não há coluna de ciclo de vida antes da 2.11; AD-11 — sem coluna especulativa). Histórico read-side é
  2.17 (painel só estruturado). Toda leitura por withTenantContext; nenhum where orgId manual; orgId fora da
  fronteira; valores nunca em log. Questões abertas p/ o dono: Q1 escopo, Q2 ordem do Card (createdAt vs
  position), Q3 frontend nesta fatia, Q4 "estado"=Fase, Q5 shape das capacidades, Q6 paginação (gate NFR-3/4),
  Q7 painel de Histórico só estruturado.
---

# Story 2.9 — Kanban e espaço operacional do Card

**Como** usuário com acesso a um Pipe (Admin da Org, Admin do Pipe, Membro ou Somente leitura), **quero** ver os
Cards agrupados por Fase no Kanban e abrir um Card no seu espaço de três painéis **para que** eu opere o trabalho
com clareza — vendo dados, a Fase atual e apenas as ações que a minha autorização permite.

## ⚠️ Divergência de escopo (ver front-matter e specs/2-9-kanban-e-espaco-operacional/spec.md §Divergência)

`epics.md` (autoritativo) → 2.9 é **leitura**; movimentação é **2.14**. Brief/comentários da migration 2.7 →
2.9 movimenta. Estes artefatos seguem o autoritativo; movimentação = Apêndice A da spec (contingente/2.14).

## ✅ Resolução do dono (2026-07-14) — Q1–Q7 decididas, implementação DESBLOQUEADA
- **Q1 (escopo):** 2.9 = **somente leitura** (alinhado ao `epics.md`); movimentação/drag-and-drop persistente/mudança de Fase **fora** (2.14). SEM migration, SEM GRANT UPDATE/DELETE em `Card`.
- **Q2 (ordem):** determinística por `createdAt` + `id` (tie-break); sem ordem manual (não há `position` em `Card`).
- **Q3 (frontend):** entrega como **API interna** (padrão das fatias 2.x); a UI React fica para depois.
- **Q4 (estado):** "estado atual" = a **Fase**.
- **Q5 (capacidades):** payload do Card devolve as capacidades efetivas derivadas do `poder`; administrativas nunca reveladas.
- **Q6 (paginação):** leituras **paginadas** por cursor determinístico — colunas do Kanban paginam por Fase (skeleton de colunas + contagem via `groupBy`, sem N+1); Cards por Fase por cursor `(createdAt, id)`.
- **Q7 (histórico):** a 2.9 só **estrutura** o painel; ler `CardHistory` é 2.17.

## Critérios de aceite (SC-29x — derivados dos ACs do epics.md)
- **SC-291** — Abrir o Pipe lista os Cards **agrupados por Fase** (Fases ativas por `position`), no escopo da Org
  atual (RLS). Fase sem Card → coluna vazia (200), não erro.
- **SC-292** — Abrir um Card devolve seus dados (`valores`), a **Fase atual** (nome/visível), referência à versão do
  Formulário e timestamps; **"estado atual" = a Fase** (não há coluna de ciclo de vida antes da 2.11 — Q4).
- **SC-293** — O detalhe do Card devolve as **capacidades efetivas** derivadas do `poder`; **Somente leitura**
  (Viewer) recebe só leitura — ações não permitidas ocultas/desabilitadas na UI; **administrativas nunca reveladas**
  (Q5 define o shape).
- **SC-294** — Autorização de **leitura** = acesso ao Pipe: Admin da Org e concedidos (ADMIN/MEMBER/**VIEWER**) leem;
  sem acesso → **404 não-enumerante**. Reusa `pipe-authz`; **sem** novo GRANT; guard/`ability.ts` (C3) intocados.
- **SC-295** — Estados honestos (loading/vazio/erro/acesso negado); respostas sanitizadas (sem `orgId`/URL
  interna/stack). **Nenhuma movimentação é executada** — o runtime segue **sem `GRANT UPDATE`** em `Card`
  (regressão da 2.7 reafirmada em `kanban-rls`).

## Não-objetivos (registrados)
Movimentação de Card entre Fases / GRANT UPDATE / evento `MOVED` / chave de posição (**2.14** — Apêndice A da spec);
ciclo de vida e coluna de estado do Card (**2.11**); Formulário de Fase e bloqueio de transição (**2.15**);
Histórico read-side — ler `CardHistory` no painel (**2.17**); acesso/Responsável/concessões de Card (**2.10**);
saúde temporal/marcos (**2.12/2.13**); frontend definitivo dos três painéis (Q3 — fatias 2.x foram API interna).

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Completion Notes List
- **Implementação concluída e revisada.** Fatia **API interna somente leitura** sobre `Card`/`Phase` (2.7/2.3): SEM migration, SEM GRANT novo. `KanbanReadService` (`verKanban`/`verColunaCards`/`verCard`) + `KanbanController` (3 rotas GET), reusando `resolverPoderNoPipe` (404 não-enumerante; VIEWER lê). Paginação por cursor determinístico `[createdAt, id]`; contagem por `groupBy` (sem N+1); teto de página 100; `valores` só no detalhe; `orgId` fora da fronteira.
- **Resolução do dono (Q1–Q7)** aplicada: leitura; ordem `createdAt`+`id`; API interna; "estado"=Fase; capacidades no payload; paginado; histórico só estruturado (2.17). Divergência "2.9=movimentação" (brief/comentário da migration 2.7) resolvida a favor do `epics.md` autoritativo (movimentação = 2.14); design de movimentação preservado no Apêndice A da spec.
- **Revisão de 3 lentes (risco MÉDIO)** — Security (APROVA, limpo), Acceptance e Edge (APROVA COM RESSALVAS): **nenhum bug de correção**; todas as ressalvas eram lacunas de teste, **fechadas com prova de fase-vermelha** (empate de `createdAt`, borda de página exata, entradas inválidas→400, capacidades do Viewer no detalhe, Kanban vazio, cursor cross-org). Nota de performance de índice (P1) **deferida** por respeitar o "sem migration". Detalhe em `gates/2-9/review.md`.
- **Gates:** typecheck/format/lint/build verdes; suíte cheia **466 testes** (2.9: http 9, authz 4, rls 4 = 17), série contra PostgreSQL real; fase vermelha do portão de acesso provada.

### File List
- `apps/api/src/pipes/cards/kanban-read.service.ts`, `kanban.controller.ts`, `kanban.dto.ts` (novos)
- `apps/api/src/pipes/pipes.module.ts` (registro do controller/serviço)
- `apps/api/test/kanban-http.test.ts`, `kanban-authz.test.ts`, `kanban-rls.test.ts` (novos)
- `specs/2-9-kanban-e-espaco-operacional/` (spec/plan/clarify/checklist/tasks/analyze)
- `_bmad-output/implementation-artifacts/gates/2-9/` (pre-implementation-check/gates/review)
