# Analyze — Story 4.8: Trilha de Execuções (cross-artifact consistency)

> `analyze` do Spec Kit: consistência entre epics §1439–1453, o decision doc, o plano/tarefas e a implementação.
> Não-destrutivo; registra veredito e resíduos.

## Cobertura dos requisitos (§1444 — conjunto mínimo)

| Campo do §1444 | Exposto | Fonte |
|---|---|---|
| `executionId` | ✅ | `AutomationExecution.id` |
| Automação e **versão utilizada** | ✅ | `automationId` + `name` + `automationVersionId` + `configSnapshotRevision` |
| Evento e tipo | ✅ | `DomainEvent.eventType` (via `eventId`) |
| estado da avaliação | ✅ | `avaliacaoCondicoes` (agregado — D6) |
| **resultado de cada Condição** | ⚠️ agregado | não persistido (4.4/4.6); `DEB-4-8-CONDICOES-POR-CONDICAO` |
| Ações na ordem configurada + estado individual | ✅ | `AutomationActionResult` por `actionIndex` (detalhe) |
| tentativa atual e total | ✅ tentativa | `attempt`. "Total" (MAX_ATTEMPTS) é constante do motor (4.6/4.7), não por-linha — exposto como `tentativa`; o teto é de config do motor |
| sucesso/parcial/falha/bloqueada/aguardando/interrompida por limite | ✅ | `state` (8 estados distintos) |
| ator | ✅ | Automação (`automationId`/`name`) |
| iniciador | ✅ | `initiatorType`/`initiatorAccountId`/`initiatorAutomationId` |
| origem | ✅ | `DomainEvent.origin` |
| principal Automação | ✅ | `automationId`/`name` |
| início/fim/duração | ✅ | `startedAt`/`finishedAt`/`duracaoMs` |
| `correlationId` | ✅ | `AutomationExecution.correlationId` |
| `executionChainId` | ✅ | idem + `chainDepth` |
| código de erro sanitizado | ✅ | `lastErrorCode`/`errorCode` (`^[A-Z_]+$`) |
| motivo legível | ✅ | `motivoLegivel` (mapa estático) |

**Resíduo consciente:** "tentativa atual e total" — o "total" é o teto `MAX_ATTEMPTS` (motor), não um dado por
Execução; exposto o número da tentativa atual. Registrado; não bloqueia (o estado final é honesto: `FAILED`/
`MAX_ATTEMPTS_EXCEEDED`).

## Consistência com invariantes/AD

- **AD-30/NFR-1/8/16 (sanitização):** allowlist em `execution-view.ts`; asserção negativa no e2e; `motivoLegivel`
  fail-closed no eco. ✅
- **AD-15 (trilha de integração ≠ observabilidade):** trilha lê `AutomationExecution`/`DomainEvent`; sem Pino/Sentry
  na fronteira; separação §1449 preservada. ✅
- **AD-11 (sem antecipar consumidor):** débitos com consumidor futuro, nada especulativo materializado. ✅
- **Isolamento multi-tenant:** `withTenantContext` em toda query; `orgId` fora da fronteira; cross-tenant → 404. ✅
- **C3 congelado:** `ability.ts` intocado; autz fina no serviço via `pipe-authz`. ✅
- **4.6/4.7 intocados:** nenhuma alteração em `engine/`/`chain-guard.core.ts`; regressão verde. ✅
- **Read-side puro:** sem migration, sem GRANT, sem mutação. `prisma generate` sem diff. ✅

## Duplicação / conflito

- Nenhum segundo builder/segunda projeção: a projeção vive só em `execution-view.ts`.
- Rota `automation-executions` (segmento estático distinto) evita colisão com `automations/:automationId`.

## Veredito: CONSISTENTE. Prosseguir para implementação (já concluída) e gates.
