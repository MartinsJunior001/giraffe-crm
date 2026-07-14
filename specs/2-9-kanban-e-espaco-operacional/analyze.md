# Analyze — Story 2.9 (consistência cross-artefato; pré-implementação)

Análise **não destrutiva** de consistência entre spec/plan/tasks/checklist e os artefatos autoritativos
(`epics.md`, PRD, ARCHITECTURE-SPINE, schema/migration da 2.7). Como a 2.9 **ainda não foi implementada**, este
documento levanta divergências e riscos a resolver **antes** de codar — não certifica cobertura de critérios.

## Achado crítico (BLOQUEIA implementação)

- **A-0 — Escopo: leitura (epics.md) vs. movimentação (brief + migration 2.7).**
  - `epics.md` Story 2.9 = **superfície de leitura**; AC final: "**nenhuma movimentação é executada aqui**";
    **Fora: movimentação (2.14)**. Dep.: 2.2, 2.7.
  - Brief da tarefa **e** comentários da migration `20260714140000_cards` (linhas 68, 98) dizem "**Mover o Card
    entre Fases (2.9) … são UPDATE**" — atribuindo movimentação + `GRANT UPDATE` à 2.9.
  - **Causa provável:** o `epics.md` foi renumerado após a 2.7 ser escrita (movimentação migrou para 2.14); os
    comentários da migration ficaram desatualizados. Não é contradição do dono, é defasagem de referência.
  - **Resolução:** seguir o **autoritativo** (`epics.md` → leitura). O design de movimentação fica no **Apêndice A**
    da spec, pronto para a 2.14. **Decisão do dono (Q1)** antes de qualquer código. Corrigir os comentários da
    migration 2.7 (de "(2.9)" para "(2.14)") **não** é feito aqui — é edição fora do escopo desta fatia; registrar
    como nota para a 2.14.

## Consistência com invariantes / ADs

- **INV isolamento-mãe:** leitura 100% via `withTenantContext`; nenhum `where orgId` manual; nenhuma rota aceita
  `orgId`. RLS já ativa em `Card`/`Phase`. ✔ (a provar em `kanban-rls`).
- **AD-11 (sem normalização especulativa):** "estado atual" **não** cria coluna de estado — usa a Fase; `valores`
  seguem em JSONB por `Field.id`. ✔
- **AD-6 (sem bypass de RLS):** fatia read-only; runtime **não** ganha `GRANT UPDATE` (guardado por regressão). ✔
- **DBT-AUTHZ-01:** reusa `resolverPoderNoPipe`; guarda fina no serviço; guard/`ability.ts` (C3) intocados. ✔
- **INV-REPORT-01 / NFR-3/4:** leitura no escopo da Org atual e por permissão efetiva; payload de lista enxuto. ✔
- **UX-DR10:** três painéis Contexto|Execução|Ações; "só ações aprovadas"; distinções preservadas (Config. da Fase
  ≠ Execução no Card). O backend expõe capacidades por `poder` para sustentar "só ações aprovadas". ✔ (contrato Q5).

## Riscos / divergências residuais (a decidir com o dono)

- **A-1 — VIEWER lê (contraste com 2.7):** na 2.7 o Viewer recebia 403 na submissão (operar); na 2.9 o Viewer
  **lê** (leitura ≠ operar). O `pipe-authz` já distingue `ler`. Garantir que o teste authz cobra essa diferença e
  que **nenhuma** capacidade operacional vaza para o Viewer.
- **A-2 — "ações permitidas" sem executores prontos:** mover (2.14), ciclo de vida (2.11), Form de Fase (2.15) não
  existem. O contrato de capacidades **prepara** a UI, mas cada ação fica **desabilitada** até sua Story. Risco de
  a UI sugerir ação inexistente — mitigar deixando o executor ausente = ação desabilitada, não oculta-por-erro.
- **A-3 — volume do Kanban (NFR-3/4):** sem paginação, um Pipe com muitos Cards infla o payload. **Gate de
  performance (Q6)** — decidir limite/paginação por Fase antes de implementar.
- **A-4 — Histórico:** UX-DR10 mostra o Histórico "acessível", mas o read-side é **2.17**. A 2.9 só **estrutura** o
  painel; se a UI for entregue (Q3), o painel de Execução exibe placeholder até a 2.17. Registrar para não
  interpretar como bug.
- **A-5 — ordem do Card:** `createdAt` é determinístico para leitura; se o dono quiser drag/reorder, é `position` +
  migration + movimentação (2.14). Q2.

## Cobertura planejada dos ACs (epics.md Story 2.9)

- **AC1** (abre o Pipe → Cards agrupados por Fase, Org atual) → `kanban-http` + `kanban-rls`. Planejado.
- **AC2** (abre o Card → dados, estado atual [=Fase], Fase visível, só ações permitidas) → `kanban-http` +
  contrato de capacidades. Planejado (Q4/Q5).
- **AC3** (Somente leitura → ações não permitidas ocultas/desabilitadas, sem revelar administrativas) →
  `kanban-authz`. Planejado.
- **AC4** (estados honestos; nenhuma movimentação executada) → `kanban-http` (coluna vazia = 200; sem acesso = 404;
  **ausência de rota/efeito de movimentação**) + `kanban-rls` (UPDATE ainda negado). Planejado.

## Regressão esperada
2.1–2.7 intocadas (só adições de leitura). Invariante crítico a **não** regredir: `Card` sem `GRANT UPDATE`
(o `kanban-rls` reafirma `permission denied` em UPDATE, guardando a 2.7).

## Recomendação
Aprovar como **leitura** (Q1), fixar Q2=`createdAt` e Q4="estado=Fase" (mínimos, sem migration), definir Q5
(capacidades) e Q6 (paginação) antes de codar, e decidir Q3 (frontend) — provavelmente API interna nesta fatia,
espelhando as 2.x. Corrigir o comentário da migration 2.7 fica registrado para a 2.14.
