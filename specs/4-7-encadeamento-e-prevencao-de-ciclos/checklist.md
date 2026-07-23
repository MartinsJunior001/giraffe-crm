# Checklist — Story 4.7

## Encadeamento legítimo
- [x] Executor emite `DomainEvent` na MESMA tx (AD-13), com `causationId`/`executionChainId`/`chainDepth+1`.
- [x] Execução-filha herda `executionChainId` e incrementa `chainDepth`.
- [x] `correlationId` determinístico ⇒ `eventId` retry-safe (sem 2º Evento no retry).

## Prevenção (NFR-7)
- [x] Profundidade máxima barra (`DEPTH_EXCEEDED`) sem executar.
- [x] Assinatura de visita determinística barra re-visita (`CYCLE_DETECTED`) — direto A→A e indireto A→B→A.
- [x] Detecção de ciclo imposta pelo BANCO (`@@unique`), race-safe.
- [x] Redelivery (mesmo `eventId`) NÃO é falso positivo de ciclo.
- [x] Sem falso positivo: cadeias distintas / alvos distintos não barram.
- [x] Timeout de cadeia barra (`CHAIN_TIMEOUT`); fail-closed em cadeia sem idade computável.
- [x] Dead-letter `HALTED_BY_LIMIT` terminal, não reivindicável, motivo sanitizado (AD-30).
- [x] Só a cadeia afetada para; drain com teto de segurança.

## Isolamento / segurança
- [x] `AutomationChainVisit`: RLS ENABLE+FORCE, WITH CHECK INSERT/UPDATE, GRANT só SELECT/INSERT (sem DELETE).
- [x] Cadeia por Org: `orgId` no índice único ⇒ não cruza tenant; cross-tenant read invisível.
- [x] `chainDepth` imutável por GRANT (fora do UPDATE column-scoped).
- [x] `AutomationChainVisit` em `MODELOS_AUDITADOS`.
- [x] Nenhum `orgId`/PII do cliente; visita guarda só ids/assinatura (hash), sem `valores`.

## Migration
- [x] Aditiva; `.down.sql` + drill; enum ADD VALUE (precedente); FK composta tenant-safe onde aplicável.

## Testes
- [x] core (puro) · [x] e2e (a–f, i) · [x] rls (g + imutabilidade). Prova da fase vermelha do GRANT (rls).
