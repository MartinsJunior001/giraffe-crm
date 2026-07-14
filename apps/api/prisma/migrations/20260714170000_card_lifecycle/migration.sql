-- Story 2.11 — ciclo de vida do Card.
--
-- Três estados canônicos e persistentes (ATIVO/FINALIZADO/ARQUIVADO); `reaberto`/`restaurado` são TRANSIÇÕES, não
-- estados. Ao arquivar, o estado anterior (ATIVO ou FINALIZADO) é guardado em `previousLifecycleState` para
-- restaurar de forma confiável. Cada transição escreve um evento próprio no `CardHistory` (append-only), na mesma
-- transação da mudança de estado.
--
-- PONTO ARQUITETURAL — o 1º UPDATE de `Card` em runtime, e ele é COLUMN-SCOPED. A base manteve `Card` append-only
-- (GRANT só SELECT/INSERT desde a 2.7) justamente porque "evoluir estado (2.11)" e "mover entre Fases (2.14)" são
-- UPDATE, e a regra da casa é conceder o privilégio SÓ com o consumidor concreto e o teste que prova o escopo. A
-- 2.11 traz o consumidor do estado — então concede `UPDATE` **apenas** nas colunas de ciclo de vida
-- (`lifecycleState`, `previousLifecycleState`) mais `updatedAt` (o Prisma o toca em todo update). `phaseId`
-- (movimentação, 2.14), `valores`, `orgId` e as demais colunas seguem **sem** privilégio de UPDATE: uma tentativa
-- de mover o Card ou reescrever valores bate em `permission denied` — garantido pelo BANCO, não pela ausência de
-- rota. A migration da 2.14 acrescentará `GRANT UPDATE ("phaseId")` junto do seu consumidor e teste.

-- CreateEnum
CREATE TYPE "CardLifecycleState" AS ENUM ('ATIVO', 'FINALIZADO', 'ARQUIVADO');

-- AlterTable: eixo de ciclo de vida (deny-by-default = ATIVO) + estado anterior ao arquivamento (restauração).
ALTER TABLE "Card" ADD COLUMN "lifecycleState" "CardLifecycleState" NOT NULL DEFAULT 'ATIVO';
ALTER TABLE "Card" ADD COLUMN "previousLifecycleState" "CardLifecycleState";

-- ---------------------------------------------------------------------------
-- GRANT column-scoped: o runtime pode UPDATE SÓ as colunas de ciclo de vida (+ updatedAt). NÃO `phaseId`, NÃO
-- `valores`, NÃO `orgId`. É a fronteira que reconcilia o ciclo de vida (UPDATE de estado) com o Card append-only
-- para movimentação (2.14). O `card_update` policy da RLS (WITH CHECK orgId, desde a 2.7) segue valendo: a linha
-- não pode mudar de Org. Ao conceder um privilégio novo, o teste (card-lifecycle-rls) prova o escopo: UPDATE de
-- estado passa; UPDATE de `phaseId`/`valores` bate em permission denied.
-- ---------------------------------------------------------------------------
GRANT UPDATE ("lifecycleState", "previousLifecycleState", "updatedAt") ON "Card" TO giraffe_app;
