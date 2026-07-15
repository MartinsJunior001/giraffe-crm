# Plan — Story 2.13 (Saúde temporal derivada do Card)

> Decisões resolvidas (dono/Arquitetura, 2026-07-14): saúde = **derivação pura, sem persistir, sem evento**;
> indicador dominante = **função pura em 2.13, consumo no E7**. Ver `spec.md §Decisões`. Story **read-only, sem
> migration/schema/GRANT** (como a 2.9).

## Núcleo puro — `apps/api/src/pipes/cards/health/card-health.core.ts`
- `type SaudeTemporal = 'ok' | 'atrasado' | 'vencido' | 'expirado'`.
- `type IndicadorDominante = 'arquivado' | 'finalizado' | 'expirado' | 'vencido' | 'atrasado' | 'ok'`.
- `derivarSaude(marcos: Marcos, agora: Date): SaudeTemporal` — atribuição ASCENDENTE por severidade (esperado →
  atrasado; vencimento → vencido; expiração → expirado), marco `null` ignorado. Como `esperado ≤ vencimento ≤
  expiração` (invariante 2.12), passar a expiração implica os demais → resultado é o mais severo alcançado. Sem
  marco algum → `ok`. Reusa o tipo `Marcos` de `phase-milestones.core` (2.12).
- `indicadorDominante(lifecycleState: string, saude: SaudeTemporal): IndicadorDominante` — `ARQUIVADO`→`arquivado`;
  `FINALIZADO`→`finalizado`; senão (ATIVO) → a `saude`. Implementa a precedência `arquivado > finalizado > [eixo de
  saúde]`; NÃO funde os eixos (ambos seguem expostos).

## Exposição — `kanban-read.service.ts` (`verCard`, 2.9)
- `verCard` já carrega `valores` + `lifecycleState` + `phaseId`. Adicionar: ler a **entrada atual** do Card
  (`cardPhaseEntry.findFirst` por `[enteredAt desc, id desc]`, `select {enteredAt, configSnapshot}`); computar
  `marcos = calcularMarcos(enteredAt, lerSnapshotConfig(configSnapshot), valores)` (reuso 2.12); `saude =
  derivarSaude(marcos, new Date())`; `indicadorDominante = indicadorDominante(lifecycleState, saude)`.
- Adicionar `saude` e `indicadorDominante` a `CardDetalheVisao.card`. `orgId` fora da fronteira; `valores` já
  saem só no detalhe (2.9). Sem novo GRANT: `CardPhaseEntry` tem SELECT no runtime (2.12).
- **Sem entrada** (defensivo — não deveria após 2.12/backfill): saúde derivada de marcos vazios → `ok`.

## Autorização (C3 congelado)
Reusa a guarda de leitura da 2.9: `resolverPoderNoPipe` (qualquer poder ≥ ler; VIEWER concedido lê; sem acesso →
404 não-enumerante). Nada novo no guard/CASL.

## Sem migration / sem GRANT
Story de LEITURA pura sobre `Card`/`CardPhaseEntry`/`Phase` já materializados. `Card` segue append-only (nenhum
UPDATE novo). `CardPhaseEntry` já tem SELECT no runtime (2.12). Nada de schema.

## Sequência de teste (red-green-mutação; PostgreSQL real onde tocar HTTP)
1. **Unidade (núcleo puro)** — `card-health-core.test.ts`: `derivarSaude` nos quatro estados e nas ausências de
   marco (só expiração passada → `expirado`; sem marcos → `ok`; precedência ascendente); `indicadorDominante`
   (ARQUIVADO/FINALIZADO vencem a saúde; ATIVO → a saúde). Mutação: inverter a ordem de severidade deve quebrar.
2. **HTTP (detalhe)** — `card-health-http.test.ts`: pipe com 3 Campos DATE (esperado/vencimento/expiração) +
   config apontando cada marco ao seu Campo; Cards com datas de override **passadas/futuras** (determinístico, ex.:
   `2020-01-01` passado, `2999-01-01` futuro) exercem `atrasado`/`vencido`/`expirado`/`ok`; Card sem marcos → `ok`;
   **finalizar** um Card "atrasado" → `indicadorDominante='finalizado'` mas `saude='atrasado'` (eixos distintos);
   **arquivar** → `indicadorDominante='arquivado'`. Autorização: VIEWER concedido lê; sem acesso → 404.

## Não-implementado de propósito (AD-11)
Persistência de `healthState` e emissão de evento de mudança de saúde (sem consumidor concreto — 2.17/E5/2.14);
priorização/badges no Dashboard e re-filtragem da LISTA do Kanban (E7). Nenhum estado combinado materializado.
