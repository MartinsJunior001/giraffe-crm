# Tasks — Story 2.5: Ciclo de vida e evolução segura de Campos

> Fonte: `spec.md` + `clarify.md` + `plan.md`. Risco ALTO. **Sem migration** (Opção A). Ordem red→green→mutação.

## Phase 1 — `typeConfig` puro (unidade, vermelho→verde)
- [ ] **T001** `apps/api/src/pipes/forms/option-config.ts`: `lerOpcoes`/`serializarOpcoes`/allowlist de chaves +
  limites. Fail-closed a escrita; leitura tolera opção legada sem `state` (→ ACTIVE). [inv 1-9]
- [ ] **T002** `apps/api/test/option-config.test.ts`: id duplicado recusa · label vazio recusa · chave extra
  recusa · malformado recusa · renomear preserva id · reordenar reindexa sem alterar valor · limites. [inv]

## Phase 2 — serviço + DTO + rotas
- [ ] **T003** `apps/api/src/pipes/forms/fields.dto.ts`: `parseEditarCampo` (label/help/defaultValue; **rejeita**
  `type`/`options`/`typeConfig` cru), `parseOpcaoLabel`, `parseReordenarOpcao`, `validarIdRota` reuso. DTO manual.
- [ ] **T004** `apps/api/src/pipes/forms/fields.service.ts`: `FieldsService` — editar/arquivar/restaurar +
  add/rename/reorder/archive/remove opção. Reusa `pipe-authz`, resolução por `phase.pipeId`, `withTenantContext`.
  Idempotência sem `updateMany` no caminho já-no-estado. [AC1-6]
- [ ] **T005** Estender `FormsController` (ou `FieldsController` no mesmo módulo) com as rotas PATCH/POST →
  **200**; registrar o serviço no módulo. `@Requer('ler','Pipe')`; a fina no serviço.

## Phase 3 — verde (HTTP + authz + RLS, PostgreSQL real)
- [ ] **T006** `apps/api/test/fields-http.test.ts`: editar (não `type`), arquivar/restaurar idempotente, ciclo de
  opções, identidade estável, ordem determinística, 400/404. [SC-251..256]
- [ ] **T007** `apps/api/test/fields-authz.test.ts`: Admin Org / Admin Pipe (inicial e **de Fase**) / MEMBER-VIEWER
  403 / sem acesso 404 / Membership SUSPENDED negada. [SC-257-258]
- [ ] **T008** `apps/api/test/fields-rls.test.ts`: outra Org não vê/edita; UPDATE sem contexto negado; GRANT sem
  DELETE; INV-FORM-01 sob evolução (RN-054); remover opção = UPDATE. [SC-259]

## Phase 4 — mutação + gates
- [ ] **T009** Mutações que devem devolver o vermelho: id duplicado aceito · label no lugar do id · validação do
  `typeConfig` removida · propriedade desconhecida aceita. Documentar no teste.
- [ ] **T010** Gates: context7-check, security-check, observability-check, lgpd-check, performance-check;
  migration-check N/A registrado. Suíte cheia verde. Sem regressão 2.1-2.4.
- [ ] **T011** `commit-check` → `commit` → PR contra `main` → CI verde → merge → closure (sprint-status via workflow).

## Fora de escopo (não-objetivos rastreáveis)
Mudança de `type`; travas obrigatório/requisito/marco; "após uso só arquivar"; publicação (2.6);
submissão/valores/Card (2.7+); Database (E3); exclusão definitiva; validação programável. Nenhum materializa
tabela/coluna (AD-11).
