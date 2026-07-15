# Analyze — Story 2.13 (Saúde temporal derivada do Card)

## Cobertura dos Acceptance Criteria (epics §966)
- **AC1** (Card ativo, prazo esperado passou → `atrasado`; após vencimento → `vencido`; após expiração →
  `expirado`; sem o marco, não se aplica): coberto por `derivarSaude` (unidade) e pelo detalhe HTTP com override
  determinístico (datas passadas/futuras). ✅
- **Dois eixos canônicos + precedência de apresentação** (PRD §897): `indicadorDominante` (unidade + HTTP:
  finalizado/arquivado vencem a saúde, sem fundir os eixos). ✅
- **Suspensão sob inativo / recálculo ao reabrir** (epics §962): como a derivação é pura na leitura, reabrir devolve
  automaticamente a saúde derivada; enquanto FINALIZADO/ARQUIVADO o dominante é o ciclo de vida. ✅ (HTTP)

## Consistência com a arquitetura vigente
- **Read-only, sem schema** — espelha a 2.9 (Kanban/detalhe). `Card` segue append-only; nenhum UPDATE/GRANT novo.
- **Reuso** de `calcularMarcos`/`lerSnapshotConfig` (2.12) e `resolverPoderNoPipe` (2.9). C3/guard/CASL intocados.
- **AD-11** respeitado: sem persistir `healthState` nem emitir evento (sem consumidor concreto — 2.17/E5/2.14).

## Divergências / riscos
- **DIV-2.13-1 (resolvida):** o comentário legado (bloco 2.11 do CLAUDE.md) atribuía a "re-filtragem da LISTA do
  Kanban por estado" à 2.13. Não é AC da 2.13 (epics §959-963 tratam só do eixo de saúde) e a saúde com override
  depende de `valores` (fora da LISTA por PII/NFR — 2.9). Fica para consumidor concreto no E7. A 2.13 expõe a saúde
  no **detalhe**.
- **"Agora" (relógio):** `new Date()` do servidor (instante UTC), comparado aos marcos `Timestamptz` da 2.12 — sem
  ambiguidade de fuso (herda a decisão da 2.12). Determinismo do teste garantido por datas de override extremas.

## Veredito
Escopo derivado apenas dos artefatos; sem decisão pendente. Pronto para implementação.
