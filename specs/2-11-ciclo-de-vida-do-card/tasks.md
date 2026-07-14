# Tasks — Story 2.11 (ordem dependente)

1. **Schema + migration** (bloqueante): enum `CardLifecycleState`; colunas em `Card`; `GRANT UPDATE` column-scoped.
   Aplicar `db:migrate`; regenerar client.
2. **Núcleo puro** `card-lifecycle.transitions.ts` (`planejarTransicao`).
3. **Serviço** `card-lifecycle.service.ts` (transação atômica + guarda otimista + evento; `exigirOperarCard`).
4. **Controller** `card-lifecycle.controller.ts` (4 rotas POST → 200) + registro no `pipes.module.ts`.
5. **Leitura**: `lifecycleState` no detalhe (`kanban-read.service`).
6. **Testes**: transitions (unidade), http (integração), rls (column-scope + isolamento).
7. **Gates + governança**: typecheck/lint/prettier/build/suíte; gates/2-11; commit-check → commit → PR → CI →
   merge → closure.
