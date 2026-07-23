# Decisão de Arquitetura — Mecanismo temporal do Evento "Tarefa atrasada" (Story 5.1)

**Status:** DECIDIDO (gate de Arquitetura §1535 resolvido no Spec Kit, sem infra externa nova).
**Escopo desta decisão:** apenas o mecanismo que **emite a ocorrência canônica** do Evento "Tarefa
atrasada" de forma idempotente. **Fora de escopo:** registrar o Evento no motor E4 (Story 5.7) e criar
Notificações (Story 5.3+). A ocorrência é o **contrato durável** que a 5.7 consumirá.

## 1. Problema (§1535)

Um mecanismo temporal confiável deve identificar quando uma Tarefa **aberta** ultrapassa o prazo e:

- **não persistir** o estado `atrasada` (ele é derivado na leitura, como a saúde do Card — 2.13);
- **persistir a ocorrência canônica** do Evento;
- emitir **no máximo uma ocorrência por versão do prazo** (chave idempotente `taskId` + versão do prazo);
- alterar o prazo **invalida** a ocorrência anterior (uma versão nova pode emitir de novo);
- **retry/atraso do scheduler não duplica**;
- **concluir/arquivar antes do processamento impede** a emissão.

## 2. Decisão: reusar o padrão Postgres-based do motor 4.6 (zero-dependência, AD-32)

**NÃO** se introduz Redis, cron de SO nem fila externa. O precedente é o motor de Automação (4.6):
polling/drain com claim `FOR UPDATE SKIP LOCKED`, idempotência imposta por índice único, recuperação
por releitura. A 5.1 reusa **o padrão** (não o código nem as entidades de Automação — `Task ≠ Automation`).

### 2.1 Versão do prazo — `Task.dueVersion` (Int, monotônica)

O "versão relevante do prazo" (§1535) é materializado como uma coluna **`dueVersion Int`** em `Task`,
incrementada **toda vez** que `dueAt` muda (definir, alterar ou limpar o prazo). Começa em `0`.

- **Idempotência:** a ocorrência tem chave única `@@unique([orgId, taskId, dueVersion])`. Um retry ou um
  atraso do scheduler que reprocessa a mesma Tarefa na mesma versão colide no INSERT (**P2002**) e é
  ignorado — nunca há 2ª ocorrência para a mesma versão.
- **Invalidação por alteração de prazo:** mudar `dueAt` bumpa `dueVersion`. A ocorrência anterior (versão
  N) permanece na trilha append-only, mas deixa de ser a **corrente**; se a nova versão também estiver
  vencida, uma nova ocorrência (versão N+1) pode ser emitida. "Sem recálculo retroativo silencioso" cai
  por construção — cada ocorrência congela a `dueAt` que a gerou (padrão da `FormVersion`/`CardPhaseEntry`).
- **Concluir/arquivar antes de processar impede a emissão:** o scan só considera Tarefas
  `lifecycleState = 'aberta'` **e** `archiveState = 'ATIVA'`. Concluir/arquivar tira a Tarefa do conjunto
  elegível antes de o scan a alcançar — sem emissão incorreta.

### 2.2 A entidade da ocorrência — `TaskOverdueOccurrence` (append-only, imutável)

Tabela org-scoped, RLS **ENABLE+FORCE** + `WITH CHECK` no INSERT e UPDATE, GRANT **só `SELECT/INSERT`**
(append-only imutável, como `CardHistory`/`FormVersion`/`DomainEvent`). Cada linha congela
`(taskId, dueVersion, dueAt)` e o instante de detecção. **Sem DELETE, sem UPDATE** — a ocorrência é um fato.

### 2.3 O scan — `TaskOverdueService.escanearOrg(orgId)`

Espelha `AutomationEngineService.drenarOrg`: sob `withTenantContext`/`definirContextoOrg`, seleciona as
Tarefas elegíveis com prazo vencido e **INSERE** a ocorrência de cada uma (idempotente por P2002). É
**invocável** (como `processarEventoAgora`), testado diretamente contra PostgreSQL real. O **driver
contínuo multi-réplica** (loop/intervalo/dispatcher por env) fica **deferido** como `DEB-5-1-OVERDUE-DRIVER`,
exatamente como o motor 4.6 deferiu `DEB-4-6-DRIVER-CONTINUO` — o padrão de agendamento robusto é 4.7/deploy,
não se antecipa infra sem consumidor concreto (AD-11). A 5.1 entrega o mecanismo idempotente que **emite**;
o agendamento periódico é operação de plataforma.

## 3. Timezone / determinismo (§1535 "fuso oficial")

`Task.dueAt` é **`@db.Timestamptz`** — um **instante absoluto** (mesma decisão de `CardPhaseEntry.enteredAt`,
DIV-1). A comparação de vencimento é `agora >= dueAt` (instante × instante), **determinística e independente
do fuso de exibição**: um instante absoluto é o mesmo em qualquer fuso, então "vencido no fuso oficial da
Organização" cai por construção — não há ambiguidade de wall-clock nem janela de DST. A API interna recebe o
prazo como ISO-8601 com offset (instante); a interpretação de um wall-clock para instante, se um dia a UI a
exigir, aplica o fuso oficial **no input**, sem afetar a comparação. Comparação por instante evita, ainda, o
DoS de cast de valor malformado (a coluna é tipada, validada na escrita).

## 4. Estado `atrasada` — derivado, NÃO persistido

Função pura `derivarAtrasada(lifecycleState, archiveState, dueAt, agora)` (núcleo `task-overdue.core.ts`):
`aberta && ATIVA && dueAt != null && agora >= dueAt`. Concluída/arquivada **nunca** aparece atrasada.
Alterar o prazo recalcula imediatamente (é puro na leitura — sem estado a recomputar). Espelha
`derivarSaude` (2.13): sem persistir, sem evento, sem agendador para o estado derivado.

## 5. Recuperação após indisponibilidade

O scan é **stateless e idempotente**: após qualquer janela de indisponibilidade, o próximo scan reencontra
todas as Tarefas vencidas ainda sem ocorrência na versão corrente e as emite. Nada se perde (a ocorrência
não emitida ainda não existe; a Tarefa segue elegível) e nada duplica (P2002 na versão já emitida). Não há
lease a expirar nem cursor a corromper — a existência da linha de ocorrência **é** o cursor.

## 6. Alternativas descartadas

- **Persistir `atrasada` + job que vira o flag:** viola "não persiste `atrasada`" (§1535) e o padrão de
  derivação da 2.13; abre janela de estado obsoleto ao alterar o prazo.
- **Redis/BullMQ/cron de SO:** infra externa nova — barrada pela decisão zero-dependência (AD-32) e pela
  diretriz da Story ("NÃO introduza infra nova sem escalar"). O padrão Postgres-based cobre o requisito.
- **`setTimeout`/delayed-job por Tarefa:** não sobrevive a restart, não é multi-réplica, e o atraso do
  scheduler exigiria reconciliação de qualquer forma — o polling idempotente já é a reconciliação.

## 7. Consumo pela 5.7 (contrato)

A 5.7 lerá `TaskOverdueOccurrence` (a ocorrência corrente por `dueVersion`) para registrar o Evento no motor
E4 e disparar Notificação. A 5.1 **não** escreve `DomainEvent` nem cria Notificação — só materializa a
ocorrência canônica idempotente.
