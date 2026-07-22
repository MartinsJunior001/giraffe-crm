# Plan — Story 4.6: Motor de disparo e avaliação

> **Consolidação do gate de Arquitetura** (outbox/fila/retries/backoff/timeout/concorrência/recuperação):
> ver `_bmad-output/implementation-artifacts/decisions/automation-engine-4-6.md` (fonte durável). Este plano
> projeta essa decisão em arquivos concretos. **Não é `EXTERNAL_BLOCKER`** — zero infra nova.

## Contexto7 (gate documental)

- **Prisma 6.19.3** (`/prisma/web`): interactive transactions (`prisma.$transaction(async (tx) => …)`);
  `tx.$queryRaw(Prisma.sql\`…\`)` parametrizado; **um** statement raw por chamada (por isso `definirContextoOrg`
  são `$executeRaw` separados e a claim é um `$queryRaw` isolado); `SELECT … FOR UPDATE SKIP LOCKED` é o padrão
  oficial de claim de job em Postgres. **NestJS 11**: serviços `@Injectable` singleton (o motor **não** é
  request-scoped — não depende de `RequestContext`; recebe o contexto do evento). Fonte registrada; nada inventado.

## Camadas (todas em `apps/api/src/pipes/automations/engine/` + migration)

### 1. Migration `20260728120000_automation_engine`
Duas tabelas (§3 da decisão): `AutomationExecution` (ledger mutável, GRANT UPDATE column-scoped) e
`AutomationActionResult` (append-only, GRANT SELECT/INSERT). RLS ENABLE+FORCE, WITH CHECK INSERT+UPDATE, FK
composta tenant-safe, dedup uniques. `.down` = DROP das duas. Sem backfill. Modelos no `schema.prisma`.
`MODELOS_AUDITADOS += AutomationExecution, AutomationActionResult`.

### 2. Núcleos PUROS (sem I/O — unit test sem banco)
- `engine-dedup.core.ts` — chaves de dedup (Execução e Ação) e a decisão "processar / pular / retomar" a
  partir do estado da Execução existente.
- `retry-policy.core.ts` — `proximaTentativa(attempt)` (backoff exponencial com teto), `esgotou(attempt)`,
  classificação de erro (transitório vs. final). Constantes: `MAX_ATTEMPTS`, `BASE_BACKOFF_MS`, `LEASE_MS`.
- `execution-plan.core.ts` — orquestração pura de ordem/efeitos-parciais: dada a lista de Ações e os
  resultados já gravados, decide a **próxima** Ação a executar e o **estado final** da Execução
  (`SUCCEEDED`/`PARTIAL`/`FAILED`/`BLOCKED_CONFIRMATION`/`SKIPPED_CONDITIONS`).
- `recovery.core.ts` — decisão de reclamar lease vencida vs. respeitar lease viva; `leaseVencida(agora, exp)`.
- `engine-types.ts` — tipos do ledger e do resultado por Ação (estados honestos, errorCode sanitizado).

### 3. Snapshot builder — `snapshot-builder.ts` (I/O sob RLS; fecha DEB-4-4-SNAPSHOT-BUILDER; M-1)
`montarSnapshotEContexto(db, evento) → { snapshot: SnapshotAvaliacao, contexto: ContextoEvento }`. Lê
Card/Record/marcos/saúde/vínculos/campos sob `withTenantContext`. **M-1**: `recordId`/`linkedRecordIds`
filtrados a Registros vinculados a um Card do `pipeId` do evento (via `CardRecordLink` 3.9).

### 4. Executores de Ação — `executors/*.ts` (reusam núcleo puro + tx `definirContextoOrg`)
Um executor por tipo, cada um reusando o núcleo de domínio **já público** e o padrão tx da 2.11/2.14/3.4:
- `CARD_MOVE` → preflight (`transition-preflight` 2.14/2.15) + UPDATE `phaseId` + `registrarEntradaNaFase` +
  `CardHistory MOVED` + `MovementEvent` (o mesmo corpo de `card-movement.service`, sem `RequestContext`/guard).
- `CARD_FINALIZE`/`CARD_ARCHIVE` → `planejarTransicao` (2.11) + UPDATE column-scoped + `CardHistory`.
- `CARD_ASSIGN_RESPONSIBLE` → revalida SC-2101/2102 (2.10) + `CardResponsavel` + `CardHistory`.
- `CARD_SET_FIELD_VALUE` → **confirmação humana** (não executa na Fase 1; `BLOCKED_CONFIRMATION`).
- `RECORD_CREATE`/`RECORD_CREATE_RELATED` → `submission.ts` (2.7) contra a FormVersion publicada + `Record`
  INSERT + `RecordHistory CREATED` (+ `CardRecordLink` no related, idempotente 3.9).
- `RECORD_EDIT` → **confirmação humana** (`BLOCKED_CONFIRMATION`) — sensível (§1383).
Cada executor: idempotente (dedup por Ação antes de agir), tx atômica própria, evento na mesma tx (AD-13),
principal Automação como ator/iniciador na trilha.

> **Nota de confirmação humana (L-1):** `CARD_MOVE`, `CARD_SET_FIELD_VALUE`, `CARD_FINALIZE`, `CARD_ARCHIVE`,
> `RECORD_EDIT` têm `exigeConfirmacaoHumana=true` no catálogo (4.5). O motor da 4.6 **não** as executa
> automaticamente: marca `BLOCKED_CONFIRMATION` e para a cadeia (§1383 — "não mantém job aberto"; continuação
> por fluxo separado é contrato futuro). As Ações **sem** confirmação (`CARD_ASSIGN_RESPONSIBLE`,
> `RECORD_CREATE`, `RECORD_CREATE_RELATED`) executam de fato. Isto mantém a 4.6 dentro do contrato de §1383 sem
> antecipar a máquina de confirmação — e os testes de execução real (a) usam as Ações sem confirmação.

### 5. Serviço orquestrador — `automation-engine.service.ts` (`@Injectable` singleton)
- `drenarPendentes(limite)`: claim `AutomationExecution` PENDING/lease-vencida via `$queryRaw FOR UPDATE SKIP
  LOCKED` sob contexto; para cada, `processarExecucao`.
- `enfileirarParaEvento(tx?, orgId, eventId)`: cria as `AutomationExecution` PENDING (dedup) para as Automações
  ativas do Pipe do evento — chamável no drain (materialização preguiçosa a partir do outbox).
- `processarExecucao(execId)`: monta snapshot → avalia Condições → itera Ações (resolve/revalida/executa/grava
  resultado) → fecha estado via `execution-plan.core`. Backoff/recuperação por `retry-policy`/`recovery`.
- Dispatcher opt-in `onModuleInit` gated por `AUTOMATION_ENGINE_POLL_ENABLED` (default false; **off em teste**).

### 6. Módulo/env
`AutomationsModule` (ou `EngineModule` importado por ele) registra os serviços; `env.ts` ganha
`AUTOMATION_ENGINE_POLL_ENABLED` (bool, default false) e `AUTOMATION_ENGINE_POLL_INTERVAL_MS`.

## Testes
- **Unit** (sem banco): `engine-dedup`, `retry-policy`, `execution-plan`, `recovery`, `snapshot` shape.
- **Integração real** (`test/automation-engine-*.test.ts`): CA1–CA9, com destaque **M-1**, **dedup/at-least-once**,
  **não-ampliação**, **SC-2101/2102**, **recuperação de crash**, **isolamento cross-tenant**, **fase vermelha do
  GRANT** (tentar UPDATE de `eventId`/`automationId` → `permission denied`; tentar DELETE → `permission denied`).
  Conta descartável (`randomUUID`) na **Org C**; DB descartável em porta livre; derrubar só o próprio volume.

## Gates
`pre-implementation-check`, `safe-implementation`, `security-check`, `observability-check`, `migration-check`
(drill de rollback), `performance-check` (índice de fila; sem N+1 no drain), `context7-check` (acima).
