# Story 2.14: Movimentação e regras de transição

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário autorizado,
I want mover um Card para outra Fase,
so that eu faça o trabalho avançar no processo.

## Acceptance Criteria

1. **Given** um usuário autorizado a mover **When** solicita mover um Card para outra Fase **ativa** do **mesmo Pipe** **Then** o preflight consulta os validadores registrados; sem bloqueio, a nova Fase é **persistida**, marcos/saúde são recalculados (por leitura, sem persistir) e o evento `MOVED` é registrado no Histórico — tudo na **mesma transação**. (epics §981)
2. **Given** um validador que reporta **bloqueio** **When** o preflight é executado **Then** **nada** é movimentado (sem UPDATE de `phaseId`, sem `CardHistory`, sem `CardPhaseEntry`) — sem movimentação parcial. (epics §982)
3. **Given** um usuário **Somente leitura/Observador**, **ou** uma **Fase arquivada**, **ou** uma Fase de **outro Pipe**, **ou** um Card de **ciclo não-aberto** (FINALIZADO/ARQUIVADO) **When** se tenta mover **Then** é **negado/bloqueado**; só Cards de **ciclo aberto** (ATIVO) movem. (epics §983)
4. **And** o **núcleo de movimentação existe sem** a implementação do Formulário de Fase (2.15); E4/E5 podem **registrar validadores** no mesmo contrato **sem recriar** a movimentação. (epics §984)

**Rastreabilidade:** FR-11; D2.4; RN-046; AD-13. · **Contrato produzido:** preflight de movimentação (→ 2.15 e consumidores). · **Dep.:** 2.2, 2.3, 2.9, 2.10, 2.11, 2.12, 2.13. · **Fora:** evento canônico opt-in (2.16); execução de efeitos/validador do Formulário de Fase (2.15, E4/E5).

## Tasks / Subtasks

- [ ] **T1 — Migration: GRANT de `phaseId` (o 2º UPDATE column-scoped de `Card`)** (AC: 1, 3)
  - [ ] Nova migration acrescenta **`GRANT UPDATE ("phaseId") ON "Card" TO giraffe_app`** — **additivo** ao grant column-scoped da 2.11 (`lifecycleState`/`previousLifecycleState`/`updatedAt`). **NÃO** usar `GRANT UPDATE ON "Card"` (blanket): o invariante da casa é `valores`/`orgId` **nunca** recebem GRANT de UPDATE (CLAUDE.md; Apêndice A da 2.9). `updatedAt` já está concedido pela 2.11.
  - [ ] A policy `card_update` **já existe** desde a 2.7 (`USING`/`WITH CHECK ("orgId" = current_org_id())`) — o `WITH CHECK` impede **mover a linha para outra Org**. Nada a criar na policy.
  - [ ] `CardHistory.type` é **String** (schema linha 613) — `MOVED` é **novo valor de string**, **sem** migration de enum.
- [ ] **T2 — Núcleo puro do preflight de transição (`transition-preflight.ts`)** (AC: 1, 2, 4)
  - [ ] Definir o **contrato** de validador: um tipo `ValidadorDeTransicao` (função **pura** que recebe o contexto da transição — Card, Fase origem, Fase destino, principal/poder, `confirmado` — e devolve `ok` ou um **bloqueio** tipado com motivo). Ordenado e **componível**.
  - [ ] Validadores **built-in da 2.14** (concretos, sem abstração especulativa): (a) **ciclo aberto** (só ATIVO move); (b) **Fase destino ativa**, **do mesmo Pipe** e **≠ origem**; (c) **confirmação humana** presente (R2/D2.4 — mover exige confirmação explícita, nunca contornada); (d) **par origem→destino** livre entre Fases ativas do mesmo Pipe (RN-046). A **autorização** entra como pré-condição do serviço (ver T4), não como validador puro (depende de I/O).
  - [ ] O contrato é **extensível**: 2.15 (Formulário de Fase — requisito de entrada/saída) e E4/E5 acrescentam validadores **sem** reescrever o serviço. Documentar o ponto de extensão. **Não** construir DI/registry especulativo — os built-in são os consumidores concretos agora.
- [ ] **T3 — Serviço de movimentação (`card-movement.service.ts`) + rota** (AC: 1, 2, 3)
  - [ ] `moverCard(cardId, { destinoPhaseId, confirmado, idempotencyKey? })`: resolve acesso (T4), lê Card + Fase origem/destino sob `withTenantContext`, roda o **preflight** (T2); havendo bloqueio → resposta de bloqueio (**nada** persistido).
  - [ ] Sem bloqueio: **transação interativa no client raiz** (`definirContextoOrg`, como 2.6/2.7/2.10/2.11) que faz, atômico: **(i)** UPDATE `Card.phaseId` com **guarda otimista** (`updateMany where id = ... AND phaseId = <origem lida>` → `count`); **(ii)** `registrarEntradaNaFase(tx, contexto, { cardId, phaseId: destino, origin: 'MOVE' })` (helper da 2.12 — reentrada = **novo INSERT** de `CardPhaseEntry`); **(iii)** INSERT `CardHistory { type: 'MOVED', ... }` (append-only). Auditoria manual (FR-214) na mesma tx.
  - [ ] **Concorrência/idempotência:** guarda otimista `count === 0` → reconsulta → idempotente (já na Fase destino) **ou** 409; conflito de índice único de `CardPhaseEntry`/história reconhece **P2002 e P2028** → 409, **nunca 500**. Mover para a **mesma** Fase (origem == destino) → decidir no clarify (no-op idempotente vs 400).
  - [ ] `phaseId`/`orgId` do cliente **nunca** confiados; destino é validado sob RLS (mesmo Pipe).
- [ ] **T4 — Autorização de movimentação (reusa `pipe-authz`)** (AC: 1, 3)
  - [ ] Mover exige **operar o Card** (`exigirOperarCard`, 2.10) **e** a capacidade **`podeMover`** para concessões diretas (`CardGrant.podeMover` — o DADO existe desde a 2.10; a **operação** é esta Story). Admin da Org/Admin do Pipe/Membro no escopo efetivo movem; **Somente leitura/Observador** não (403); sem acesso → 404 não-enumerante; **`restritoAoProprio`** limita.
  - [ ] Se necessário, extrair `exigirMoverCard` em `pipe-authz.ts` compondo `exigirOperarCard` + `podeMover` (guarda fina no serviço, C3/`ability.ts` **congelado** — DBT-AUTHZ-01).
- [ ] **T5 — Testes (PostgreSQL real; fase vermelha provada)** (AC: 1, 2, 3, 4)
  - [ ] `card-move-rls`: **antes** do GRANT, UPDATE de `phaseId` em `Card` bate em `permission denied` (fase vermelha); **depois**, UPDATE de `phaseId` funciona no contexto e é **negado cross-tenant** (WITH CHECK); `valores`/`orgId` seguem **sem** UPDATE (`permission denied`); **sem** DELETE.
  - [ ] `transition-preflight` (unit puro): cada validador built-in e a composição; bloqueio de um validador ⇒ resultado bloqueado sem tocar banco.
  - [ ] `card-move-http`: caminho feliz (201/200 + `MOVED` + nova `CardPhaseEntry` + `phaseId` novo); bloqueio ⇒ nada muda; Somente leitura/Observador ⇒ 403; Fase arquivada/outro Pipe ⇒ bloqueio; ciclo não-aberto ⇒ bloqueio; concorrência (`Promise.all`) ⇒ só 1 vence, sem 500; idempotência.
  - [ ] Escrever na **Org C** com contas descartáveis (`randomUUID`) — **nunca** reusar Ana/Bruno/Carla/Eva em `membership.create` persistente ([[test-iso-01-causa-raiz]]).

## Dev Notes

### O ponto arquitetural (o que esta Story fecha)
A 2.14 é a **movimentação do Card entre Fases** — o **1º UPDATE de `Card.phaseId`** em runtime. A 2.11 abriu o 1º UPDATE de `Card`, **column-scoped** ao ciclo de vida; a 2.14 **acrescenta `phaseId`** ao mesmo grant column-scoped, e **só** isso — `valores` e `orgId` continuam **sem** GRANT de UPDATE (tentativa → `permission denied`, provado no teste). A migration da 2.7 **antecipou** exatamente isto ("UPDATE/DELETE ficam para a movimentação/ciclo de vida — 2.14/2.11 — com consumidor e teste que provam o escopo").

### Contrato de preflight (o que esta Story **produz** para 2.15/E4/E5)
O epics compromete o **contrato de preflight de transição** (§762, §977, §984). O núcleo de 2.14 **existe sem** o Formulário de Fase (2.15): 2.15 se integra **como validador** ao preflight; E4/E5 registram novos validadores **sem recriar** a movimentação. Regra da casa: **sem abstração especulativa** — o contrato nasce com os **validadores built-in concretos** da 2.14 como consumidores; o ponto de extensão é documentado, não um framework de plugins vazio.

### Transação e atomicidade (AD-13, padrão 2.6/2.7/2.10/2.11)
UPDATE `phaseId` + `registrarEntradaNaFase(origin='MOVE')` + INSERT `CardHistory{MOVED}` são **uma** transação interativa no **client raiz** com `definirContextoOrg` (o `withTenantContext` recusa `$transaction` no client estendido). Não há Card movido sem sua entrada e sem seu evento. `CardHistory` e `CardPhaseEntry` seguem **append-only** (GRANT SELECT+INSERT).

### Recálculo de marcos/saúde é por leitura (sem agendador)
"Recalcula marcos/saúde" (AC1) cai **por construção**: a nova `CardPhaseEntry` (origin=MOVE) com seu `configSnapshot` passa a ser a entrada **atual** (mais recente por `enteredAt`); `calcularMarcos` (2.12) e `derivarSaude` (2.13) já leem a entrada atual. **Nada** a persistir, nenhum evento de saúde (AD-11).

### Regras de transição (RN-046)
Livre entre Fases **ativas do mesmo Pipe**; **não** para/de Fase **arquivada**; **nunca** entre Pipes; **só ciclo aberto** (ATIVO) move; **`restrito ao próprio`** limita. `Fase ≠ Status do Card` preservado (movimentar muda a Fase, não o ciclo de vida nem a saúde).

### Arquivos a tocar
- **NEW** `apps/api/prisma/migrations/<ts>_card_movement/migration.sql` — `GRANT UPDATE ("phaseId") ON "Card" TO giraffe_app` (additivo). Sem enum, sem policy nova.
- **NEW** `apps/api/src/pipes/cards/movement/transition-preflight.ts` (núcleo puro), `card-movement.service.ts`, `card-movement.controller.ts`, `card-movement.dto.ts`.
- **UPDATE** `apps/api/src/pipes/pipe-authz.ts` — `exigirMoverCard` (compõe `exigirOperarCard` + `podeMover`), se extração se justificar.
- **UPDATE** `apps/api/src/pipes/cards/phase-entry/card-phase-entry.ts` — **consumidor** de `registrarEntradaNaFase` com `origin='MOVE'` (o helper já aceita; agora ganha chamador — AD-11).
- **UPDATE** `apps/api/src/pipes/pipes.module.ts` — registrar serviço/controller.
- `tenant-context.ts` — `Card`/`CardHistory`/`CardPhaseEntry` já em `MODELOS_AUDITADOS`; sem mudança.
- **NEW** testes: `card-move-rls.test.ts`, `transition-preflight.test.ts`, `card-move-http.test.ts`.

### Padrões de teste (obrigatórios)
PostgreSQL real; **provar a fase vermelha** do GRANT (quebrar antes, conceder depois). Suíte roda em série no CI (`pnpm test:ci`); localmente use `--no-file-parallelism` para a suíte cheia. **Nunca** reusar contas-fixture de LEITURA do seed em `membership.create` persistente — Org C + `randomUUID` ([[test-iso-01-causa-raiz]]).

### Questões para o `clarify` (decisões de dono/arquitetura — NÃO inventar)
1. **Forma do contrato de preflight:** lista ordenada de validadores puros + ponto de extensão documentado (recomendado, sem DI) **vs** registry/DI. Arquitetural.
2. **Representação da confirmação humana:** flag explícita `confirmado: true` no request, tratada como validador (recomendado) vs outro mecanismo.
3. **Mover para a mesma Fase (origem == destino):** no-op idempotente (200) **vs** 400/rejeição. Detalhe de contrato.
4. **Divergência do Apêndice A:** ele diz `GRANT UPDATE ON "Card"` (blanket); esta Story adota **column-scoped `("phaseId")`** por causa do invariante `valores`/`orgId` sem UPDATE. Confirmar (recomendado column-scoped).
5. **Reordenação intra-Fase (`position`):** **fora** do núcleo da 2.14 (ordem por `createdAt`, Q2 da 2.9); só entra com migration própria se um consumidor concreto pedir. Confirmar fora de escopo.

### Project Structure Notes
- Domínio em `apps/api/src/pipes/cards/movement/` (novo subdomínio, espelhando `lifecycle/`, `phase-entry/`, `access/`). Núcleo puro separado do serviço (padrão `card-lifecycle.transitions.ts` / `phase-milestones.core.ts`).
- Toda query por `withTenantContext`; nenhuma rota aceita `orgId` do cliente; guarda fina no serviço (não no guard — C3 congelado).

### References
- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.14] (§971-984; §762 contrato; §977 fluxo/escopo)
- [Source: specs/2-9-kanban-e-espaco-operacional/spec.md#Apêndice A] (design de movimentação: GRANT, fase vermelha, evento MOVED, autorização, posição)
- [Source: _bmad-output/planning-artifacts/architecture/architecture-giraffe-crm-2026-07-11/ARCHITECTURE-SPINE.md#AD-13] (mutação por eventos, atomicidade principal+evento)
- [Source: CLAUDE.md] (invariantes: Card column-scoped UPDATE; `valores`/`orgId` sem UPDATE; append-only CardHistory/CardPhaseEntry; helper `registrarEntradaNaFase` origin=MOVE; `exigirOperarCard`/`podeMover`; P2002+P2028→409)
- [Source: apps/api/prisma/schema.prisma] (CardHistory.type = String, linha 613; policy card_update desde 2.7)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code)

### Debug Log References

- `pnpm --filter @giraffe/api typecheck` — verde.
- `pnpm --filter @giraffe/api exec vitest run test/transition-preflight.test.ts` — 11/11.
- `pnpm --filter @giraffe/api exec vitest run test/card-move-rls.test.ts test/card-lifecycle-rls.test.ts test/kanban-rls.test.ts` — 12/12.
- `pnpm --filter @giraffe/api exec vitest run test/card-move-http.test.ts` — 11/11.
- `pnpm --filter @giraffe/api test:ci` (serial) — **68 arquivos / 582 testes, 0 falhas**.

### Completion Notes List

- Migration `20260714190000_card_movement`: `GRANT UPDATE ("phaseId") ON "Card"` (aditivo ao column-scoped da 2.11; sem enum/policy/DELETE; reversível por `REVOKE`).
- Núcleo puro `transition-preflight.ts` (tipo `ValidadorDeTransicao` + 5 built-ins + `executarPreflight`), extensível por composição de lista (CA4); sem DI/registry.
- Serviço `card-movement.service.ts`: preflight → transação interativa no client raiz (`definirContextoOrg`) com UPDATE `phaseId` (guarda otimista) + `registrarEntradaNaFase(origin='MOVE')` + `CardHistory{MOVED}`; P2002/P2028 → 409; no-op D4.
- Autorização: `exigirMoverCard` = operar o Card. **Reconciliação registrada:** Apêndice A da 2.9 ("mover = operar"), epics §792 (Membro move; Somente leitura não) e a garantia do dono ("operar o Card") convergem em gate por `podeOperar`; `podeMover` da 2.10 valida `⇒ podeOperar`, então não amplia — dado reservado (AD-11).
- **Sem `idempotencyKey`** na movimentação: idempotência estrutural (guarda otimista por `phaseId` + no-op D4); chave seria errada (suprimiria re-movimentação legítima A→B→A→B).
- Testes existentes ajustados honestamente: `card-lifecycle-rls` e `kanban-rls` deixaram de afirmar `phaseId` negado (a 2.14 concede) — a prova migrou para `card-move-rls`; ambos passam a provar `valores` negado.

### File List

- **NEW** `apps/api/prisma/migrations/20260714190000_card_movement/migration.sql`
- **NEW** `apps/api/src/pipes/cards/movement/transition-preflight.ts`
- **NEW** `apps/api/src/pipes/cards/movement/card-movement.service.ts`
- **NEW** `apps/api/src/pipes/cards/movement/card-movement.controller.ts`
- **NEW** `apps/api/src/pipes/cards/movement/card-movement.dto.ts`
- **UPDATE** `apps/api/src/pipes/pipe-authz.ts` (`exigirMoverCard`)
- **UPDATE** `apps/api/src/pipes/pipes.module.ts` (registro do service/controller)
- **NEW** `apps/api/test/transition-preflight.test.ts`
- **NEW** `apps/api/test/card-move-rls.test.ts`
- **NEW** `apps/api/test/card-move-http.test.ts`
- **UPDATE** `apps/api/test/card-lifecycle-rls.test.ts`, `apps/api/test/kanban-rls.test.ts` (ajuste ao novo GRANT)
