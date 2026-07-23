# Analyze — Story 4.7 (consistência cross-artefato)

## Cobertura dos CA
| CA | Prova |
| --- | --- |
| CA1 (encadeamento propaga cadeia/causação/profundidade) | e2e (a) |
| CA2 (assinatura já executada não repete — A→A e A→B→A) | e2e (b), (c) |
| CA3 (limite interrompe só a cadeia, com motivo, sem loop silencioso) | e2e (d), (f), (i) |
| CA4 (fail-closed) | core (`avaliarBarreira` null start ⇒ CHAIN_TIMEOUT) + e2e (f) |
| CA5 (sem falso positivo) | e2e (e) cadeias distintas; (d) alvos distintos rodam |
| CA6 (cadeia por Org) | rls (g): unique por orgId; cross-tenant read invisível |

## Consistência com invariantes
- **Isolamento-mãe**: `AutomationChainVisit` RLS FORCE + WITH CHECK; toda query por `withTenantContext`; `orgId`
  nunca do cliente; cadeia por Org (índice inclui `orgId`).
- **GRANT como fronteira**: visita append-only (SELECT/INSERT); `chainDepth` INSERT-only (imutável por GRANT).
- **AD-30 (sanitização)**: `lastErrorCode` é enum estrutural; a visita guarda hash + ids, nunca `valores`/PII.
- **AD-13 (sem Evento sem fato)**: o Evento-filho nasce na tx do fato que o gerou.
- **AD-11 (sem antecipar)**: trilha (4.8), extensão (4.9), driver contínuo e re-drive de dead-letter deferidos.

## Riscos residuais (débitos)
- `DEB-4-7-REPROCESSAMENTO` (re-drive administrativo de dead-letter — 4.8/admin).
- `DEB-4-7-CHILD-EVENT-SWEEP` (Evento-filho órfão se a Execução lançar erro inesperado após emitir — coberto
  pelo driver contínuo deferido; caminho feliz OK).
- `DEB-4-7-ACTION-EXEC-TIMEOUT-HARD` (timeouts por Ação/Execução são guardas lógicos + lease físico; a duração
  da CADEIA é dura no enfileiramento).

## Divergências
Nenhuma divergência material com PRD/Arquitetura/epics.md. Os NÚMEROS do gate foram consolidados por derivação
(4.6) + defaults conservadores, documentados no decision doc — nenhum exigiu decisão de Produto (não é EXTERNAL_BLOCKER).
