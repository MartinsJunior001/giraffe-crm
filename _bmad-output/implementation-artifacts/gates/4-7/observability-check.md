# observability-check — Story 4.7

**Status:** APROVADO

## Estados honestos (UX-DR6 / §1432) — a base da trilha 4.8
- Novo estado TERMINAL `HALTED_BY_LIMIT` ("interrompida por limite") — distinto de `FAILED`/`SUCCEEDED`/`PARTIAL`.
  Uma cadeia barrada NÃO some silenciosamente: vira uma linha de Execução com `state` e `lastErrorCode` explícitos,
  que a 4.8 lerá. "Sem loop silencioso" (§1432) é observável por construção.
- `lastErrorCode` distingue o MOTIVO: `DEPTH_EXCEEDED` / `CYCLE_DETECTED` / `CHAIN_TIMEOUT` — enum estrutural sanitizado.

## Log (Pino) sanitizado
- `automation.chain.halted` (warn): `{ orgId, execId, motivo }` — só ids + motivo estrutural. Nunca `valores`/PII/segredo/stack.
- Reusa o `automation.engine.error` da 4.6 para falha não-transitória. Nenhum log novo carrega payload bruto.

## Rastreabilidade da cadeia
- `executionChainId` (raiz) + `causationId` (causa imediata) + `chainDepth` (nível) na Execução e no Evento —
  permitem reconstruir a árvore causal na trilha (4.8). `correlationId` preservado.
- `AutomationChainVisit` é a prova durável append-only de quais assinaturas a cadeia visitou (auditoria de por que barrou).

## Separação trilha × observabilidade técnica
- A trilha funcional (aba "Execuções") é 4.8; Pino/Sentry seguem sendo observabilidade interna (transversal).
  A 4.7 só PRODUZ as linhas/estados que a 4.8 exibirá.

**Veredito:** APROVADO — estados honestos, logs sanitizados, cadeia rastreável.
