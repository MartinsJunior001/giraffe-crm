# Plano — Evento canônico de movimentação (Story 2.16)

## Contexto técnico

- **Stack:** NestJS 11 · Prisma 6 · PostgreSQL 16 · Vitest 4. Isolamento por RLS (ENABLE+FORCE, WITH CHECK), dois papéis (`giraffe_app`/`giraffe_migrator`), GRANT como fronteira.
- **Ponto de integração:** `apps/api/src/pipes/cards/movement/card-movement.service.ts` — a transação interativa da 2.14 (client raiz, `definirContextoOrg`) já faz UPDATE `phaseId` (guarda otimista) + `registrarEntradaNaFase(MOVE)` + `CardHistory(MOVED)` [+ `CardPhaseValues` da 2.15]. O evento canônico entra como **passo adicional na MESMA tx**.

## Modelo (D0/D1)

- Tabela `MovementEvent` (append-only): `id`, `orgId`, `eventId` (UNIQUE por Org), `pipeId`, `cardId`, `sourcePhaseId`, `targetPhaseId`, `actorId?`, `origin`, `occurredAt` (Timestamptz), `correlationId`, `type`, `version`, `payload` JSONB, `createdAt`. FKs para Organization/Pipe/Card/Phase×2. RLS ENABLE+FORCE + policies por `current_org_id()` + WITH CHECK; GRANT SELECT/INSERT.
- `MODELOS_AUDITADOS += 'MovementEvent'` (`tenant-context.ts`).

## Núcleo puro

- `movement-event.core.ts`: `uuidV5(namespace, name)` (RFC 4122 via `node:crypto` SHA-1, sem dep nova), `derivarEventId(orgId, cardId, correlationId)`, `montarEnvelope(dados): EnvelopeCanonico` (payload mínimo sem PII).

## Emissão

- `mover()` gera `correlationId = randomUUID()` por operação; dentro da tx, após `CardHistory(MOVED)`, `montarEnvelope(...)` + `tx.movementEvent.create(...)`. Rollback integral em falha (atomicidade). Auditoria manual `create MovementEvent`.

## Extensão opt-in (D2)

- Só o produtor + o tipo do envelope exportado. Sem dispatcher/registry/worker (Constitution II — E4/E5 consomem depois).

## Testes (PostgreSQL real)

- `movement-event-core` (puro): uuidv5 determinístico/RFC, derivação idempotente, envelope sem PII.
- `movement-event-rls`: fase vermelha do GRANT (UPDATE/DELETE negados), UNIQUE `(orgId,eventId)`, cross-tenant (WITH CHECK), isolamento.
- `movement-event-http`: CA1 (1 evento com envelope completo), CA2 (bloqueio/no-op não emitem), CA3 (concorrência ≤1 evento, sem 500), atomicidade/sequência (A→B→A → 2 eventos com eventId distintos).

## Gates

`context7-check` (node:crypto/Prisma) · `pre-implementation-check` · `security-check` · `observability-check` · `migration-check` · `commit-check`.
