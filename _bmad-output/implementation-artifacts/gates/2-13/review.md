# Revisão adversarial (4 lentes) — Story 2.13 (Saúde temporal derivada do Card)

> Revisão inline pelo implementador (contexto completo). Risco: **BAIXO** — leitura pura, sem schema/migration/GRANT;
> `Card` intocado (append-only). O risco real é semântico (derivação correta + não fundir os eixos).

## Lente Architecture
- **Derivação pura na leitura** (decisão do dono): `derivarSaude` é função pura sobre a base da 2.12; nenhuma coluna,
  nenhum agendador, nenhum evento. Coerente com 2.12 (sem agendador) e 2.9 (Kanban só-leitura). ✅
- **AD-11 respeitado:** sem persistir `healthState` nem emitir evento — o consumidor concreto (histórico 2.17,
  notificação E5, gatilho de escrita 2.14/E4) não existe. `Card` segue **append-only** (nenhum UPDATE novo). ✅
- **Dois eixos canônicos preservados:** `lifecycleState` (2.11) e `saude` (2.13) expostos separadamente;
  `indicadorDominante` é só resumo de apresentação (não um 3º estado persistido). `Fase ≠ Status do Card`. ✅
- **Reuso** de `calcularMarcos`/`lerSnapshotConfig` (2.12) e `resolverPoderNoPipe` (2.9). C3/guard/CASL intocados. ✅

## Lente Security
- **Autorização de leitura** reusa a 2.9 (`resolverPoderNoPipe`): VIEWER concedido lê (ler ≠ operar); sem acesso →
  404 não-enumerante. Testado (VIEWER 200; Bruno sem grant 404). ✅
- **Isolamento:** toda query por `withTenantContext`; `CardPhaseEntry`/`Card`/`Phase` sob RLS. `orgId` fora do
  payload. ✅
- **PII:** `valores` lidos para o cálculo do override (herança 2.12) e já expostos só no **detalhe** (2.9), nunca na
  lista nem em log; a saúde derivada não vaza valor de Campo. ✅
- **Sem escrita:** nenhum UPDATE/INSERT — impossível corromper estado por esta superfície. ✅

## Lente Edge
- **Precedência da saúde** (expirado > vencido > atrasado > ok) por atribuição ascendente; marco ausente ignorado
  ("sem o marco, o estado não se aplica"); só expiração passada → `expirado` (atrasado/vencido não se aplicam).
  ✅ testado (unidade).
- **Limiar inclusivo** (`agora >= marco`): no instante exato do marco a saúde já escala. ✅ testado.
- **Ciclo de vida vence a saúde:** FINALIZADO/ARQUIVADO → indicador dominante = ciclo, mas `saude` canônica
  permanece derivada (eixos distintos). ✅ testado (finalizar mantém `saude='atrasado'`).
- **Card sem entrada** (defensivo, não deveria após 2.12/backfill): marcos vazios → `saude='ok'`. Coberto por
  construção (ramo `entrada ? ... : {vazio}`).
- **Determinismo do teste:** datas de override extremas (`2020`/`2999`) tornam o veredito independente do relógio
  real além de "passado < agora < futuro".

## Lente Acceptance (AC 2.13)
- **AC1** (ativo, prazo esperado passou → atrasado; vencimento → vencido; expiração → expirado; sem marco → não se
  aplica): ✅ unidade + HTTP.
- **Dois eixos + precedência de apresentação** (PRD §897): ✅ `indicadorDominante`.
- **Recálculo ao reabrir / suspensão sob inativo** (epics §962): ✅ por construção (derivação pura na leitura;
  finalizar/arquivar mudam só o dominante).

## Boundary registrado (fora de escopo, não é bug)
- **Sem evento/persistência de saúde** (decisão do dono, AD-11) — entra com consumidor concreto (2.17/E5/2.14).
- **Sem re-filtragem da LISTA do Kanban por estado / badges no Dashboard** — E7; a saúde com override depende de
  `valores` (fora da LISTA por PII/NFR — 2.9), logo vive no **detalhe**.
- **Movimentação** que reinicia marcos = 2.14.

## Veredito
Sem defeito de correção aberto. Derivação e precedência provadas por teste; autorização/isolamento herdados e
verificados. **Pronto para commit** (condicionado à suíte cheia verde).
