# performance-check — Story 4.7

**Status:** APROVADO

## Custo por Execução enfileirada (prevenção)
- 1 `findFirst` (dedup) + 1 `aggregate _min` (início da cadeia, só para filho) + 1 `findFirst`/`create` (visita) +
  1 `create` (Execução). Todas indexadas:
  - dedup: `@@unique(orgId, eventId, automationId, automationVersionId)`.
  - início da cadeia + visita: `@@index(orgId, executionChainId)` e `@@unique(orgId, executionChainId, signature)`.
- Nenhum N+1 novo; a barreira é O(1) por Execução (índices cobrem os predicados).

## Terminação garantida (anti-DoS — o ponto da Story)
- Profundidade (`MAX_CHAIN_DEPTH=10`) + assinatura de visita barram o crescimento; filhos barrados são `HALTED`
  (não reivindicáveis). `drenarOrg` tem teto `MAX_ITERACOES_DRAIN=1000` (belt-and-suspenders). A cadeia SEMPRE termina.
- Fan-out: uma cadeia que EXPANDE (alvos novos) é limitada a `MAX_CHAIN_DEPTH+1` níveis; com múltiplas Automações
  por Evento o fan-out cresce, mas cada ramo é freado por profundidade/assinatura (residual documentado no decision doc).

## Concorrência
- `FOR UPDATE SKIP LOCKED` (4.6) preserva a segurança multi-réplica. A detecção de ciclo é o `@@unique` do banco —
  race-safe sem lock de aplicação (dois workers concorrentes são arbitrados pelo índice).

## Índices adicionados
- `AutomationExecution_orgId_executionChainId_idx`, `AutomationChainVisit_orgId_executionChainId_idx`,
  `AutomationChainVisit_orgId_executionChainId_signature_key` (unique). Escopados a `orgId` (RLS-friendly).

**Veredito:** APROVADO — custo O(1) indexado por Execução; término garantido; concorrência preservada.
