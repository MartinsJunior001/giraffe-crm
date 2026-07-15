# Research — Story 2.14 (Movimentação e regras de transição)

> Fase 0. A epics.md marca a 2.14 com **Gates: —** (sem gate explícito de dono). As decisões abaixo têm **default
> justificado** pela Constitution/epics; nenhuma constitui `NEEDS CLARIFICATION` real. D1 e D2 definem contrato que
> 2.15/E4/E5 herdam — são confirmadas com o dono no `clarify`, mas já nascem com recomendação e alternativa.

## D1 — Forma do contrato de preflight

- **Decisão:** lista **ordenada de validadores PUROS** (funções `ValidadorDeTransicao`) composta pelo serviço, com
  um **ponto de extensão documentado**. **SEM** DI/registry.
- **Racional:** Constitution — "sem abstração especulativa sem consumidor concreto". Os validadores built-in da 2.14
  são os consumidores concretos; 2.15 (Formulário de Fase) e E4/E5 acrescentam validadores **à lista** sem reescrever
  o serviço. Espelha `card-lifecycle.transitions.ts` (núcleo puro decide, serviço aplica).
- **Alternativas consideradas:** registry por DI / event bus de validadores — rejeitado: nenhum consumidor concreto
  exige **resolução dinâmica** em runtime na Fase 1; introduziria um framework de plugins vazio (proibido —
  `kernel/README.md`).

## D2 — Representação da confirmação humana

- **Decisão:** flag explícita **`confirmado: true`** no request, tratada como **validador de preflight** (ausência
  ou `false` ⇒ bloqueio).
- **Racional:** R2/D2.4 — "mover exige confirmação explícita, nunca contornada". Mantém a confirmação no **contrato**
  (dado do request), não em estado de sessão; testável como validador puro.
- **Alternativas consideradas:** header dedicado, doble-submit, step de confirmação server-side — rejeitado: nenhum
  agrega garantia sobre a flag no corpo e todos aumentam a superfície sem requisito.

## D3 — GRANT column-scoped de `phaseId` (NÃO blanket)

- **Decisão:** `GRANT UPDATE ("phaseId") ON "Card" TO giraffe_app` — **additivo** ao column-scoped da 2.11
  (`lifecycleState`/`previousLifecycleState`/`updatedAt`). **Não** `GRANT UPDATE ON "Card"` (blanket).
- **Racional:** invariante da casa — `valores`/`orgId` **nunca** recebem GRANT de UPDATE (CLAUDE.md). Diverge da
  **letra** do Apêndice A da spec 2.9 (que escreveu `GRANT UPDATE ON "Card"`), a favor do invariante. `updatedAt`
  **já** foi concedido pela 2.11. A migration da 2.7 antecipou este escopo ("UPDATE ... para a movimentação — 2.14").
- **Não é escolha livre** — é aplicação de invariante. Confirmar com o dono apenas a **divergência textual**.
- **Prova:** teste `card-move-rls` prova a **fase vermelha** (antes do GRANT, UPDATE de `phaseId` → `permission
  denied`) e que `valores`/`orgId` seguem negados; `WITH CHECK` da policy `card_update` (existe desde 2.7) barra
  mover a linha para outra Org.

## D4 — Mover para a mesma Fase (origem == destino)

- **Decisão:** **no-op idempotente → 200**. Sem UPDATE, sem evento, sem nova `CardPhaseEntry`.
- **Racional:** coerente com a postura de idempotência do domínio (arquivar já-arquivado, revogar já-revogado). Evita
  poluir o Histórico e criar reentrada temporal espúria. Como não emite `updateMany`, também não gera falso-positivo
  de auditoria (`count: 0`), seguindo o padrão dos caminhos idempotentes de `tenant-context.ts`.
- **Alternativa considerada:** 400/rejeição — rejeitado por atritar com a idempotência do resto do domínio.

## D5 — Reordenação intra-Fase (`position`)

- **Decisão:** **fora de escopo**. Ordem por `createdAt` (Q2 da 2.9). Só entra com migration própria quando um
  consumidor concreto pedir.
- **Racional:** sem consumidor concreto na 2.14; adicionar `position` agora seria antecipação de escopo.

## Concorrência e idempotência (padrão consolidado da casa)

- **Decisão:** **guarda otimista** no UPDATE — `updateMany where id = <cardId> AND phaseId = <origem lida>`; se
  `count === 0`, **reconsulta** o Card: já está na Fase destino ⇒ idempotente (200); senão ⇒ **409** (perdeu a
  corrida / mudou sob os pés). Conflito de índice único / falha de serialização reconhece **P2002 e P2028** → **409**,
  **nunca 500**.
- **Racional:** sem transação multi-statement o read-modify-write vaza *lost update*; o padrão `{ phaseId: <lido> }`
  é o mesmo já usado na guarda otimista do ciclo de vida (2.11) e da coluna JSON (2.5). Reconhecer P2002 **e** P2028
  é lição registrada (2.6/2.7/2.8/2.10).
- **Prova:** teste de concorrência (`Promise.all`) — só 1 vence, o outro é 200 idempotente ou 409, **sem 500**.

## Recálculo de marcos/saúde é por leitura (sem agendador)

- **Decisão:** **nada a persistir**. A nova `CardPhaseEntry` (origin=MOVE), com seu `configSnapshot`, passa a ser a
  entrada **atual** (mais recente por `enteredAt`). `calcularMarcos` (2.12) e `derivarSaude` (2.13) já leem a atual.
- **Racional:** AD-11 (sem agendador; derivação pura na leitura); coerente com o Kanban só-leitura (2.9) e o "sem
  recálculo retroativo silencioso" (2.12). "Recalcula marcos/saúde" (AC1) cai **por construção**.

## Contexto documental (context7-check — a executar antes de codificar)

Confirmar na implementação, contra as versões **instaladas** (`package.json`/lockfile), a API de:
- **Prisma 6.19.3** — `updateMany` (retorno `{ count }`), transação interativa `$transaction(async (tx) => …)` no
  client raiz, códigos de erro `P2002`/`P2028`, `Prisma.TransactionClient`.
- **NestJS 11** — `NotFoundException`/`ForbiddenException`/`ConflictException`, DTO/validação de `POST`.
Fonte preferencial: MCP Context7 (`resolve-library-id` → `query-docs`); registrar a fonte se recorrer à doc oficial.

## Saídas da Fase 0

Todas as incógnitas resolvidas (defaults justificados, nenhum `NEEDS CLARIFICATION` bloqueante). Pronto para Fase 1
(data-model, contracts, quickstart).
