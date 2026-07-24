# Story 5.7 — Integração de Tarefa/Solicitação/Notificação com o motor de Automação

> Fonte autoritativa: `_bmad-output/planning-artifacts/epics.md` §1644-1665 (Story 5.7) + §1455-1468 (4.9).
> FR-27/28/29; D4.1; RN-100..104; NFR-6/7. Consome: contrato do motor (4.9), Tarefas (5.1),
> Solicitações (5.2), Notificações (5.3/5.6). Última Story do Épico 5. **Risco ALTO** (integração de
> motor + autz/não-ampliação + idempotência; herda gates de E4).

## Objetivo

Permitir que Automações **reajam** a Tarefas/Solicitações (Eventos) e **gerem** Tarefas/Solicitações/
Notificações (Ações) **pelo motor de E4**, sem motor/scheduler/trilha paralela. Preenche os slots de
extensão de Ação que a 4.9 deixou (`origem='EXTENSION'`, hoje recusados) e registra/emite os Eventos de E5.

## Escopo (o que a Story faz)

### 1. Eventos de Tarefa (catálogo 4.3 + emissão same-tx nos pontos de mutação 5.1)
`TASK_CREATED`, `TASK_COMPLETED`, `TASK_REOPENED`, `TASK_ARCHIVED`, `TASK_RESTORED`,
`TASK_RESPONSIBLE_CHANGED`, `TASK_OVERDUE`. Todos **SELECIONÁVEIS** como gatilho (nenhum condicional — §1660).
`TASK_OVERDUE` **reutiliza o mecanismo temporal idempotente da 5.1** (`TaskOverdueService`) — NÃO cria
scheduler novo; o Evento nasce na MESMA tx da ocorrência (`TaskOverdueOccurrence`, AD-13).

### 2. Eventos de Solicitação (catálogo 4.3 + emissão same-tx nos pontos de mutação 5.2)
`REQUEST_CREATED`, `REQUEST_RESOLVED`, `REQUEST_REOPENED`, `REQUEST_ARCHIVED`, `REQUEST_RESTORED`,
`REQUEST_RESPONSIBLE_CHANGED`. Todos SELECIONÁVEIS.

### 3. Ações (preencher os handlers no contrato 4.9 — promovidas de `EXTENSION` a `CORE`)
- **Criar Tarefa** (`TASK_CREATE`): valida Pipe alvo (ref `PIPE`) / Card opcional (`vincularCardDoEvento` —
  o Card do Evento, do MESMO Pipe) / título-conteúdo permitido / prazo opcional (`dueInMinutes`) /
  Responsável opcional (Membership ATIVA) / **sem anexos de conteúdo arbitrário** / alvo+Membership
  **determinísticos** / criação **idempotente** (idempotencyKey determinística, reusa a lógica de 5.1).
- **Criar Solicitação** (`REQUEST_CREATE`): Pipe alvo / Card opcional / conteúdo permitido / Responsável /
  idempotente / **nenhuma referência fora da Org** (reusa 5.2).
- **Enviar Notificação in-app** (`NOTIFICATION_SEND`, nome canônico ÚNICO): tipo permitido (allowlist de
  tipos do catálogo 5.6 com **seletor determinístico** — `PARTES_DO_CARD`/`RESPONSAVEL_TAREFA_ATUAL`, nunca
  `ALVO_DIRETO`) / **seletor determinístico de destinatários** (vem do catálogo, não da Automação) /
  referência ao recurso (o recurso primário do Evento) / conteúdo parametrizado e **sanitizado** (o conteúdo
  vem do catálogo/fonte 5.3, NUNCA da config da Automação). **NÃO permite**: destinatário externo arbitrário,
  HTML/script, segredo, payload bruto, **bypass de preferências**, nem **notificar quem não tem acesso** — tudo
  garantido por **reuso da distribuição 5.6** (acesso-atual + Memberships ativas + preferências + dedup +
  ninguém-fora-da-Org + sanitização). **Fecha `DEB-5.6-CARD-MOVED-AUTOMATION-WIRING`.**

### 4. Integração com E4 (consumo integral, sem paralelo — §1655)
Cada handler declara as 11 facetas do contrato 4.9 (ID estável/versão/schema/validador/disponibilidade/
resolvedor de alvo/autorização/executor idempotente/Eventos produzidos/sanitização/dados de trilha).
**Consome integralmente** outbox (`DomainEvent`) / fila+claim/lease (`AutomationExecution`) / idempotência
(dedup por Execução e por Ação) / retries / encadeamento (4.7) / prevenção de ciclos / **principal Automação**
(4.5) / Trilha de Execuções (4.8). NÃO cria motor, scheduler ou trilha paralela.

## Critérios de aceite (epics §1657-1660)

- **AC1** — Given o contrato 4.9, When E5 registra Eventos e Ações, Then usam o motor de E4 (outbox/
  idempotência/encadeamento/ciclos/trilha/principal) sem motor/scheduler/trilha paralela, com handlers tipados
  e alvo determinístico.
- **AC2** — Given "Criar Tarefa"/"Criar Solicitação", When executam, Then criam pelas regras de 5.1/5.2,
  idempotentes, com alvo e Membership determinísticos, sem referência fora da Organização.
- **AC3** — Given "Enviar Notificação in-app", When executa, Then usa a fonte de 5.3/5.6, com seletor
  determinístico, conteúdo sanitizado, respeitando preferências e sem notificar quem não tem acesso.
- **AC4** — And todos os Eventos de Tarefa/Solicitação aprovados estão disponíveis (nenhum condicional).

## Invariantes inegociáveis

- **Sem motor/scheduler/trilha paralela** — reusa `AutomationEngineService` (drain/claim/lease/retry/
  encadeamento/ciclos), `emitirEventoDeDominio` (outbox), `AutomationExecution`/`AutomationActionResult`
  (trilha 4.8). `TASK_OVERDUE` reusa `TaskOverdueService`.
- **Não-ampliação (4.5)** — as Ações rodam sob o `PrincipalAutomacao` (escopo restrito, capacidades explícitas
  deny-by-default; NÃO carrega o criador). Cada Ação passa por `revalidarAcao` (fail-closed). Alvo/Membership
  determinísticos (da config, nunca do cliente). `NOTIFICATION_SEND` não amplia: 5.6 exclui quem não tem
  acesso e respeita preferências.
- **Isolamento** — tudo por `withTenantContext`/`definirContextoOrg`; `orgId` nunca do cliente. Eventos e
  criações nascem same-tx com seu fato (AD-13). "Nenhuma ref fora da Org": ref cross-org é invisível sob RLS
  (→ `NAO_ENCONTRADO`) e barrada no config-time (`revalidarReferencias`).
- **C3 congelado** — `ability.ts`/guard intocados; autoridade fina é o núcleo puro `revalidarAcao` +
  `PrincipalAutomacao`.
- **Sem antecipar E6** — `EMAIL_SEND`/`AI_ACTION` seguem `EXTENSION` (recusados). `EMAIL_SENT`/`EMAIL_RECEIVED`
  seguem eventos de extensão não-selecionáveis.

## Migration

**Necessária** — `Task.idempotencyKey` e `Solicitacao.idempotencyKey` (`String?` + `@@unique([orgId, pipeId,
idempotencyKey])`), espelhando `Automation.idempotencyKey` (D-4.2-F): NULLs distintos no Postgres ⇒ criações
humanas (sem chave) nunca colidem; a criação por Automação usa chave determinística `auto:<execId>:<actionIdx>`
⇒ retry at-least-once devolve o existente (P2002 → idempotente), garantindo "no máximo 1 Tarefa/Solicitação"
por Ação. **Sem GRANT novo** (`INSERT` já cobre a coluna nova; `idempotencyKey` é imutável, fora do UPDATE
column-scoped). RLS/FORCE já existentes preservados; a coluna nova não muda policy.

## Fora do escopo

Núcleo do motor (E4); Ações de E-mail/IA (E6 — os slots `EMAIL_SEND`/`AI_ACTION` seguem declarados,
recusados); driver contínuo de drain (`DEB-4-6-DRIVER-CONTINUO`) e de overdue (`DEB-5-1-OVERDUE-DRIVER`),
ambos operação de plataforma.
