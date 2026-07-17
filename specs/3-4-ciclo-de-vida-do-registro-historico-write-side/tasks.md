# Tasks — Story 3.4

Detalhamento operacional das tasks do story file (T001–T016). Ordem em `plan.md`.

- **T001 — Gate pré-código.** `context7-check` (feito — `research.md`) + `pre-implementation-check`. Registrar em
  `gates/3-4/T001-pre-code-gate.md`.
- **T002 — Migration `_records`.** 2 enums + 2 tabelas + FKs Cascade + RLS ENABLE+FORCE + 4 policies (WITH CHECK
  INSERT/UPDATE) por tabela + GRANTs (Record: SELECT/INSERT + UPDATE colunas `lifecycleState,valores,updatedAt`,
  sem DELETE; RecordHistory: SELECT/INSERT) + índice único `[orgId,databaseId,idempotencyKey]` + `@@index`.
  Rollback cirúrgico (drop tabelas na ordem FK + drop enums).
- **T003 — Schema Prisma.** Modelos + enums + back-relations (Database/Form/FormVersion/Organization). Índice
  único de idempotência em raw SQL (não no schema). Regenerar. `MODELOS_AUDITADOS` += Record/RecordHistory.
- **T004 — `exigirOperarDatabase`.** Em `database-authz.ts`: poder ∈ {gerenciar, operar} → ok; ler → 403; sem
  acesso → 404. Espelho de `exigirOperarPipe`.
- **T005 — `RecordsService.criar`.** Resolve FormVersion publicada; valida via `submission.ts`; tx interativa
  raiz (`definirContextoOrg`): INSERT Record + INSERT RecordHistory(CREATED). Idempotência P2002/P2028 →
  existente/409. idempotencyKey obrigatória (400 ausente).
- **T006 — `RecordsService.editarValores`.** Revalida contra `formVersionId` do Registro; UPDATE `valores`;
  evento VALUES_UPDATED. Bloqueio sob Record/Database arquivado (409). Guarda otimista (valores só sob ATIVO).
- **T007 — `record-lifecycle`.** Núcleo puro (planejarArquivamento/Restauracao; 2 estados; idempotente;
  transição inválida→erro). Serviço com guarda otimista `updateMany where lifecycleState=<lido>`→409; evento na
  mesma tx; no-op sem updateMany. Bloqueio sob Database arquivado.
- **T008 — Controllers.** `records.controller.ts` sob `databases/:databaseId`; POST(201/200 idempotente)/GET/
  PATCH/archive/restore. `@Requer('ler','Database')`.
- **T009 — Módulo.** `records.module.ts` (ou em DatabasesModule); import de PipesModule; `submission.ts` puro.
- **T010 — `records-rls.test.ts`.** Isolamento Org/Database; WITH CHECK (fase vermelha); GRANT column-scoped
  (UPDATE databaseId/formVersionId/orgId → permission denied; sem DELETE); idempotência (P2002); RecordHistory
  imutável.
- **T011 — `records-http.test.ts`.** AC1–AC7.
- **T012 — Regressão.** Card (2.7/2.8) + Formulário de Database (3.3) verdes.
- **T013 — SC-206.** deploy → rollback → reapply.
- **T014 — CLAUDE.md** bloco de estado 3.4.
- **T015 — Revisão adversarial CRÍTICA** (Segurança/Arquitetura-RLS/Edge/Aceite).
- **T016 — commit-check → PR → CI → merge → closure BMAD.**
