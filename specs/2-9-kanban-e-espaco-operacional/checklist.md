# Checklist — Story 2.9

> Escopo comprometido = leitura (epics.md). Itens marcados `[ ]` são de planejamento; viram `[x]` na implementação
> com evidência de execução real (Constituição X). Itens de decisão do dono ficam explícitos.

## Decisão do dono (bloqueia início)
- [ ] **Q1** — confirmar escopo: 2.9 **leitura** (recomendado, sem migration) vs. reescopar p/ movimentação
      (reescreve `epics.md` pelo workflow oficial e puxa o Apêndice A). **Enquanto Q1 aberta, não implementar.**
- [ ] **Q2** — ordenação do Card na Fase: `createdAt` (sem migration) vs. `position` (migration, só com 2.14).
- [ ] **Q3** — frontend (três painéis) nesta fatia vs. API interna só.
- [ ] **Q4** — "estado atual" = Fase (não há coluna de estado antes de 2.11). Confirmar.
- [ ] **Q5** — shape do contrato de "ações permitidas" (capacidades derivadas do `poder`).
- [ ] **Q6** — volume/paginação do Kanban (gate NFR-3/4).
- [ ] **Q7** — painel de Histórico só estruturado (read-side é 2.17). Confirmar.

## Escopo/limites
- [ ] Sem mudança de schema, migration ou GRANT (fatia read-only). Runtime já tem `SELECT` em `Card`/`Phase`.
- [ ] `Card` **continua sem `GRANT UPDATE`** (invariante da 2.7 preservado; movimentação é 2.14 — Apêndice A).
- [ ] Sem materializar: movimentação (2.14), ciclo de vida/estado (2.11), Formulário de Fase (2.15),
      Histórico read-side (2.17), acesso/Responsável (2.10), saúde/marcos (2.12/2.13).

## Leitura e isolamento
- [ ] Kanban lista Cards **agrupados por Fase**, Fases ativas por `position`; Fase sem Card → coluna vazia.
- [ ] Toda query por `withTenantContext()`; **nenhum** `where orgId` manual; nenhuma rota aceita `orgId` do cliente.
- [ ] Detalhe do Card devolve `valores`, Fase (nome), referência à versão, timestamps; `orgId` **não** cruza a
      fronteira.
- [ ] Payload da **lista** enxuto (sem `valores` por Card na lista) — NFR-3/4.

## Autorização (reuso)
- [ ] `@Requer('ler','Pipe')` (grossa) + `resolverPoderNoPipe` (fina). Sem novo GRANT, sem tocar `ability.ts` (C3).
- [ ] **VIEWER concedido lê** o Kanban/Card (leitura ≠ operar); sem acesso → **404 não-enumerante**.
- [ ] Contrato de capacidades reflete o `poder`; **administrativas nunca reveladas** a quem não as possui.

## Estados honestos
- [ ] Pipe/Card inexistente ou sem acesso → **404 não-enumerante**; Fase vazia → **200** com lista vazia.
- [ ] Nenhuma resposta vaza `orgId`, URL interna, stack ou segredo.

## Prova de isolamento (leitura também se prova)
- [ ] `kanban-rls`: Card/Pipe de outra Org **não** retorna; sem contexto → negado; **UPDATE em `Card` ainda bate em
      `permission denied`** (guarda o invariante read-only da fatia — regressão da 2.7).
- [ ] `kanban-authz`: Admin/Membro/Viewer leem; sem concessão 404; capacidades por `poder`.
- [ ] `kanban-http`: agrupamento por Fase, coluna vazia, detalhe com capacidades, nenhuma movimentação executada.

## Gates
- [ ] typecheck/format/lint/build/testes verdes; suíte 2.1–2.7 **intocada** (só adições de leitura).
- [ ] `pre-implementation-check` (APROVADO) antes de codar; `security-check`/`observability-check` antes de encerrar.
- [ ] `valores` **nunca** em log (sem PII), como na 2.7.
