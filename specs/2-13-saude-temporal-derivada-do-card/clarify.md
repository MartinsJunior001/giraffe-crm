# Clarify — Story 2.13 (Saúde temporal derivada do Card)

## Perguntas resolvidas (gate PRD "cálculo/agendamento = Arquitetura", via `AskUserQuestion` 2026-07-14)
1. **A saúde muda com o TEMPO, não por escrita, e a 2.12 decidiu sem agendador. Como tratar?**
   → **Derivação PURA, sem persistir, sem evento (só leitura).** Sem coluna, sem GRANT, sem agendador. O evento de
   mudança de saúde e a persistência ficam para quando houver consumidor concreto (2.17/E5/2.14) — AD-11.
2. **Indicador dominante (precedência) — onde?**
   → **Função pura em 2.13; consumo no E7.** Sem estado combinado persistido; os dois eixos canônicos permanecem.

## Pontos derivados dos artefatos (não inventados)
- Saúde: `atrasado` após o prazo esperado; `vencido` após o vencimento; `expirado` após a expiração; **marco ausente
  é ignorado** — "sem o marco, o estado não se aplica" (epics §966; PRD §899). Sem marco algum → `ok`.
- Precedência do indicador dominante: `arquivado > finalizado > expirado > vencido > atrasado > ok` (PRD §897) —
  **só apresentação**, não substitui os eixos.
- Enquanto FINALIZADO/ARQUIVADO: a apresentação prioriza o ciclo de vida; a saúde "não continua gerando transições"
  (epics §962). Como a derivação é pura na leitura, não há transição/estado a suspender — o `indicadorDominante`
  simplesmente devolve o ciclo de vida. Ao reabrir/restaurar para ATIVO, a saúde volta a ser derivada (automático).

## Sem ambiguidade remanescente
Nenhuma decisão de dono/Arquitetura em aberto. Story read-only, sem schema.
