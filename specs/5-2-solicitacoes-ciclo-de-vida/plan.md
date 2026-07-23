# Plan — Story 5.2: Solicitações

Twin da 5.1 sem eixo temporal. Reuso máximo dos padrões existentes; menor mudança correta.

## Artefatos a criar/alterar

### Migration `apps/api/prisma/migrations/20260731120000_solicitacoes/migration.sql` (+ rollback)
- Enums `SolicitacaoLifecycleState { ABERTA, RESOLVIDA }`, `SolicitacaoArchiveState { ATIVA, ARQUIVADA }`.
- Tabelas `Solicitacao`, `SolicitacaoHistory` (espelho de Task/TaskHistory, sem colunas temporais).
- `@@unique([orgId,id])` em `Solicitacao` (destino da FK composta do History). **Não** cria índice em
  `Card`/`Pipe` (já existem: `Card_orgId_id_key` da 5.1; `Pipe` par da 4.1).
- Índices: `[orgId,pipeId,lifecycleState]`, `[orgId,responsavelMembershipId]`, `[orgId,cardId]`;
  History `[orgId,solicitacaoId,createdAt]`.
- FKs compostas tenant-safe: `(orgId,pipeId)→Pipe`, `(orgId,cardId)→Card` (Cascade), `orgId→Organization`;
  History `(orgId,solicitacaoId)→Solicitacao`, `orgId→Organization`.
- RLS ENABLE+FORCE; policies select/insert/update/delete; WITH CHECK INSERT+UPDATE.
- GRANT: `Solicitacao` SELECT/INSERT + UPDATE column-scoped (sem orgId/pipeId/creator; sem DELETE);
  `SolicitacaoHistory` SELECT/INSERT.
- Rollback `prisma/rollback/20260731120000_solicitacoes.down.sql`: DROP tables + types; **NÃO** dropar
  `Card_orgId_id_key` (é da 5.1).

### Schema `apps/api/prisma/schema.prisma`
- Enums + models `Solicitacao`/`SolicitacaoHistory` (após os models de Task).
- Backrefs: `Organization.solicitacoes`/`solicitacaoHistories`; `Pipe.solicitacoes`; `Card.solicitacoes`.

### Módulo `apps/api/src/solicitacoes/`
- `solicitacao-lifecycle.transitions.ts` — núcleo puro (resolver/reabrir, arquivar/restaurar, podeEscrever).
- `solicitacoes.dto.ts` — parse manual (criar/editar/responsavel/vinculoCard/validarIdRota).
- `solicitacoes.service.ts` — criar/editar/atribuirResponsavel/vincularCard/resolver/reabrir/arquivar/
  restaurar; tx interativa raiz + `definirContextoOrg`; guarda otimista; auditoria manual.
- `solicitacoes-read.service.ts` — listar/obter; `resolverPoderNoPipe`; `responsavelValido` (sem `atrasada`).
- `solicitacoes.controller.ts` — rotas `pipes/:pipeId/solicitacoes` + `solicitacoes/:id/...`.
- `files/solicitacao-files.controller.ts` — anexos `solicitacoes/:id/files`.
- `solicitacoes.module.ts` — controllers + services (sem overdue). Registrar em `app.module.ts`.

### Wiring transversal
- `kernel/db/tenant-context.ts`: `MODELOS_AUDITADOS` += `Solicitacao`, `SolicitacaoHistory`.
- `file-authz/file-authz.dispatcher.ts`: `RESOURCE_REQUEST='SOLICITACAO'` + branch (herda do Pipe;
  `exigirSolicitacaoMutavel`).
- `file-authz/file-event.dispatcher.ts`: branch `SOLICITACAO` → `solicitacaoHistory`.
- `pipes/cards/access/membership-contract.ts`: `AlteracaoEntrada.requestResponsavelDe?`,
  `AlteracaoPlano.removerRequestResponsavelDe`, incluir em `reatribuir`.
- `organizations/members/membership-state.service.ts` + `membership-removal.service.ts`: consultar/esvaziar
  `solicitacao` por Responsável; `removedRequestResponsavelDe` no Visao + payload + auditoria.

## Testes
- `solicitacao-lifecycle-transitions.test.ts` (unidade).
- `solicitacoes-rls.test.ts` (RLS/GRANT fase vermelha).
- `solicitacoes-http.test.ts` (ciclo/Responsável/autz/cross-tenant/vínculo).
- `solicitacoes-files-http.test.ts` (anexos herdados/gate/arquivamento).
- Estender `membership-removal-http.test.ts` e `membership-state-http.test.ts` (esvaziar Responsável de
  Solicitação); manter os testes E8 existentes verdes.

## Gates (risco ALTO)
prettier/lint/typecheck/build; `db:migrate` + rollback drill; `pnpm --filter @giraffe/api test` (PG real);
regressão E8 e da 5.1 (toques aditivos).
