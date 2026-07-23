# Tasks — Story 5.2: Solicitações

Ordem por dependência. `[x]` concluída ao término da implementação.

1. [x] Schema + migration + rollback (`Solicitacao`/`SolicitacaoHistory`, enums, RLS, GRANT, FK compostas).
2. [x] `MODELOS_AUDITADOS` += Solicitacao/SolicitacaoHistory.
3. [x] Núcleo puro `solicitacao-lifecycle.transitions.ts` + teste de unidade.
4. [x] DTOs de parse manual.
5. [x] `SolicitacoesService` (CRUD/ciclo/Responsável/vínculo, tx raiz, guarda otimista, auditoria).
6. [x] `SolicitacoesReadService` (listar/obter, autz leitura, responsavelValido).
7. [x] `SolicitacoesController` (rotas internas) + `SolicitacaoFilesController` (anexos).
8. [x] `SolicitacoesModule` + registro em `app.module.ts`.
9. [x] Wiring de anexos: dispatcher de autz (branch SOLICITACAO) + event dispatcher (SolicitacaoHistory).
10. [x] Contrato E8: estender `membership-contract.ts` (aditivo) + `membership-state`/`membership-removal`.
11. [x] Testes: `solicitacoes-rls`, `solicitacoes-http`, `solicitacoes-files-http`; estender E8 http.
12. [x] Gates: prettier/lint/typecheck/build; migrate + rollback drill; suíte PG real.
