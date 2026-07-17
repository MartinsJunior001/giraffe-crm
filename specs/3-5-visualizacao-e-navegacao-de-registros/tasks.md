# Tasks — Story 3.5

- **T001 — Gate pré-código.** context7-check (feito — `research.md`) + pre-implementation-check. `gates/3-5/T001`.
- **T002 — `record-query.core.ts` (puro).** Valida query (filtros/orderBy) contra os Campos da definição
  (allowlist `Field.id` + operadores por tipo); coage/valida valor por tipo; rejeita filtro de Arquivo (gated);
  devolve plano estruturado. Erro tipado → 400. Unidade.
- **T003 — `records-read.service.ts`.** `exigirLerDatabase`; resolve Campos ativos (allowlist + colunas); monta
  `Prisma.sql` parametrizado (WHERE + ORDER BY coerção + LIMIT/OFFSET); roda por `$transaction([...definirContextoOrg,
  $queryRaw(linhas), $queryRaw(total)])`; projeta `RecordLinhaVisao` (+`podeEditar`); `RecordPaginaVisao`.
- **T004 — `records-query.dto.ts`.** Parse manual de take(≤100)/skip/orderBy/dir/filtros[]/incluirArquivados.
- **T005 — Controller.** `GET /databases/:databaseId/records` → 200. `@Requer('ler','Database')`. Coexiste com
  `.../records/:recordId`.
- **T006 — Fiação.** `RecordsReadService` em `DatabasesModule`.
- **T007 — `records-read-rls.test.ts`.** Cross-tenant/cross-database invisível na listagem; contagem escopada;
  sem GRANT novo (só SELECT).
- **T008 — `records-read-http.test.ts`.** AC1–AC7.
- **T009 — `record-query.core.test.ts`.** Allowlist por tipo; fail-closed (Campo/operador/valor inválido; filtro
  de Arquivo rejeitado).
- **T010 — Regressão.** 3.4 (records-http/rls) verde.
- **T011 — CLAUDE.md** bloco de estado 3.5.
- **T012 — Revisão adversarial CRÍTICA** (Segurança/Arquitetura-RLS/Edge/Aceite) — injeção/RLS com prova.
- **T013 — commit-check → PR → CI → merge → closure BMAD.**
