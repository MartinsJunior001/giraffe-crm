# Analyze — consistência cross-artefato (Story 5.1)

Análise não-destrutiva entre `spec.md`, `plan.md`, `tasks.md`, a implementação e o `epics.md §1514–1538`.

## Cobertura dos requisitos (§1518–1527)

| Requisito da spec | Implementação | OK |
|---|---|---|
| Pertencimento 1 Pipe + 0..1 Card mesmo Pipe/Org; não funde/amplia | `Task.pipeId`/`cardId` (FK composta); `validarCardDoPipe`; leitura não expõe conteúdo do Card | ✔ |
| Ciclo: criar/editar/Responsável/concluir/reabrir/arquivar/restaurar | `TasksService` + núcleo puro (2 eixos) | ✔ |
| Estados `aberta`/`concluída`; arquivamento SEPARADO; nasce aberta | `TaskLifecycleState` × `TaskArchiveState` | ✔ |
| Arquivada bloqueia escrita, mantém leitura; restaurar preserva tudo | `podeEscrever` + 409 `TAREFA_ARQUIVADA`; restaurar preserva por construção | ✔ |
| Sem exclusão definitiva | GRANT sem DELETE (Task); provado | ✔ |
| `atrasada` derivada (fuso oficial); concluída não; alterar prazo recalcula | `derivarAtrasada` puro; `dueAt` Timestamptz; leitura recomputa | ✔ |
| Responsável = 0..1 Membership ativa; nunca ref. inválida silenciosa; E8 | coluna + validação assign-time + `responsavelValido` + reconciliação E8 | ✔ |
| Evento "Tarefa atrasada" idempotente por (taskId, versão do prazo) | `TaskOverdueOccurrence` + scan idempotente; `dueVersion` | ✔ |
| Anexos via 3.7/3.8 (AD-28) | wiring TASK no dispatcher de autz + event-sink + rota `tasks/:taskId/files` | ✔ |
| Autz Org + papel efetivo no Pipe; deny-by-default; não enumera | `pipe-authz` (`exigirOperarPipe`/`resolverPoderNoPipe`) | ✔ |
| Histórico append-only (todos os eventos) | `TaskHistory` + evento por mutação | ✔ |

## Recorte / débitos (sem antecipar escopo)

- **Anexos 3.7/3.8 (`resourceType='TASK'`) — ENTREGUE (fecha `DEB-5-1-TASK-ANEXOS-37`):** após o finding HIGH
  do QA (o wiring estava ausente e a `spec.md §8` o havia colocado em escopo), o anexo de Tarefa foi ligado
  pelo MESMO padrão aditivo do Card (3.8): branch `TASK` no `FileAuthzDispatcher` (autz herdada do Pipe;
  read-only sob arquivamento → 409) e no `FileEventDispatcher` (`FILE_ATTACHED/REMOVED` no `TaskHistory`), e o
  controller `tasks/:taskId/files`. Sem migration, sem GRANT novo, sem alterar o contrato de `files/`. Provado
  em `tasks-files-http` (happy path, herança de autz, evento, read-only sob arquivamento, gate AD-28,
  cross-tenant); regressão de Card/Registro/avatar verde.
- **`DEB-5-1-OVERDUE-DRIVER`:** driver contínuo multi-réplica do scan (loop/intervalo por env), como o
  `DEB-4-6-DRIVER-CONTINUO`. A 5.1 entrega o mecanismo INVOCÁVEL e idempotente.
- **Não antecipado (fora de escopo, correto):** Notificações (5.3+), registro no motor E4 (5.7), Solicitações
  (5.2). A ocorrência canônica é o contrato que a 5.7 consumirá.

## Consistência com invariantes

- `Task ≠ Card ≠ Registro`: entidade e módulo próprios, sem reusar entidades de Card/Registro. ✔
- Isolamento pelo banco (RLS+FORCE+WITH CHECK, GRANT fronteira), `orgId` sempre server-side. ✔
- C3 (`ability.ts`) congelado; autz fina no serviço (DBT-AUTHZ-01). ✔
- `DEB-TENANT-COMPOSITE-FK-RETROFIT` avançado parcialmente (Card ganhou `@@unique([orgId,id])`). ✔

## Divergências resolvidas

- **Responsável sem FK composta** (vs. instrução literal): justificado por inviabilidade técnica (SetNull/
  Cascade/Restrict) + precedente `CardResponsavel` + equivalência de tenant-safety via revalidação RLS.
  Registrado no `spec.md` e neste analyze — **ponto de auditoria para a Lane 0/QA**.
