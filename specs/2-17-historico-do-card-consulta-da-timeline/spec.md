# Especificação — Histórico do Card: consulta da timeline (Story 2.17)

## Contexto

FR-12. Read-side da trilha de eventos por Card (`CardHistory`, append-only e imutável, escrita por 2.7/2.10–2.16). NÃO é fonte de autorização. Entrega a **consulta** da timeline: cronológica, autorizada pelo **acesso ATUAL** ao Card, com projeção allowlist e mascaramento server-side.

## Requisitos funcionais

- **FR-2.17-1** — Timeline cronológica dos eventos do Card (`type`/`summary`/data-hora/ator), respeitando autorização atual e mascarando sensíveis (projeção allowlist).
- **FR-2.17-2** — Correção aparece como **novo** evento (write-side append-only já existente); a trilha é read-only.
- **FR-2.17-3** — Autorização pelo acesso **atual** ao Card: sem acesso → 404; histórico **nunca** concede acesso; acesso insuficiente (guarda grossa) → 403.
- **FR-2.17-4** — Paginação por cursor determinístico; ordenação estável; não expor payload interno do `MovementEvent` (AD-15) nem `orgId`.

## Critérios de aceite

Ver CA1–CA3 na story md.

## Decisões / invariantes

- **Sem migration, sem GRANT novo:** `CardHistory` já é append-only (SELECT/INSERT). Read-side puro (como o Kanban 2.9).
- **Autorização = acesso atual (2.10):** `exigirLerCard` (`resolverAcessoNoCard`) — creator/histórico não concedem (SC-2105).
- **Projeção allowlist:** só `id`/`type`/`summary`/`actorId`/`createdAt` do `CardHistory`. `MovementEvent` (2.16) fora da timeline.
- **Agrupamento só na apresentação;** cursor `[createdAt, id]`, teto 100.

## Fora de escopo

Captura/write-side (2.7 existente); Auditoria administrativa (E8); logs técnicos; agrupamento server-side; MovementEvent na timeline.

## Assunções

- `summary` do `CardHistory` já é escrito sem PII (2.7+); a projeção não inclui payloads/`valores`.
- Ordenação cronológica ascendente `[createdAt asc, id asc]`; cursor = `id` do último evento da página.
