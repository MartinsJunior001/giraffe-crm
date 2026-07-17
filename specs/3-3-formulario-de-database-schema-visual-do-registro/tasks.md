# Tasks — Story 3.3

- **T001** — Gate pré-código: `context7-check` (Prisma 6.19.x ALTER/CHECK/índice parcial; NestJS 11 module
  exports) + `pre-implementation-check`. → `gates/3-3/T001-pre-code-gate.md`.
- **T002** — Migration `..._database_forms`: coluna `Form.databaseId` + FK Cascade; DROP+ADD `Form_context_owner_ck`
  (3 cláusulas); `Form_database_uq` (parcial, `WHERE context='DATABASE'`); `@@index([orgId, databaseId])`. Rollback
  cirúrgico `rollback/..._database_forms.down.sql`.
- **T003** — Schema Prisma: `Form.databaseId`, `Database.forms Form[]`, `@@index([orgId, databaseId])`. Regenerar.
- **T004** — `form-locate.ts`: `AlvoFormulario.databaseId?`; `resolverContexto`→DATABASE; `acharForm` filtra;
  `SELECT_FORM` inclui `databaseId`.
- **T005** — `form-authz.ts` (novo, em `pipes/forms/`): `exigirGerenciarForm`/`resolverPoderNoForm` roteando por
  `alvo.databaseId ? database-authz : pipe-authz`. Substituir chamadas diretas nos 3 serviços.
- **T006** — `FormsService`/`FieldsService`/`FormPublicationService`: aceitam alvo com `databaseId`, usam T005.
- **T007** — Controllers `databases/forms/`: montagem+evolução+publicação sob `databases/:databaseId/form...`,
  `@Requer('ler','Database')`. Status 201 (criar Campo) / 200 (demais).
- **T008** — Módulos: `PipesModule` exporta os 3 serviços; `DatabasesModule` importa `PipesModule` + controllers.
- **T009** — `database-forms-rls.test.ts` (PostgreSQL real): isolamento, CHECK de owner (fase vermelha),
  FormVersion sem UPDATE/DELETE, owner cross-database invisível.
- **T010** — `database-forms-http.test.ts`: AC1–AC7 pela porta real (contas descartáveis Org C).
- **T011** — Regressão E2: suíte de 2.4/2.5/2.6/2.15 verde.
- **T012** — SC-206 (deploy → rollback → reapply) em PostgreSQL descartável.
- **T013** — `CLAUDE.md` (bloco de estado 3.3).
- **T014** — Revisão adversarial CRÍTICA (Segurança; Arquitetura/RLS; Edge Cases; Aceite); CRITICAL/HIGH com
  regressão + mutação.
- **T015** — `commit-check` → commit(s) → PR → CI → merge → closure BMAD.
