# Gates — Story 2.13 (Saúde temporal derivada do Card)

> Evidência de execução real (Constitution X). PostgreSQL real.

## Gates de qualidade
- **typecheck** (`src`+`test`): ✅ exit 0.
- **format:check** (Prettier): ✅ (arquivos reformatados e reconferidos).
- **lint** (`eslint .`): ✅ exit 0.
- **build** (`nest build`): ✅ exit 0.
- **testes** (suíte cheia, série `--no-file-parallelism`): **556 passed / 556** (65 arquivos) — inclui a 2.13
  (card-health-core 14, card-health-http 3 = **17**) + a regressão do detalhe do Kanban (2.9) agora com
  `saude`/`indicadorDominante`. Zero vermelhos.

## migration-check / backup-check
- **NÃO SE APLICAM.** Story de **leitura pura**: sem migration, sem alteração de schema, sem GRANT novo. `Card`
  segue append-only; `CardPhaseEntry` já tem SELECT no runtime (2.12).

## security-check
- **Autorização (C3 congelado):** leitura reusa `resolverPoderNoPipe` (2.9) — VIEWER concedido lê; sem acesso →
  404 não-enumerante. Testado (200 VIEWER, 404 sem grant).
- **Isolamento:** toda query por `withTenantContext`; `orgId` fora do payload; `valores` (PII) só no detalhe (2.9),
  nunca na lista/log; a saúde derivada não ecoa valor de Campo.
- **Sem escrita:** nenhuma mutação — impossível corromper estado. `Card` intocado (sem UPDATE/GRANT novo).

## observability-check
- Nenhum evento novo (decisão: derivação pura, sem evento — AD-11). Nada logado com PII. A saúde é derivada por
  requisição de leitura, sem estado persistido a auditar.

## Semântica / precedência
- Saúde derivada: expirado > vencido > atrasado > ok (atribuição ascendente); marco ausente ignorado; limiar
  inclusivo. Indicador dominante: ciclo de vida (arquivado/finalizado) vence a saúde, **sem fundir** os dois eixos
  canônicos. Provado por unidade + HTTP (finalizar mantém `saude` canônica).
