# Story 2.17: Histórico do Card — consulta da timeline

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a usuário autorizado,
I want consultar o Histórico do Card,
so that eu entenda o que aconteceu, por quem e quando.

## Acceptance Criteria

1. **CA1 — Timeline autorizada e mascarada.** Dado eventos persistidos por 2.7/2.10–2.16 (`CardHistory`), quando um usuário com **acesso ATUAL** ao Card abre o Histórico, então vê a timeline cronológica (`type`/`summary`/data-hora/ator/referência), respeitando a autorização **atual** e mascarando sensíveis (projeção allowlist server-side).
2. **CA2 — Correção append-only.** Dada uma correção de informação anterior, quando registrada, então o evento original **não** é alterado; a correção é um **novo** evento (ex.: `PHASE_VALUES_CORRECTED` da 2.15) que aparece cronologicamente. A 2.17 **não recria a captura** (usa o write-side de 2.7) e a trilha é **read-only** (sem UPDATE/DELETE).
3. **CA3 — Acesso é o atual; histórico nunca concede acesso.** Dado um usuário que **perdeu** acesso ao Card, quando tenta consultar o Histórico, então o acesso é negado (**404** sem acesso ao Card), **mesmo** tendo sido ator/Responsável/Observador antes. Ter aparecido no histórico não concede acesso (SC-2105/2.10). Acesso insuficiente pela guarda grossa → **403**.

## Tasks / Subtasks

- [ ] T0 Gate `pre-implementation-check` (read-side; sem migration/GRANT — reusa `CardHistory` SELECT).
- [ ] Task 1 — Read-service `CardHistoryReadService.verHistorico(cardId, cursor, limite)` (AC: 1, 3)
  - [ ] Autorização por **acesso atual** ao Card: `exigirLerCard` (2.10) → **404** sem acesso ao Card (`podeLer` é o piso); creator/histórico **não** concedem (resolvido no `resolverAcessoNoCard`).
  - [ ] Projeção **allowlist** server-side: só `id`/`type`/`summary`/`actorId`/data-hora. **Nunca** `orgId`/`cardId` interno; **nunca** o payload do `MovementEvent` (trilha de integração ≠ Histórico do Card — AD-15).
  - [ ] Paginação por **cursor determinístico** `[createdAt, id]` (teto 100), ordenação cronológica estável.
  - [ ] `valores`/PII não entram (o `summary` já é escrito sem PII — 2.7+; a projeção não inclui payloads).
- [ ] Task 2 — Controller/DTO `CardHistoryController` (AC: 1, 3) — `GET /cards/:cardId/history?cursor=&limite=`; `@Requer('ler','Pipe')` (guarda grossa → 403); guarda fina no serviço (404). Reusa `parseCursor`/`parseLimite`.
- [ ] Task 3 — Registrar em `pipes.module.ts`.
- [ ] Task 4 — Testes (PostgreSQL real): read-only (sem UPDATE/DELETE — CardHistory já garante), autorização (acesso atual → vê; sem acesso → 404; histórico não concede), projeção allowlist (sem `orgId`/payload interno), paginação por cursor determinística, correção aparece como novo evento (CA2).
- [ ] Task 5 — Polish: typecheck/lint/format; `test:ci` serial; gates de conclusão (security/observability).

## Dev Notes

- **Rastreabilidade:** FR-12; D2.6; RN-170; NFR-16; AD-15. **Consome:** write-side do Histórico (2.7), eventos de 2.10–2.16. **Dep.:** contrato de escrita da 2.7. **Fora:** Auditoria administrativa (E8); logs técnicos; captura de eventos (write-side existente).
- **Sem migration, sem GRANT novo:** `CardHistory` já é append-only (GRANT SELECT/INSERT; **sem** UPDATE/DELETE — provado desde a 2.7). A 2.17 é **read-side puro**, análoga ao Kanban (2.9): sem schema.
- **Autorização = acesso ATUAL (2.10):** `exigirLerCard`/`resolverAcessoNoCard` compõe papel-de-Pipe + `CardGrant` + `restritoAoProprio` + Responsável-atual; **creator e histórico NUNCA concedem** (SC-2105). Diverge do Kanban (2.9, que autoriza por poder de Pipe): o Histórico exige acesso ao **Card**, não ao Pipe — quem perdeu o acesso não consulta.
- **Projeção allowlist + AD-15:** só campos do `CardHistory` (`id`/`type`/`summary`/`actorId`/`createdAt`). O `MovementEvent` (2.16, trilha de integração) **não** aparece na timeline — nunca expor seu payload. `orgId` fora da fronteira.
- **Agrupamento só na apresentação:** o read-side devolve eventos individuais em ordem cronológica; agrupar eventos de uma mesma ação é responsabilidade da UI (epics §1023 "podem ser agrupadas").
- **Paginação:** cursor determinístico `[createdAt, id]` (o `id` desempata → ordem estável), teto 100 (NFR-3/4), como o Kanban (2.9). Reusa `parseCursor`/`parseLimite` de `kanban.dto`.

### Project Structure Notes

- `apps/api/src/pipes/cards/history/` — `card-history-read.service.ts` + `card-history.controller.ts` (+ reuso do DTO do Kanban). Registrar em `pipes.module.ts`.
- Testes em `apps/api/test/` (`*-http.test.ts` + `*-rls.test.ts` para a fronteira read-only). PostgreSQL real, Org C + `randomUUID`, `test:ci` serial.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 2.17 (L1017-1031)]
- [Source: apps/api/src/pipes/cards/kanban-read.service.ts (padrão read-side + cursor)]
- [Source: apps/api/src/pipes/pipe-authz.ts (exigirLerCard/resolverAcessoNoCard — acesso atual ao Card, SC-2105)]
- [Source: apps/api/prisma/schema.prisma#CardHistory (append-only; GRANT SELECT/INSERT)]

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

### Completion Notes List

### File List
