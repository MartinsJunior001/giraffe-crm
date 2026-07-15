# Data Model — Story 2.14 (Movimentação e regras de transição)

> **Nenhuma tabela nova. Nenhuma coluna nova.** A Story só amplia o **GRANT** de `Card` (add `phaseId` ao
> column-scoped) e **consome** entidades já materializadas (2.7/2.11/2.12). O schema Prisma **não muda**.

## Entidades tocadas

### `Card` (existente — 2.7)
- **Escrita nesta Story:** `phaseId` (o **2º UPDATE column-scoped** de `Card` em runtime).
- **GRANT (após a migration `card_movement`):** `SELECT`, `INSERT`, `UPDATE ("lifecycleState",
  "previousLifecycleState", "updatedAt", "phaseId")`. **`valores` e `orgId` seguem SEM UPDATE** (tentativa →
  `permission denied`). Sem `DELETE`.
- **Policies (existentes desde 2.7 — nada a criar):** `card_select/insert/update/delete` por `orgId =
  current_org_id()`; `card_update` tem `USING` **e** `WITH CHECK` — o `WITH CHECK` impede **mover a linha para outra
  Org** no UPDATE.
- **Guarda otimista:** `updateMany({ where: { id, phaseId: <origem lida> }, data: { phaseId: <destino> } })`.

### `CardPhaseEntry` (existente — 2.12)
- **Escrita nesta Story:** **novo INSERT** com `origin = 'MOVE'` (reentrada). Append-only e imutável.
- **GRANT:** `SELECT`, `INSERT` (sem UPDATE/DELETE — inalterado).
- **Como:** via o helper **`registrarEntradaNaFase(tx, { orgId }, { cardId, phaseId: destino, origin: 'MOVE' })`**
  (`cards/phase-entry/card-phase-entry.ts`) — já existe e aceita `origin='MOVE'`; a 2.14 é seu **primeiro chamador de
  movimentação** (AD-11). O helper congela o `configSnapshot` da Fase destino no instante da entrada (D-OA1=A).
- **Efeito:** a nova entrada vira a **atual** (mais recente por `enteredAt`) → marcos (2.12) e saúde (2.13) passam a
  derivar dela **na leitura**, sem persistência.

### `CardHistory` (existente — 2.7)
- **Escrita nesta Story:** **novo INSERT** `{ type: 'MOVED', ... }`. Append-only e imutável.
- **`type` é `String`** (schema:614) — `'MOVED'` é **novo valor**, **sem** migration de enum.
- **GRANT:** `SELECT`, `INSERT` (inalterado). Sem UPDATE/DELETE.
- **Conteúdo do evento:** `cardId`, `actorId` (principal), Fase origem→destino, timestamp. **Sem** PII/`valores`.

### `Phase` (existente — 2.3) — somente leitura
- Lida para validar destino: **ativa**, **mesmo Pipe** (`phase.pipeId`), **≠ origem**. Nenhuma escrita.

### `CardGrant` (existente — 2.10) — somente leitura
- `podeMover` (o DADO da capacidade, existente desde 2.10) é **consumido** pela autorização da operação (T4).

## Transição de estado (o eixo desta Story)

A 2.14 muda o eixo **Fase** do Card — **distinto** do ciclo de vida (2.11) e da saúde (2.13). `Fase ≠ Status do
Card`.

```
Card(phaseId = Fᵢ, lifecycle = ATIVO)
        │  moverCard(destino = Fⱼ, confirmado = true)
        │  preflight OK (ciclo aberto · Fⱼ ativa, mesmo Pipe, ≠ Fᵢ · confirmado · par livre RN-046)
        ▼   ── transação atômica (client raiz, definirContextoOrg) ──
Card(phaseId = Fⱼ)  +  CardPhaseEntry(origin=MOVE, phase=Fⱼ)  +  CardHistory(type=MOVED, Fᵢ→Fⱼ)
```

**Invariante:** o ciclo de vida (`lifecycleState`) e a saúde **não mudam** ao mover. Só ciclo **ATIVO** move
(FINALIZADO/ARQUIVADO → bloqueio de preflight).

## Regras de validação (preflight — núcleo puro, sem I/O)

| # | Validador built-in | Bloqueia quando | Fonte |
|---|--------------------|-----------------|-------|
| a | Ciclo aberto | `lifecycleState ≠ ATIVO` | epics §983 |
| b | Fase destino válida | destino **arquivada**, de **outro Pipe**, ou **== origem** (ver D4) | RN-046, §983 |
| c | Confirmação humana | `confirmado ≠ true` | R2/D2.4, §982 |
| d | Par origem→destino | (livre entre Fases ativas do mesmo Pipe — sem restrição adicional na 2.14) | RN-046 |

> **Autorização NÃO é validador puro** (depende de I/O): entra como **pré-condição do serviço** — `exigirOperarCard`
> (404 sem acesso / 403 só-leitura) + capacidade `podeMover` para concessões diretas. Ver `contracts/`.

> **Ponto de extensão (2.15/E4/E5):** validadores adicionais (requisito de Formulário de Fase na saída/entrada;
> automação; notificação) entram **na lista**, sem reescrever o serviço. Contrato em
> `contracts/transition-preflight.contract.md`.

## O que NÃO muda

- `schema.prisma` (nenhum model/coluna/enum novo).
- Policies RLS (todas já existem).
- `MODELOS_AUDITADOS` em `tenant-context.ts` (`Card`/`CardHistory`/`CardPhaseEntry` já incluídos).
- `apps/web` (sem UI nesta Story).
- Guard / `ability.ts` (C3 congelado — guarda fina no serviço).
