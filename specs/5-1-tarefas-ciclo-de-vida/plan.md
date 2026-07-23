# Plano — Story 5.1: Tarefas — ciclo de vida e acompanhamento

Consolidação Spec Kit (specify→clarify→plan→tasks→analyze) numa passagem, evidência preservada.

## Clarify — ambiguidades materiais resolvidas (sem escalar; decisões registradas)

1. **Mecanismo temporal do Evento "Tarefa atrasada" (gate §1535).** Resolvido pelo padrão Postgres-based do
   motor 4.6 (zero-dependência, AD-32), sem infra externa. `Task.dueVersion` (Int monotônico) é a "versão do
   prazo"; a ocorrência é `TaskOverdueOccurrence` append-only com `@@unique([orgId,taskId,dueVersion])`; o scan
   é um `INSERT … SELECT … ON CONFLICT DO NOTHING` idempotente sob RLS. Decisão completa:
   `decisions/task-overdue-mechanism-5-1.md`. Driver contínuo deferido (`DEB-5-1-OVERDUE-DRIVER`).
2. **Modelo do Responsável.** Coluna `responsavelMembershipId` (referência-por-id, SEM FK) — FK composta a
   Membership é inviável (SetNull impossível com `orgId` NOT NULL; Cascade quebraria LGPD/exclusão de Conta;
   Restrict a bloquearia). Tenant-safety pela revalidação sob RLS no assign-time + derivação read-time +
   reconciliação E8. `CardResponsavel` da base também usa FK simples. (AUTONOMOUS_DECISION registrada no spec.)
3. **Reatribuição na suspensão/remoção (§1525).** Estende o contrato puro `membership-contract.ts` com
   `taskResponsavelDe`/`removerTaskResponsavelDe` e o consome nas 8.5/8.6 (esvazia `responsavelMembershipId` na
   mesma tx; auditado no payload do `MembershipEvent`, sem acoplar `TaskHistory` ao E8 — mesmo padrão do
   `CardResponsavel`). E8 já existe (≠ 2.10, que deferiu por não haver consumidor).
4. **`atrasada`.** Derivado na leitura (`task-overdue.core.ts`), nunca persistido — espelha a saúde 2.13.
5. **Timezone.** `dueAt @db.Timestamptz` (instante absoluto) → comparação determinística, "fuso oficial" por
   construção (DIV-1, como `CardPhaseEntry.enteredAt`).

## Arquitetura da entrega

- **Módulo novo** `apps/api/src/tasks/` (entidade distinta; reusa a autz por Pipe importando as funções PURAS
  de `pipe-authz` — sem importar `PipesModule`, sem ciclo). Registrado em `app.module.ts`.
- **Núcleos puros:** `task-lifecycle.transitions.ts` (2 eixos), `task-overdue.core.ts` (derivação).
- **Serviços:** `TasksService` (criar/editar/Responsável/vínculo/concluir/reabrir/arquivar/restaurar),
  `TasksReadService` (listar/obter + `atrasada` + `responsavelValido`), `TaskOverdueService` (scan idempotente).
- **Controller** `TasksController` (rotas `pipes/:pipeId/tasks` e `tasks/:taskId`, todas `@Requer('ler','Pipe')`).
- **Migration** `20260730120000_tasks` (+ rollback): 3 tabelas RLS ENABLE+FORCE + WITH CHECK, GRANT column-scoped
  (Task) / append-only (History/Occurrence), FK compostas tenant-safe, índice único aditivo `Card(orgId,id)`.
- **Auditoria:** `Task`/`TaskHistory`/`TaskOverdueOccurrence` em `MODELOS_AUDITADOS`.
- **E8:** `membership-contract.ts` + `membership-state.service.ts` + `membership-removal.service.ts`.

## Padrões reusados (não reinventados)

- Ciclo de vida atômico + guarda otimista + evento na mesma tx interativa (client raiz, `definirContextoOrg`):
  de `card-lifecycle.service.ts`.
- Derivação pura na leitura: de `card-health.core.ts`.
- Claim/idempotência Postgres-based: de `automation-engine.service.ts` (adaptado — ocorrência idempotente por
  índice único, sem lease, porque a emissão é um INSERT append-only).
- Contrato de reatribuição: de `membership-contract.ts` consumido por 8.5/8.6.
- RLS/GRANT/FK-composta/partial-index: das migrations 4.x / 2.10.
- Autz fina por Pipe: `pipe-authz.ts` (`exigirOperarPipe`/`resolverPoderNoPipe`), C3 congelado.
