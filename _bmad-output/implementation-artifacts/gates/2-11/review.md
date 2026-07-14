# Revisão adversarial (4 lentes) — Story 2.11

> Revisão inline pelo implementador (contexto completo). Risco: **ALTO** (1º UPDATE de `Card` — precisa não abrir
> movimentação nem reescrita de dados).

## Lente Architecture
- **Reconciliação append-only × ciclo de vida:** GRANT UPDATE **column-scoped** (só estado + `updatedAt`) é a
  fronteira exata pedida ("não conceder UPDATE amplo nem permitir alteração de `phaseId`"). Pré-registrada na
  migration da 2.7. ✅
- **Eixo independente:** `lifecycleState` não toca `phaseId` — `Fase ≠ Status do Card` preservado. ✅
- **Núcleo puro** (`planejarTransicao`) separa a decisão (testável sem banco) da aplicação (tx atômica). ✅
- **`CardHistory` reusado** (append-only), só novos `type` — sem tabela/GRANT novo para o histórico. ✅

## Lente Security
- **Column-scope provado nos dois sentidos:** estado→count 1; `phaseId`/`valores`→permission denied. ✅
- **Isolamento RLS:** UPDATE de estado de outra Org casa 0; WITH CHECK impede mover de Org. ✅
- **Autz OPERAR o Card** (2.10): 404 sem acesso, 403 só-lê. ✅
- **Sem 500 em corrida:** guarda otimista + P2002/P2028→409. ✅
- **Sem vazamento:** `orgId` fora do payload; `valores` intocados/não logados. ✅

## Lente Edge
- Idempotência (sem novo evento) em finalizar/reabrir/arquivar já-no-alvo. ✅ testado.
- Preservação do `previous` (FINALIZADO→arquivar→restaurar volta a FINALIZADO). ✅ testado.
- Transições inválidas (finalizar/reabrir ARQUIVADO; restaurar não-arquivado) → 409. ✅ testado.
- Corrida benigna (outro venceu com o MESMO alvo) → idempotente; divergente → 409. Código presente; não exercido
  por HTTP concorrente (flaky) — coberto estruturalmente e pelo `count` da guarda no teste de RLS.
- Defesa: ARQUIVADO sem `previous` → restaura para ATIVO. ✅ testado (unidade).

## Lente Acceptance (AC 2.11)
- Os 4 ACs cobertos (ver analyze.md): estados/transições, preservação do anterior, evento por transição, estado
  final canônico, `reaberto`/`restaurado` não persistidos. ✅

## Boundary registrado (fora de escopo, não é bug)
- A **lista** do Kanban (2.9) ainda não filtra por estado de ciclo de vida (Cards arquivados/finalizados aparecem
  nas colunas). A apresentação por estado é a **2.13** (precedência ciclo>saúde). A 2.11 só expõe o `lifecycleState`
  no **detalhe** — sem consumidor concreto para a re-filtragem da lista.

## Veredito
Sem defeito de correção aberto. Gates verdes (2 vermelhos ambientais pré-existentes). **Pronto para commit.**
