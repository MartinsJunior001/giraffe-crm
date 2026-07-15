# Spec — Story 2.13 (Saúde temporal derivada do Card)

> Rastreabilidade: FR-10; PRD D2.3 (estados/saúde), D2.7 (marcos). epics.md §953-966. Dep.: 2.11 (ciclo de vida),
> 2.12 (base de marcos). **Fora:** configuração de marcos (2.12); priorização no Dashboard (E7).

## Objetivo
Derivar o **eixo de saúde temporal** do Card — `ok`/`atrasado`/`vencido`/`expirado` — a partir dos **marcos reais**
materializados pela 2.12 (instante de entrada + snapshot de config + override do Card), e expor o **indicador
dominante** de apresentação (precedência `arquivado > finalizado > expirado > vencido > atrasado > ok`) **sem**
substituir os dois eixos canônicos (ciclo de vida + saúde).

## Decisões do dono/Arquitetura (2026-07-14, `AskUserQuestion`) — gate PRD "cálculo/agendamento = Arquitetura"
- **Saúde = DERIVAÇÃO PURA, sem persistir, sem evento (só leitura).** A saúde é 100% calculada na leitura por função
  pura sobre a base da 2.12 (marcos vs. "agora"); a 2.13 **não** adiciona coluna, **não** persiste estado e **não**
  emite evento. Coerente com "sem agendador" (decisão 2.12), com o Kanban só-leitura (2.9) e com **AD-11** (o evento
  de mudança de saúde e a persistência só entram com consumidor concreto — o painel de histórico é 2.17, a
  notificação proativa é E5, o gatilho de escrita é a movimentação 2.14/automação E4). `Card` segue **append-only**
  (nenhum 2º UPDATE column-scoped nesta Story).
- **Indicador dominante = função pura em 2.13; consumo no E7.** A 2.13 expõe os dois eixos canônicos e uma função
  pura `indicadorDominante` (a precedência); **sem** estado combinado persistido (epics: "não substitui os dois
  valores canônicos"). O Dashboard/priorização consome no E7.

## Escopo
- **Núcleo puro `card-health.core.ts`:** `derivarSaude(marcos, agora)` (ok/atrasado/vencido/expirado, marco ausente
  ignorado; precedência interna expirado > vencido > atrasado > ok) e `indicadorDominante(lifecycleState, saude)`
  (ARQUIVADO→`arquivado`, FINALIZADO→`finalizado`, ATIVO→a saúde). Sem I/O.
- **Exposição no detalhe do Card (2.9 `verCard`):** adicionar `saude` e `indicadorDominante` ao `CardDetalheVisao`,
  calculados a partir da **entrada atual** (`CardPhaseEntry` mais recente) + `valores` do Card (`calcularMarcos` da
  2.12) + `lifecycleState` (2.11). **Sem** nova rota, **sem** migration, **sem** GRANT novo.
- **Suspensão sob ciclo de vida inativo:** enquanto FINALIZADO/ARQUIVADO, o **indicador dominante** é o ciclo de
  vida (a saúde não é o efetivo); os dois eixos permanecem canônicos e distintos. Ao reabrir/restaurar para ATIVO, a
  saúde volta a ser derivada dos marcos (automático, pois é pura na leitura — não há estado a "recalcular").

## Fora de escopo
Configuração de marcos (2.12); **emissão de evento** de mudança de saúde e **persistência** de `healthState`
(decisão: derivação pura — sem consumidor concreto ainda, AD-11); a **movimentação** que reinicia os marcos (2.14); a
**priorização/badges no Dashboard** e a re-filtragem da LISTA do Kanban por estado (E7 / consumidor concreto futuro —
a lista 2.9 exclui `valores` por NFR/PII, e a saúde com override depende de `valores`, logo vive no **detalhe**).

## Invariantes preservados
`Fase ≠ Status do Card` (saúde e ciclo de vida são eixos distintos da Fase); os **dois eixos canônicos** nunca são
fundidos num estado único (o indicador dominante é só apresentação); deny-by-default e autorização de leitura por
poder no Pipe (`resolverPoderNoPipe`, reuso 2.9 — VIEWER concedido lê); **C3/guard/`ability.ts` congelados**; `Card`
**append-only** (AD-11 — sem persistir saúde sem consumidor); override por `Field.id` nunca rótulo (AD-12, herdado
da 2.12); isolamento por Organização pelo banco.
