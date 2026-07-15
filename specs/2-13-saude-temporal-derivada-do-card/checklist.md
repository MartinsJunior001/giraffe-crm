# Checklist — Story 2.13 (Saúde temporal derivada do Card)

## Definition of Ready
- [x] Gate PRD (cálculo/agendamento/fuso = Arquitetura) resolvido pelo dono (derivação pura, sem persistir/evento).
- [x] Dep. 2.11 (lifecycleState) e 2.12 (base de marcos: `calcularMarcos`/`CardPhaseEntry`) mergeadas em `main`.
- [x] Sem migration/schema/GRANT (read-only).

## Implementação
- [ ] Núcleo puro `card-health.core.ts` (`derivarSaude`, `indicadorDominante`, tipos).
- [ ] `verCard` (2.9) expõe `saude` + `indicadorDominante` da entrada atual + `lifecycleState`.
- [ ] Reuso `calcularMarcos`/`lerSnapshotConfig` (2.12) e `resolverPoderNoPipe` (2.9) — nada novo no guard/CASL.

## Validação (Constitution X — evidência real)
- [ ] Unidade: `derivarSaude` (4 estados + ausências + precedência) e `indicadorDominante` (ciclo vence saúde).
- [ ] HTTP: detalhe reflete `atrasado`/`vencido`/`expirado`/`ok` por override determinístico; finalizado/arquivado →
      indicador dominante = ciclo de vida, saúde ainda derivada (eixos distintos); VIEWER lê; sem acesso 404.
- [ ] Suíte cheia verde; typecheck/format/lint/build.

## Invariantes
- [ ] `Fase ≠ Status do Card`; dois eixos canônicos nunca fundidos; `Card` append-only (sem UPDATE novo).
- [ ] `orgId` fora da fronteira; `valores` só no detalhe.
