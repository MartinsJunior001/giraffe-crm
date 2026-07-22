# Decisão de Arquitetura — Motor de disparo e avaliação (Story 4.6)

> Gate de Arquitetura da Story 4.6 (epics.md §1415): **outbox; fila; retries; backoff; timeout;
> concorrência; idempotência; recuperação de jobs interrompidos.** Este documento consolida o desenho
> do motor, **derivando** do contrato da Story (epics.md §1396–1417) e dos precedentes já no código —
> sem inventar infraestrutura. É a fonte durável da decisão (CLAUDE.md — "decisão material fica registrada
> no PR **e** na documentação durável").

## 0. Veredito do gate: NÃO é `EXTERNAL_BLOCKER`

O gate lista "fila" e "recuperação de jobs interrompidos". A dúvida legítima era: isso exige uma
tecnologia de fila externa (Redis/BullMQ/pg-boss/Kafka) **não presente na stack**? **Não.** O desenho
inteiro é derivável dos primitivos que já existem:

| Requisito do gate | Primitivo derivado (já na stack/precedente) |
| --- | --- |
| **outbox** | `DomainEvent` (4.3) — outbox canônico append-only, RLS+FORCE, `@@unique(orgId,eventId)`. Já é a fila durável. |
| **fila** | O próprio `DomainEvent` **é** a fila. O consumo é *poll* + claim atômico. Postgres `FOR UPDATE SKIP LOCKED` (recomendação oficial do Prisma — blog "you don't need a job queue, Postgres already has SKIP LOCKED"). |
| **concorrência** | `FOR UPDATE SKIP LOCKED` (claim) + guarda otimista `updateMany where state=<lido>` (base) + semáforo atômico `ScanSlot`/rate-limiter (3.7). |
| **idempotência** | Dedup de **Execução** por `@@unique(orgId,eventId,automationId,automationVersionId)` + dedup de **Ação** por `@@unique(orgId,executionId,actionIndex)`. Colisão P2002/P2028 → idempotente/409, **nunca 500** (padrão 2.7/3.4). |
| **retries/backoff** | Colunas `attempt`/`nextAttemptAt` + núcleo puro de política (`retry-policy.core.ts`). Sem lib. |
| **timeout** | `leaseExpiresAt` por Execução em processamento; a claim reivindica leases vencidas. Núcleo puro `recovery.core.ts`. |
| **recuperação de jobs interrompidos** | Um crash deixa a Execução em `RUNNING` com `leaseExpiresAt` no passado; o próximo drain a **reclama** (mesma claim), e o **dedup por Ação** garante que efeitos já concluídos não repetem. |

Nenhuma dependência nova entra no `package.json`. Stack: PostgreSQL 16 + Node 24 + Prisma 6.19.3 +
NestJS 11 — o mesmo conjunto das 45 Stories anteriores. **Zero-infra** é coerente com AD-32 (3.7 fez SigV4
e clamd sobre `node:http`/`node:net` sem dependência) e com "não trocar a stack sem decisão registrada".

## 1. O modelo de processamento: outbox → drain primitivo → executores

```
  [Transação de origem]  (2.7/2.8/2.14/2.11/2.10/3.4/…)
        │  commit atômico (AD-13)
        ▼
  DomainEvent (outbox, append-only)         ← 4.3, JÁ existe
        │  poll + claim (FOR UPDATE SKIP LOCKED, sob RLS)
        ▼
  AutomationEngine.drenar(batch)            ← 4.6, ESTE motor
        │  para cada (evento × Automação ATIVA do Pipe):
        │    1. dedup de Execução  (upsert idempotente)
        │    2. montar SnapshotAvaliacao  (sob RLS; fecha DEB-4-4-SNAPSHOT-BUILDER; M-1)
        │    3. avaliarCondicoes (4.4, AND, fail-closed)
        │    4. para cada Ação, EM ORDEM:
        │         resolverAlvoDeterministico + revalidarAcao (4.5)  ← só executa se `permitido`
        │         executor da Ação (reusa núcleo puro + tx definirContextoOrg)
        │         gravar AutomationActionResult (dedup por índice)
        ▼
  AutomationExecution + AutomationActionResult   ← trilha que a 4.8 LERÁ
```

**O drain é um primitivo público** (`AutomationEngineService.drenarPendentes(limite)` /
`processarEvento(eventId)`), não um `setInterval` escondido. Razão (derivada de precedente):

- A **corretude** do motor vive no primitivo, não no relógio que o chama — exatamente como os núcleos
  puros de 2.13/2.12 ("sob demanda na leitura, sem agendador"): a plataforma evitou agendador embutido
  deliberadamente. Testar o motor é **invocar o drain**, não esperar um loop (o teste de um worker testa
  o *tick*, nunca o `setInterval`).
- O **driver** (o que chama `drenar` periodicamente) é uma preocupação de *deployment*. A Fase 1 entrega
  o primitivo + um **dispatcher in-process opt-in** (`onModuleInit`, `setTimeout` recursivo, sem lib),
  **gated por env** (`AUTOMATION_ENGINE_POLL_ENABLED`, default `false` — **em teste e CI sempre off**,
  para o teste dirigir o drain deterministicamente). Multi-réplica é seguro por `SKIP LOCKED` (duas
  réplicas nunca reivindicam a mesma linha). O loop contínuo com *leader election* robusto e o
  *dead-letter* administrativo pertencem à 4.7 (§1435 já lista "dead-letter/reprocessamento autorizado"
  como gate da 4.7) — AD-11: não anteciparei o que a 4.7 possui como escopo.

## 2. Como o consumo do outbox se casa com o outbox append-only (a decisão-chave)

`DomainEvent` tem GRANT **só SELECT/INSERT** — o motor **não pode** marcar um evento como "processado"
mutando a linha (não há UPDATE). A decisão: **o ledger de Execução é o cursor de processamento.**

- Para cada `(eventId, automationId, automationVersionId)`, a **existência** de uma `AutomationExecution`
  responde "já processei este evento para esta Automação nesta versão". O `@@unique` a torna a fonte de
  verdade da dedup lógica (§1402: "chave de dedup mínima: `eventId`+`automationId`+`automationVersionId`").
- O drain seleciona eventos `DomainEvent` cujo `(evento × Automação ativa)` **ainda não tem Execução**
  (`NOT EXISTS`), e reivindica **a Execução** (não o evento) com `FOR UPDATE SKIP LOCKED`. O outbox
  permanece imutável; o estado de progresso vive no ledger mutável, cujo GRANT de UPDATE é column-scoped.
- **At-least-once, não exactly-once** (§1400): reprocessar o mesmo evento reencontra a Execução; se ela
  está `SUCCEEDED`/`PARTIAL`/`FAILED` (terminal), o drain a ignora; se `RUNNING` com lease vencida
  (crash), a reclama e **retoma pelas Ações ainda não concluídas** — o dedup por Ação impede efeito duplo.

## 3. Tabelas novas (migration aditiva) — `AutomationExecution` e `AutomationActionResult`

Ambas org-scoped, RLS **ENABLE+FORCE**, `WITH CHECK` no INSERT **e** UPDATE, FK **composta** tenant-safe
(F-A1), em `MODELOS_AUDITADOS`, **sem DELETE** de runtime. Espelham `Card`/`Record` no GRANT column-scoped.

### `AutomationExecution` — a Execução lógica (uma por evento×Automação×versão)

- Colunas de identidade/dedup: `orgId`, `id`, `eventId`, `automationId`, `automationVersionId`,
  `pipeId`, `configSnapshotRevision` (a revisão da versão avaliada — congelada; §1404 "sem mistura de
  versões numa Execução").
- Estado: `state` ∈ `{ PENDING, RUNNING, SUCCEEDED, PARTIAL, FAILED, BLOCKED_CONFIRMATION, SKIPPED_CONDITIONS }`
  (estados honestos — §1411; `SKIPPED_CONDITIONS` = Condição não satisfeita, sem Ação; `BLOCKED_CONFIRMATION`
  = alguma Ação exige confirmação humana — §1383, L-1: entra por `exigeConfirmacaoHumana`, mas **nunca é
  autorização de execução**).
- Concorrência/recuperação: `attempt` (Int), `nextAttemptAt` (Timestamptz?), `leaseOwner` (uuid?),
  `leaseExpiresAt` (Timestamptz?), `startedAt`, `finishedAt`.
- Auditoria mínima (§1384): `initiatorType`/`initiatorAccountId`/`initiatorAutomationId` (o **iniciador**
  preservado do evento), `correlationId`, `executionChainId`. O **ator** é sempre o principal Automação
  (implícito por `automationId`); nunca fundido com o iniciador.
- Diagnóstico sanitizado: `lastErrorCode` (enum estrutural, **nunca** id/valor/PII — AD-30).
- Índices: `@@unique([orgId, eventId, automationId, automationVersionId])` (dedup — §1402);
  `@@unique([orgId, id])` (alvo da FK composta do filho); `@@index([orgId, state, nextAttemptAt])`
  (fila de reivindicação); FK composta `(orgId, automationId)→Automation(orgId, id)` (RESTRICT — não há
  DELETE de Automação em runtime; e a versão é NÚMERO, sem FK, como `Form.publishedVersion`).
- GRANT: `SELECT, INSERT` + **UPDATE column-scoped** de `state`, `attempt`, `nextAttemptAt`, `leaseOwner`,
  `leaseExpiresAt`, `startedAt`, `finishedAt`, `lastErrorCode`, `updatedAt` — **e só isso**. `eventId`,
  `automationId`, `automationVersionId`, `configSnapshotRevision`, `orgId`, `pipeId`, `initiator*` são
  **imutáveis** por GRANT (uma Execução não migra de evento/Automação/versão — provado no `automation-engine-rls`).

### `AutomationActionResult` — resultado por Ação (append-only)

- `orgId`, `id`, `executionId`, `actionIndex` (posição estável na config — §1403), `actionType`,
  `state` ∈ `{ SUCCEEDED, FAILED, BLOCKED_PRIOR_FAILURE, BLOCKED_CONFIRMATION, DENIED }`,
  `errorCode` (sanitizado), `targetResourceId?` (id do alvo — nunca `valores`/PII), `finishedAt`.
- `@@unique([orgId, executionId, actionIndex])` — a **dedup de Ação** (§1403): a mesma Ação da mesma
  Execução nunca roda 2× (retry/recuperação reencontra o resultado e pula). FK composta
  `(orgId, executionId)→AutomationExecution(orgId, id)` (CASCADE — resultado é fato derivado da Execução).
- GRANT: **só `SELECT, INSERT`** (append-only imutável, como `CardHistory`/`FormVersion`). O resultado de
  uma Ação é fato consumado — nunca reescrito; um retry que reprocessa a Execução só INSERE resultados das
  Ações **ainda sem** linha.

**Migration reversível:** `DROP TABLE` das duas (drill no gate `migration-check`). Sem backfill (tabelas
novas). Sem alteração de tabela existente.

## 4. Ordem, falha e efeitos parciais (D4.2 — §1407)

- Ações de **uma** Automação executam **na ordem configurada** (`entao[0..n]`); o executor itera o array.
- **Falhou uma Ação** ⇒ as seguintes daquela Automação **não executam** e recebem
  `state=BLOCKED_PRIOR_FAILURE`; efeitos anteriores **permanecem** (sem rollback entre Ações — cada Ação é
  uma tx atômica própria, mas a Execução **não** é uma tx única); a Execução fecha em `PARTIAL`.
- **Ação recusada** pela revalidação (4.5, `permitido=false`) ⇒ `state=DENIED`; trata-se como falha da
  Ação para efeito de "seguintes bloqueadas" (fail-closed — §1411). `ALVO_INDETERMINADO`/`SEM_CAPACIDADE`/
  `FORA_DO_ESCOPO`/`FORA_DA_ORG`/`NAO_ENCONTRADO`/`ESTADO_INVALIDO` são o `errorCode` sanitizado.
- **Confirmação humana** (§1383): uma Ação com `exigeConfirmacaoHumana=true` **não é executada** pelo
  motor da Fase 1 — recebe `BLOCKED_CONFIRMATION`, as seguintes ficam `BLOCKED_PRIOR_FAILURE` (a cadeia
  para), a Execução fecha em `BLOCKED_CONFIRMATION` **sem manter job aberto** (§1383 — "não mantém
  worker/job aberto indefinidamente"; a continuação por fluxo separado é contrato futuro, não a 4.6).
  **L-1 (crítico):** o motor executa por `resultado.permitido`; `exigeConfirmacaoHumana` só **classifica**
  o estado — nunca autoriza.
- **Automações diferentes** no mesmo evento são **independentes** (§1407): cada uma é sua própria Execução;
  a falha de uma não impede a outra. Sem ordem garantida entre Automações.

## 5. Não-ampliação de poder + M-1 (containment) — os pontos de RISCO ALTO

### O principal e a não-ampliação (§1384/§1389)
O motor **constrói** o `PrincipalAutomacao` a partir da **versão congelada** (`AutomationVersion.snapshot`):
`recursosAutorizados` = referências configuradas + `pipeId`; `capacidades` = tipos do `entao`. `revalidarAcao`
(4.5) barra qualquer Ação de tipo/recurso fora dessa allowlist — **antes** de olhar o alvo. O escopo é do
**principal**, não do criador: um recurso que o criador alcançaria mas que não está na definição versionada é
`FORA_DO_ESCOPO`. Isto é o que impede ampliação.

### M-1 — `DEB-4-5-EVENTO-ALVO-CONTAINMENT` (responsabilidade DESTA Story)
`RECORD_EDIT` modo `EVENTO`/`VINCULO` deriva o alvo do **evento**, não de uma referência configurada. A
4.5 (`dentroDoEscopo`) confia que o motor só coloca em `ContextoEvento.recordId`/`linkedRecordIds`
Registros **legitimamente entregues** — mas essa garantia **não é auto-contida** no núcleo da 4.5. **O motor
DEVE popular esses campos apenas com Registros vinculados a um Card do Pipe PROPRIETÁRIO** da Automação:

- `recordId` (Evento de Registro): o motor só o entrega se o Registro tiver **vínculo ativo** (`CardRecordLink`,
  3.9) com **algum Card do `pipeId` da Automação**. Um `RECORD_*` cujo Registro não toca o Pipe proprietário
  **não entrega alvo** (§1284 — "só dispara quando o Registro estiver vinculado a ≥1 Card daquele Pipe").
- `linkedRecordIds`: filtrados aos Registros vinculados ao **Card de contexto** (que já é do Pipe, pois o
  evento de Card carrega `pipeId`). Um Registro de outro Database referenciado indevidamente **não aparece**.
- Tudo lido **sob RLS/`withTenantContext`** — cross-tenant já é invisível; M-1 fecha o cross-**Pipe**/Database
  dentro da mesma Org, que a RLS sozinha **não** cobre.

Teste obrigatório (d): um Registro da mesma Org mas de outro Pipe/Database **não** vira alvo — a Execução
recusa (`ALVO_INDETERMINADO`/`FORA_DO_ESCOPO`), sem mutação.

### SC-2101/2102 — `DEB-4-5-MEMBERSHIP-REF`
`CARD_ASSIGN_RESPONSIBLE` revalida, **na execução sob RLS**, que a Membership alvo tem **acesso operacional
prévio** ao Card (SC-2101) e que atribuir **não amplia** acesso (SC-2102) — reusando a lógica de 2.10
(`resolverAcessoNoCard`/`exigirOperarCard` aplicados ao **membro alvo**, não ao principal). Falha ⇒ `DENIED`.

## 6. Snapshot builder (fecha DEB-4-4-SNAPSHOT-BUILDER)

O motor monta `SnapshotAvaliacao` (4.4) e `AlvoAcaoSnapshot`/`ContextoEvento` (4.5) **sob RLS**, a partir do
envelope do `DomainEvent`:
- Card: lê `Card` (lifecycle/phase/valores), deriva `saude` via `derivarSaude` (2.13) sobre `calcularMarcos`
  (2.12) da entrada atual, `linkedRecordIds` via `CardRecordLink` ativos (3.9, filtrados — M-1).
- Record: lê `Record` (lifecycle/valores). `valoresAnteriores` vêm do `payload` minimizado do evento
  (`*_FIELD_VALUE_CHANGED`) — nunca de releitura (determinismo — §1358).
- `camposPorId`: Campos ativos do Formulário do recurso (allowlist para o avaliador).
- `avaliadoEm` = `occurredAt` do evento (fuso oficial UTC).
Cross-tenant é invisível (a linha "não existe"); o avaliador cai em fail-closed. `valores`/PII **nunca** vão
a log nem ao ledger.

## 7. Escopo NÃO desta Story (AD-11)

Encadeamento/`executionChainId` propagado + prevenção de ciclos + dead-letter administrativo (**4.7**);
a UI/aba "Execuções" read-side (**4.8** — o motor **produz** as linhas que ela lerá); o loop contínuo
robusto multi-réplica com leader election (deployment/4.7); o fluxo separado de continuação de confirmação
humana (§1383, contrato futuro). Nada de abstração especulativa.

## 8. Fontes

- epics.md §1396–1417 (Story 4.6), §1284/§1381–1389 (4.1/4.5), §1355–1363 (4.4).
- Precedentes de código: `DomainEvent`/`event-envelope.ts` (4.3), `automation-principal.ts` +
  `action-revalidation.core.ts` (4.5), `condition-eval.core.ts` + `condition-snapshot.ts` (4.4),
  `card-movement.service.ts` (2.14/2.15/2.16), `card-lifecycle.service.ts` (2.11), `tenant-context.ts`
  (`definirContextoOrg`), migration `20260727120000_domain_events`, `ScanSlot` (3.7).
- Prisma 6.19.3 (Context7 `/prisma/web`): interactive transactions + `$queryRaw`/`Prisma.sql` +
  `FOR UPDATE SKIP LOCKED` ("you don't need a job queue, Postgres already has SKIP LOCKED"); um statement
  raw por chamada (por isso `definirContextoOrg` são `$executeRaw` separados e a claim é um `$queryRaw`).
</invoke>
