# Story 2.11 — Ciclo de vida do Card

**Status:** review → done (após merge).
**Rastreabilidade:** FR-10; D2.3; AD-13. **Dep.:** 2.7, 2.9, 2.10.

## História
Como usuário autorizado, quero concluir, arquivar, reabrir e restaurar Cards, para refletir o andamento do trabalho
sem perder dados.

## Decisão central
O ciclo de vida é o **1º UPDATE de `Card`** em runtime — concedido **column-scoped**
(`lifecycleState`/`previousLifecycleState`/`updatedAt`), sem `phaseId` (movimentação = 2.14) nem `valores`. Estados
canônicos `ATIVO`/`FINALIZADO`/`ARQUIVADO`; `reaberto`/`restaurado` são transições; o estado anterior ao
arquivamento é preservado em `previousLifecycleState`.

## Dev Agent Record

### Artefatos
- `apps/api/prisma/schema.prisma` — enum `CardLifecycleState`; colunas `lifecycleState`/`previousLifecycleState`.
- `apps/api/prisma/migrations/20260714170000_card_lifecycle/migration.sql` — colunas + **GRANT UPDATE
  column-scoped**.
- `apps/api/src/pipes/cards/lifecycle/card-lifecycle.transitions.ts` — núcleo puro `planejarTransicao`.
- `.../card-lifecycle.service.ts` — transição atômica (tx interativa + guarda otimista + evento `CardHistory`),
  `exigirOperarCard`.
- `.../card-lifecycle.controller.ts` — `POST cards/:cardId/{finalize|reopen|archive|restore}` → 200.
- `apps/api/src/pipes/pipes.module.ts` — registro.
- `apps/api/src/pipes/cards/kanban-read.service.ts` — `lifecycleState` no detalhe do Card.
- Testes: `card-lifecycle-transitions` (12), `card-lifecycle-http` (9), `card-lifecycle-rls` (6) = 27.

### Gates
typecheck/lint/prettier/build ✅; suíte cheia 513/515 (2 vermelhos ambientais pré-existentes). Ver
`gates/2-11/{pre-implementation-check,gates,review}.md`.

### Notas
- Red-phase do GRANT por elevação de privilégio bloqueada por política (correto); escopo provado pelas asserções
  positiva+negativa do teste de RLS.
- Boundary: re-filtragem da LISTA do Kanban por estado é 2.13 (a 2.11 só expõe o estado no detalhe).
