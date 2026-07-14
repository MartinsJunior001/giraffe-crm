# Analyze — Story 2.11

## Cobertura dos Acceptance Criteria
- **ativo→finalizado / ativo→arquivado (com estado anterior)**: `card-lifecycle-http` (finalize; archive guarda
  `previous`). ✅
- **finalizado→reaberto→ativo**: http (reopen). ✅
- **arquivado→restaurado→estado anterior preservado**: http (ATIVO e FINALIZADO round-trips). ✅
- **toda transição gera evento próprio; estado final é canônico**: http (sequência exata dos `type` no Histórico).
  ✅
- **`reaberto`/`restaurado` não persistidos como estados**: o enum só tem 3 valores; reopen/restore levam a
  ATIVO/estado-anterior. Provado por unidade (transitions) + http (estado final). ✅

## Divergências / notas
- **DIV-1 (append-only vs. UPDATE):** a 2.11 introduz o 1º UPDATE de `Card`. Reconciliado por **GRANT
  column-scoped** — `phaseId`/`valores` seguem sem UPDATE (permission denied, provado). A movimentação (2.14)
  acrescentará `GRANT UPDATE ("phaseId")` no seu próprio consumidor.
- **DIV-2 (idempotência não-literal no AC):** decisão de tratar "pedir o estado atual" como no-op sem evento —
  registrada e testada; evita duplicação de eventos e lost update.
- **DIV-3 (colisão de área com a 2.12, em prep paralela):** ambas tocam `Card`/migrations. A 2.12 (prep) foi
  desenhada para NÃO ampliar o GRANT de UPDATE de `Card` (referência de entrada = tabela append-only). Ordenação de
  migrations por timestamp resolve; sem conflito de escopo de GRANT.

## Concorrência
Guarda otimista (`updateMany where lifecycleState`) + reconsulta → idempotente/409; P2002/P2028 → 409. Caminho
presente e coberto estruturalmente (o teste de RLS prova o `count` da guarda; a corrida HTTP não é exercida por ser
flaky, como em 2.7/2.10).

## Veredito
**PRONTO.** ACs cobertos; invariantes preservados (Fase≠Status; sem movimentação; sem exclusão; isolamento por RLS);
fronteira column-scoped provada nos dois sentidos. Red-phase do GRANT via elevação de privilégio foi **bloqueada por
política** (corretamente) — a prova de escopo vem das asserções positiva+negativa do teste de RLS.
