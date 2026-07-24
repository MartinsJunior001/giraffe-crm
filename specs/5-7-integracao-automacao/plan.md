# Plano de implementação — Story 5.7

## Clarify (resolvido pelas fontes; sem ambiguidade material que exija o dono)

- **"Reusar o motor E4"** — os handlers de E5 são **executores** do mesmo `AutomationEngineService`
  (`executarAcao`), sob o `PrincipalAutomacao` (4.5), gravando na trilha `AutomationExecution`/
  `AutomationActionResult` (4.8). Nada de segundo motor. Os Eventos de E5 vão para o mesmo outbox
  `DomainEvent` via `emitirEventoDeDominio`, drenados pelo mesmo `enfileirarParaEvento`/`drenarOrg`.
- **Quais Eventos emitir onde** — nos pontos de mutação de 5.1/5.2 (`TasksService`/`SolicitacoesService`),
  same-tx com o evento de histórico; `TASK_OVERDUE` no `TaskOverdueService`, same-tx com a ocorrência.
- **Idempotência das Ações via o motor** — dupla: (a) dedup por Ação do motor (`AutomationActionResult`
  `@@unique(executionId, actionIndex)` — não reexecuta Ação com resultado); (b) chave determinística no BANCO
  (`Task/Solicitacao.idempotencyKey = auto:<execId>:<actionIdx>`), fecha a janela crash-após-commit-antes-de-
  gravar-resultado (espelha `criarRegistro` de 4.6). `NOTIFICATION_SEND` é idempotente por `sourceEventId`
  determinístico (5.6 dedupe).
- **AUTONOMOUS_DECISION** — o alvo de `TASK_CREATE`/`REQUEST_CREATE` é um **Pipe** (novo domínio de Ação
  `PIPE`), resolvido por 1 ref `PIPE` (determinístico, na allowlist do principal). O alvo de
  `NOTIFICATION_SEND` é o **recurso primário do Evento** (novo domínio `NOTIFICATION`; card XOR task XOR
  request), contido ao Pipe proprietário. RATIONALE: menor mudança correta que reusa `revalidarAcao`/principal
  sem inventar autorização; SCOPE_IMPACT: NONE; REVERSIBILITY: HIGH.

## Arquivos alterados/criados

### Migration (necessária)
1. `apps/api/prisma/schema.prisma` — `Task.idempotencyKey String?` + `@@unique([orgId, pipeId,
   idempotencyKey])`; idem `Solicitacao`. (Sem GRANT novo.)
2. `apps/api/prisma/migrations/<ts>_task_request_idempotency/migration.sql` — `ALTER TABLE ADD COLUMN` + 2
   `CREATE UNIQUE INDEX`. Rollback drill provado.

### Catálogo de Eventos (4.3)
3. `apps/api/src/domain-events/event-catalog.ts` — mover Task/Solicitação para `EVENTOS_NUCLEO` (CORE,
   selecionáveis), `resourceType` `'TASK'`/`'REQUEST'` (estender a union); remover `TASK_*` de
   `EVENTOS_EXTENSAO` (mantém `EMAIL_SENT`/`EMAIL_RECEIVED`).

### Contrato 4.9 (preencher os slots)
4. `apps/api/src/pipes/automations/actions/action-extension-contract.ts` — remover `TASK_CREATE`/
   `REQUEST_CREATE`/`NOTIFICATION_SEND` de `TIPOS_ACAO_EXTENSAO` (ficam `EMAIL_SEND`/`AI_ACTION`); novos
   `ExecutorKind` (`CRIAR_TAREFA`/`CRIAR_SOLICITACAO`/`ENVIAR_NOTIFICACAO`) e `EVENTO_GERADO_TASK_CREATE`/
   `_REQUEST_CREATE`; entradas em `AUMENTO_NUCLEO`. Atualizar a narrativa (E5 agora é CORE).

### Núcleo puro (4.5)
5. `apps/api/src/pipes/automations/actions/action-catalog.ts` — `AcaoDominio` += `'PIPE'|'NOTIFICATION'`;
   `TipoRefAcao` += `'PIPE'`; 3 entradas de catálogo (validadores fail-closed com allowlist de parâmetros);
   `PIPE_ATIVO`.
6. `apps/api/src/pipes/automations/actions/action-revalidation.core.ts` — `ContextoEvento` += `taskId`/
   `requestId`; `resolverAlvoDeterministico` (PIPE ref; recurso primário único p/ NOTIFICATION);
   `dentroDoEscopo` (PIPE→allowlist; NOTIFICATION→pipe do recurso == principal.pipeId).

### Motor (4.6) — executores + wiring
7. `apps/api/src/pipes/automations/engine/action-executors.ts` — `montarAlvoSnapshot` p/ PIPE/NOTIFICATION
   (recebe o `ContextoEvento`); dispatch de `TASK_CREATE`/`REQUEST_CREATE`/`NOTIFICATION_SEND`; funções
   `criarTarefa`/`criarSolicitacao`/`enviarNotificacao` (reusam o PADRÃO 5.1/5.2 + `distribuir` 5.6).
   `ExecContext` += `distribuicao`.
8. `apps/api/src/pipes/automations/engine/automation-engine.service.ts` — injeta
   `NotificationDistributionService`; passa em `ExecContext`.
9. `apps/api/src/pipes/automations/engine/snapshot-builder.ts` — `resourceType` `'TASK'`/`'REQUEST'` →
   `ContextoEvento` com `taskId`/`requestId` (contido ao Pipe proprietário, M-1).

### Emissão de Eventos nos pontos de mutação (5.1/5.2)
10. `apps/api/src/tasks/tasks.service.ts` — emitir `TASK_*` same-tx (criar/concluir/reabrir/arquivar/
    restaurar/Responsável).
11. `apps/api/src/solicitacoes/solicitacoes.service.ts` — emitir `REQUEST_*` same-tx.
12. `apps/api/src/tasks/task-overdue.service.ts` — emitir `TASK_OVERDUE` same-tx com a ocorrência (tx
    interativa; RETURNING inclui `pipeId`).

## Testes (proporcionais ao risco ALTO)

- **Puros** (sem DB): `action-extension-contract` (E5 CORE, executores, eventos produzidos, bijeção);
  `action-revalidation.core` (resolução de alvo PIPE/NOTIFICATION; escopo; **não-ampliação** por capacidade);
  `action-catalog` (validadores das 3 Ações).
- **Integração real** (PG): E5 actions executam (Tarefa/Solicitação criadas, idempotentes em retry;
  Notificação distribuída); não-ampliação (capacidade ausente/pipe fora do escopo → `DENIED`); ref fora da
  Org → `NAO_ENCONTRADO`; Eventos emitidos nos pontos certos same-tx; `TASK_OVERDUE` via o scan; consome o
  motor (Execução+Trilha existentes). Regressão E4 (4.5-4.9) + E5 (5.1-5.6) verde.
- **Migration + rollback drill.**

## Gates

prettier --check + lint + typecheck + build; `pnpm --filter @giraffe/api test` (PG real, porta 5439);
migration+rollback drill. Corrigir todos BLOCKER/HIGH antes do PR.

## context7-check

Sem nova biblioteca/SDK/API externa: a Story reusa Prisma 6.19.3 e NestJS 11 já na stack, com os MESMOS
padrões já validados (tx interativa + `definirContextoOrg`, `@@unique` nullable para idempotência, raw
`$queryRaw` com `RETURNING`). Nenhuma assinatura nova de API externa é introduzida. Baseline: `package.json`/
lockfile do repo. Sem divergência a escalar.
