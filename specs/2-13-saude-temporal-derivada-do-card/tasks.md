# Tasks — Story 2.13 (Saúde temporal derivada do Card)

1. **Núcleo puro** `apps/api/src/pipes/cards/health/card-health.core.ts`:
   `SaudeTemporal`, `IndicadorDominante`, `derivarSaude(marcos, agora)`, `indicadorDominante(lifecycleState, saude)`.
2. **Exposição no detalhe** `apps/api/src/pipes/cards/kanban-read.service.ts` (`verCard`):
   ler a entrada atual (`CardPhaseEntry`), computar `marcos` (reuso 2.12), derivar `saude` + `indicadorDominante`,
   adicioná-los a `CardDetalheVisao.card`.
3. **Testes:** `test/card-health-core.test.ts` (unidade) e `test/card-health-http.test.ts` (detalhe HTTP, banco real).
4. **Gates:** typecheck, format, lint, build, suíte cheia; revisão 4 lentes; `pre-implementation-check`/`gates`/`review`.
5. **Governança:** commit-check → commit → PR → CI → merge → closure (sprint-status 2-13→done + CLAUDE.md).

Sem migration, sem GRANT, sem alteração de schema.
