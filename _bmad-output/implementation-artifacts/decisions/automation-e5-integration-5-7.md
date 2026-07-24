# Decisão — Integração E4↔E5 (Story 5.7)

Consolidação das decisões de desenho da integração de Tarefa/Solicitação/Notificação com o motor de Automação
(E4). Herda os gates de E4 (OQ-26, limites do motor, AD-18) e o gate temporal de 5.1 (`TASK_OVERDUE`).

## D1 — Eventos de E5 são CORE (selecionáveis), não EXTENSION

Os Eventos de Tarefa/Solicitação passam de `EVENTOS_EXTENSAO` para `EVENTOS_NUCLEO` (`origem='CORE'`), tornando-os
**selecionáveis** como gatilho (`exigirEventoNoCatalogo` os aceita) — AC4/§1660 ("todos disponíveis, nenhum
condicional"). `resourceType` ganha `'TASK'`/`'REQUEST'`. `EMAIL_SENT`/`EMAIL_RECEIVED` seguem EXTENSION (E6).

**Emissão same-tx (AD-13):** cada Evento nasce na MESMA transação do fato, via `emitirEventoDeDominio`:
- `TasksService`: criar→`TASK_CREATED`; concluir→`TASK_COMPLETED`; reabrir→`TASK_REOPENED`;
  arquivar→`TASK_ARCHIVED`; restaurar→`TASK_RESTORED`; Responsável (mudança real)→`TASK_RESPONSIBLE_CHANGED`.
- `SolicitacoesService`: análogo (`REQUEST_*`; `resolver`→`REQUEST_RESOLVED`).
- `TaskOverdueService`: cada ocorrência NOVA (`TaskOverdueOccurrence`) → `TASK_OVERDUE`, na MESMA tx interativa
  do INSERT set-based (RETURNING inclui `pipeId`). **Reusa o mecanismo temporal idempotente da 5.1** — sem
  scheduler novo. Idempotente por `eventId` determinístico (`correlationId = uuidv5(overdue:org:task:dueVersion)`);
  re-scan não re-insere ocorrência ⇒ não re-emite.
- `correlationId` das transições = `randomUUID()` (a mutação do usuário não é retry-idempotente no serviço; cada
  transição é um fato distinto — evita colisão de `eventId` em complete→reopen→complete). No caminho HUMANO a
  criação também usa `randomUUID()` (mesmo helper `emitirDominio`; o Evento nasce na MESMA tx do fato, então um
  rollback reverte ambos — não há janela de duplicação); no caminho da AUTOMAÇÃO a criação usa o próprio id da
  entidade (`correlationId = nova.id`, determinístico com a `idempotencyKey` da Ação). `TASK_OVERDUE` usa
  `uuidv5(NS_NOTIF_TASK_OVERDUE, "event:{orgId}:{taskId}:{dueVersion}")` — determinístico por ocorrência.

Emissão **incondicional** (como `CARD_CREATED`): o outbox é escrito sempre; o motor decide quem reage. Quem drena
é o motor existente (`enfileirarParaEvento`/`drenarOrg`; driver contínuo deferido — `DEB-4-6-DRIVER-CONTINUO`).

## D2 — Ações de E5 são handlers CORE do MESMO motor

`TASK_CREATE`/`REQUEST_CREATE`/`NOTIFICATION_SEND` saem de `TIPOS_ACAO_EXTENSAO` e viram Ações de catálogo
(`ACOES_CATALOGO`, 4.5) + handlers CORE (`REGISTRO_ACOES_NUCLEO` deriva do catálogo). Executam por
`executarAcao` (4.6) sob o `PrincipalAutomacao`, gravam na trilha `AutomationExecution`/`AutomationActionResult`
(4.8), participam de dedup/retry/encadeamento/ciclos. **Sem motor/scheduler/trilha paralela** (§1655). Os slots
`EMAIL_SEND`/`AI_ACTION` seguem EXTENSION (recusados) — E6.

## D3 — Domínios de alvo novos: `PIPE` e `NOTIFICATION`

`AcaoDominio` ganha `'PIPE'` (Criar Tarefa/Solicitação) e `'NOTIFICATION'` (Enviar Notificação):
- **PIPE** — alvo = 1 ref `PIPE` (determinístico). **A fonte real da não-ampliação é o config-time**:
  `revalidarReferencias` só aceita ref `PIPE` igual ao Pipe proprietário (400 `REFERENCIA_INALCANCAVEL` senão) —
  a allowlist `recursosAutorizados` do principal é semeada por essas mesmas refs já validadas, então o
  `dentroDoEscopo` em execução é defesa em profundidade, não o gate primário. Estado:
  `PIPE_ATIVO` (`{ACTIVE}`) — não cria em Pipe arquivado. Snapshot lê `Pipe(orgId, state)` sob RLS.
- **NOTIFICATION** — alvo = o **recurso primário** do Evento (card XOR task XOR request; exatamente um não-nulo
  no `ContextoEvento`, senão fail-closed). `dentroDoEscopo`: o `pipeId` do recurso == `principal.pipeId`
  (contido ao Pipe proprietário, RN-100). Sem gate de estado (a distribuição 5.6 decide acesso/preferência).

`ContextoEvento` ganha `taskId`/`requestId`. O snapshot-builder, para `resourceType` `'TASK'`/`'REQUEST'`,
expõe SÓ o recurso primário (card/record vazios — Condições de Card/Registro ficam fail-closed nesses Eventos,
comportamento explícito Fase 1) e valida a contenção ao Pipe proprietário (M-1).

## D4 — Idempotência de criação (migration)

`Task.idempotencyKey`/`Solicitacao.idempotencyKey` (`String?` + `@@unique([orgId, pipeId, idempotencyKey])`),
espelho de `Automation.idempotencyKey` (D-4.2-F). NULLs distintos ⇒ criação humana (sem chave) intocada; a
criação por Automação usa `auto:<execId>:<actionIdx>` ⇒ retry reencontra a linha (P2002 → idempotente, nunca
2ª Tarefa), fechando a janela crash-após-commit-antes-de-gravar-resultado (idêntico a `criarRegistro`, 4.6).
**Sem GRANT novo**: `INSERT` cobre a coluna; `idempotencyKey` é imutável (fora do UPDATE column-scoped).

## D5 — Não-ampliação (4.5) preservada

As Ações rodam sob o `PrincipalAutomacao` (escopo restrito; capacidades = tipos do `entao`; recursos = refs +
pipe proprietário). `revalidarAcao` é fail-closed: capacidade explícita (deny-by-default) → alvo existe → mesma
Org → escopo → estado. Alvo/Membership vêm da CONFIG (determinísticos), nunca do cliente. Criar Tarefa/
Solicitação e Enviar Notificação **não ampliam acesso**:
- Responsável de Tarefa/Solicitação = referência-por-id a Membership ATIVA (regra canônica 5.1/5.2; sem
  requisito de acesso prévio — diferente do Card SC-2101, que 5.1 não replica). Membership inválida → `DENIED`.
- `NOTIFICATION_SEND` reusa `NotificationDistributionService.distribuir` (5.6): resolve destinatários pela
  ESTRATÉGIA DO TIPO (não da Automação), revalida **acesso atual** (exclui quem não tem), aplica **preferências**
  (sem bypass), **dedup**, **CAP**, e nunca alcança fora da Org (RLS). O tipo é de um allowlist restrito
  (`PARTES_DO_CARD`/`RESPONSAVEL_TAREFA_ATUAL`; NUNCA `ALVO_DIRETO`, que exigiria destinatário arbitrário). O
  conteúdo vem da fonte 5.3 (parametrizado/sanitizado), NUNCA da config — logo sem HTML/script/segredo/payload
  bruto por construção. Ator = `null` (sistema/automação).

## D6 — Fecha `DEB-5.6-CARD-MOVED-AUTOMATION-WIRING`

A 5.6 implementou a distribuição de `CARD_MOVED_BY_AUTOMATION` mas deferiu o TRIGGER de motor à 5.7. O
`NOTIFICATION_SEND` é esse trigger: uma Automação "Quando `CARD_MOVED` → Enviar Notificação
`CARD_MOVED_BY_AUTOMATION`" agora funciona ponta-a-ponta pelo motor. Débito fechado.

## Débitos deixados

- `EMAIL_SEND`/`AI_ACTION` (E6) seguem slots de extensão recusados — `DEB-4-9-E5-E6-HANDLER-REGISTRO`
  **parcialmente** fechado (só E5).
- Driver contínuo de drain (`DEB-4-6-DRIVER-CONTINUO`) e de overdue (`DEB-5-1-OVERDUE-DRIVER`) seguem operação
  de plataforma (não antecipados — AD-11).
