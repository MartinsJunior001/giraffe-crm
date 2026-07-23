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
| Anexos via 3.7 (AD-28) | contrato futuro parcial — ver "Recorte" abaixo | ◑ |
| Autz Org + papel efetivo no Pipe; deny-by-default; não enumera | `pipe-authz` (`exigirOperarPipe`/`resolverPoderNoPipe`) | ✔ |
| Histórico append-only (todos os eventos) | `TaskHistory` + evento por mutação | ✔ |

## Recorte / débitos (sem antecipar escopo)

- **Anexos 3.7 (`resourceType='TASK'`):** a 5.1 estabelece o modelo e a autz; a INTEGRAÇÃO plena de anexos
  (dispatcher `file-authz` roteando `TASK`, eventos `FILE_ATTACHED/REMOVED` no `TaskHistory`) fica como
  **`DEB-5-1-TASK-ANEXOS-37`** — o gate AD-28 (`FILE_UPLOAD_ENABLED`) já barra a capacidade quando desligada,
  e não há consumidor de UI de anexo de Tarefa na 5.1 (AD-11). Os eventos `FILE_ATTACHED/FILE_REMOVED` já estão
  no vocabulário do `TaskHistory` para o consumo futuro. **Registrado para a Lane 0 avaliar** se entra nesta
  Story ou numa dedicada.
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
