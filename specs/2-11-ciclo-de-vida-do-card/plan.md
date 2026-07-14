# Plan — Story 2.11 (Ciclo de vida do Card)

## Decisão de arquitetura (não é decisão em aberto — derivada dos artefatos e do consumidor concreto)
**O 1º UPDATE de `Card` é column-scoped.** A base manteve `Card` append-only (GRANT SELECT/INSERT desde a 2.7)
porque "evoluir estado (2.11)" e "mover entre Fases (2.14)" são UPDATE e a regra é conceder o privilégio só com o
consumidor e o teste. A 2.11 traz o consumidor do estado ⇒ concede `UPDATE` **apenas** em
`lifecycleState`/`previousLifecycleState`/`updatedAt`. Alternativa rejeitada: tabela separada `CardLifecycle`
(manteria `Card` 100% append-only) — rejeitada porque (a) o estado é intrínseco ao Card (o AC fala "o Card fica
finalizado"), (b) a diretriz permite UPDATE **narrow** ("não conceder UPDATE amplo"), (c) a 2.7 já registrou que a
2.11 acrescenta GRANT UPDATE ao próprio `Card`. O column-scope satisfaz "não permitir alteração de `phaseId`".

## Modelo de dados
- Enum `CardLifecycleState { ATIVO FINALIZADO ARQUIVADO }`.
- `Card.lifecycleState CardLifecycleState @default(ATIVO)` (NOT NULL) — eixo de ciclo de vida.
- `Card.previousLifecycleState CardLifecycleState?` — estado antes do arquivamento; restauração confiável.
- `CardHistory` reusado (2.7): só novos `type` (`FINALIZED`/`REOPENED`/`ARCHIVED`/`RESTORED`). Sem mudança de
  tabela/GRANT (append-only já garante o histórico das transições).

## Migration (`..._card_lifecycle`)
`CREATE TYPE CardLifecycleState`; `ALTER TABLE Card ADD lifecycleState DEFAULT 'ATIVO' NOT NULL`, `ADD
previousLifecycleState`; `GRANT UPDATE ("lifecycleState","previousLifecycleState","updatedAt") ON "Card" TO
giraffe_app`. **Reversível/segura:** aditiva; default ATIVO (deny-by-default); nenhuma coluna removida; backfill
trivial (Cards existentes nascem ATIVO pelo default). **Rollback:** DROP das colunas + REVOKE do GRANT (o runtime
volta a append-only); nenhum dado destruído além do eixo novo. **Backup:** não requer — sem transformação
destrutiva de dado existente.

## Núcleo puro (`card-lifecycle.transitions.ts`)
`planejarTransicao(acao, atual, previous)` → `transicao | idempotente | invalido`. Toda a matriz decidida sem banco
(testável em unidade). O serviço apenas APLICA o plano.

## Serviço (`cards/lifecycle/card-lifecycle.service.ts`)
`finalizar/reabrir/arquivar/restaurar` → `transicionar(cardId, acao)`: `exigirOperarCard` → lê estado → planeja →
idempotente devolve; inválido → 409; senão transação interativa (guarda otimista `updateMany where lifecycleState`
+ evento `CardHistory` na mesma tx). `count = 0` → reconsulta → idempotente/409. P2002/P2028 → 409.

## Controller (`cards/lifecycle/card-lifecycle.controller.ts`)
`POST cards/:cardId/{finalize|reopen|archive|restore}` → 200 (transições, não criação). `@Requer('ler','Pipe')`.

## Leitura
`lifecycleState` adicionado ao **detalhe** do Card (`KanbanReadService.verCard`) — superfície natural do estado, que
a 2.13 consumirá. Sem re-filtrar a LISTA do Kanban por estado (apresentação é 2.13).

## Sequência de teste (red-green; PostgreSQL real)
1. Unidade: `planejarTransicao` — matriz completa (válida/idempotente/inválida; preservação do `previous`).
2. HTTP: transições, idempotência (sem novo evento), inválidas → 409, autz (404 sem acesso / 403 só-lê), eventos no
   Histórico, detalhe reflete o estado.
3. RLS: GRANT column-scoped — UPDATE de estado permitido (count 1), `phaseId`/`valores` → permission denied;
   isolamento (UPDATE de estado de outra Org casa 0).

## Não-implementado de propósito
Saúde temporal (2.13); movimentação/`phaseId` (2.14); re-filtragem da lista por estado; timeline do Histórico (2.17).
