# Plan — Story 3.3

## Ordem de implementação

1. **Migration + schema** (T002/T003): coluna `Form.databaseId`, FK, DROP+ADD do CHECK (3 cláusulas), índice
   único parcial `Form_database_uq`, `@@index([orgId, databaseId])`, back-relation. Rollback cirúrgico. Regenerar
   client. Aplicar em dev + `db:status`.
2. **form-locate** (T004): `AlvoFormulario { pipeId?; phaseId?; databaseId? }`; `resolverContexto` deriva
   DATABASE; `acharForm` filtra `databaseId`; `SELECT_FORM` inclui `databaseId`. Compat total com Pipe/Fase.
3. **Roteamento de autz** (T005): helper `form-authz.ts` (em `pipes/forms/`) com
   `exigirGerenciarForm(db, contexto, alvo)` e `resolverPoderNoForm(db, contexto, alvo)` que roteiam por
   `alvo.databaseId ? database-authz : pipe-authz`. Substituir as chamadas diretas nos 3 serviços por esse helper.
4. **Serviços do builder** (T006): `FormsService`/`FieldsService`/`FormPublicationService` passam a aceitar
   `databaseId` no alvo e a usar o roteamento. Nenhuma outra mudança de comportamento.
5. **Controllers Database** (T007): `databases/forms/database-forms.controller.ts` (montagem+evolução),
   `database-form-publication.controller.ts` (publicação) — reusam os serviços com `{ databaseId }`.
6. **Módulos** (T008): `PipesModule` exporta os 3 serviços; `DatabasesModule` importa `PipesModule` e declara os
   controllers novos.
7. **Testes** (T009/T010/T011): RLS, HTTP e regressão de E2.
8. **SC-206** (T012), **CLAUDE.md** (T013), **revisão** (T014), **commit-check → PR → CI → merge → closure** (T015).

## Pontos de atenção

- **Não** alterar o comportamento do caminho Pipe/Fase: o roteamento é aditivo (default pipe-authz).
- Publicação usa transação interativa no client raiz (`definirContextoOrg`) — reusar exatamente como 2.6.
- Gate de Arquivo na publicação: `snapshot.ts`/`file-gate.ts` já aplicam `podePublicarComArquivo` — reuso direto.
- Sem ciclo de módulo: `database-authz` é função pura; Databases→Pipes unidirecional.
