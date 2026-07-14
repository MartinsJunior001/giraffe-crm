# Clarify — Story 2.11

Dúvidas resolvidas **pelos artefatos** (epics §922-935; CLAUDE.md; migration da 2.7):

1. **Quantos estados persistentes?** Três (ATIVO/FINALIZADO/ARQUIVADO). `reaberto`/`restaurado` são transições, não
   estados (AC explícito).
2. **Como restaurar ao estado certo?** `previousLifecycleState` guarda o estado de origem no arquivamento; a
   restauração o devolve e o zera. (AC: "estado anterior armazenado de forma confiável".)
3. **Transições inválidas?** finalizar/reabrir um ARQUIVADO e restaurar um não-arquivado são inválidas → 409
   (derivado: só as 4 transições dos ACs são válidas; o resto não).
4. **Idempotência?** Pedir o estado em que já se está é no-op sem novo evento (evita duplicar eventos e lost
   updates). Não está no AC literal, mas é a semântica correta e consistente com 2.10.
5. **Quem pode transicionar?** OPERAR o Card (`exigirOperarCard`, 2.10) — transição é operação. (Coerente com
   "usuário autorizado" + o modelo de acesso da 2.10.)
6. **Onde vive o estado?** Coluna em `Card` (o estado é intrínseco ao Card) — 1º UPDATE de `Card`, column-scoped.
7. **`phaseId` pode mudar aqui?** Não — movimentação é 2.14. GRANT não inclui `phaseId` (permission denied).
8. **Recálculo de saúde ao reabrir/restaurar?** É 2.13 (fora de escopo aqui); a 2.11 só gerencia o eixo de ciclo.

Sem escalonamento para o dono: a diretriz da Story ("não conceder UPDATE amplo nem permitir alteração de phaseId")
resolve a única questão arquitetural (column-scoped GRANT). Nenhuma regra foi inventada.
