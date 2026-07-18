---
story_key: 3-6-historico-do-registro-read-side
epic: 3
status: done
release: E3 (Wave 4 — Databases, Registros, Vínculos e Arquivos)
risco: MÉDIO
baseline_commit: f738220
gate_arquitetura: Superfície de **LEITURA** (timeline) sobre `RecordHistory` já materializado (append-only e IMUTÁVEL, escrito por 3.4) — **sem migration e sem GRANT novo** (o runtime já tem `SELECT`/`INSERT` em `RecordHistory`, sem UPDATE/DELETE; a trilha é read-only por construção). **Espelho exato do Histórico do Card (2.17)** no domínio DISTINTO de Registro (`Card ≠ Registro`): cursor determinístico `[createdAt, id]` (teto 100 — NFR-3/4), **projeção allowlist** (só `id`/`type`/`summary`/`actorId`/data-hora — `orgId`/`recordId` fora da fronteira; nenhum binário, chave de objeto ou URL temporária — ajuste 5/AD-30), autorização pelo **acesso ATUAL ao Registro** (o histórico **nunca** concede acesso — análogo a SC-2105 da 2.10/2.17). Acesso ao Registro = **ler o Database dono** (`exigirLerDatabase`, 3.2; sem acesso → **404 não-enumerante**). **Correção = novo evento** append-only (não altera o original — garantido pelo write-side/imutabilidade; a 3.6 só lê). Rota sob `databases/:databaseId/records/:recordId` (o Registro pertence a 1 Database — RN-063). Guard C3 congelado (`@Requer('ler','Database')` grosso + guarda fina no serviço, DBT-AUTHZ-01). FORA: Auditoria administrativa (E8); write-side/captura de eventos (3.4); eventos de arquivo (3.8) e de vínculo/`correlationId` (3.9) — a taxonomia `type` é string aberta e a projeção já é fail-closed, mas **não** se inventa evento sem write-side.
---

# Story 3.6 — Histórico do Registro (read-side)

**As a** usuário autorizado,
**I want** consultar o Histórico de um Registro,
**So that** eu entenda suas alterações ao longo do tempo, com segurança.

**Status: ready-for-dev.** Sexta Story do **Épico 3**, risco **MÉDIO** — abre a superfície de **LEITURA** (timeline
cronológica) sobre `RecordHistory` (escrito por 3.4), **sem migration e sem GRANT novo**. É o **espelho exato do
Histórico do Card (2.17)** aplicado ao domínio DISTINTO de Registro: mesmo rigor de cursor determinístico, projeção
allowlist e autorização por **acesso atual** ao recurso — a diferença é o gate (aqui, **ler o Database dono** do
Registro, não o Card). O Histórico é uma **trilha própria do Registro, distinta da Auditoria administrativa (E8)**.

## Invariantes do dono (não erodir)

- **Read-side puro:** a 3.6 **não** escreve evento nenhum (a captura é do write-side 3.4 e das Stories que evoluem
  a taxonomia — 3.8/3.9). **Sem migration, sem GRANT novo** (o runtime lê `RecordHistory` via `SELECT`; a tabela
  já é append-only imutável — sem UPDATE/DELETE desde 3.4). **Não recria a captura.**
- **Autorização pelo acesso ATUAL ao Registro:** quem pode consultar o Histórico é quem pode **ler agora** o
  Database dono do Registro (`exigirLerDatabase`, 3.2). Quem perdeu o acesso não consulta mais — **o histórico
  nunca concede acesso** (análogo a SC-2105 da 2.10/2.17). Sem acesso → **404 não-enumerante** (indistinguível de
  "não existe"). Registro inexistente/de outra Org (RLS) → **404** idêntico.
- **Projeção allowlist (ajuste 5 / AD-15 / AD-30):** só `id`/`type`/`summary`/`actorId`/data-hora saem pela API.
  `orgId`/`recordId` ficam **fora da fronteira**. **Nunca** binários, chaves de objeto de storage ou URLs
  temporárias (não existem em `RecordHistory` hoje; a allowlist garante que, quando 3.8 adicionar metadados de
  arquivo, só metadados e referência interna segura poderão ser expostos — nada de binário/chave/URL).
- **Correção = novo evento append-only:** a 3.6 lê; a imutabilidade de `RecordHistory` (GRANT sem UPDATE/DELETE,
  3.4) garante que uma correção é **outro** evento, e o original permanece. A timeline exibe ambos em ordem.
- **Isolamento por Organização/Database:** RLS já vigente em `RecordHistory`/`Record`; toda query por
  `withTenantContext`; `orgId`/`databaseId`/`recordId` do cliente nunca confiados (Database e Registro relidos sob
  RLS; acesso por `exigirLerDatabase`).
- **Paginação determinística com teto:** cursor por `[createdAt, id]` (o `id` único desempata → ordem estável),
  teto rígido de 100 por página (NFR-3/4). Nunca devolver a trilha inteira sem limite.
- **Guard C3 congelado:** `@Requer('ler','Database')` grosso (aberto a qualquer Membership ativa, 3.2) + guarda
  fina no serviço (DBT-AUTHZ-01). **Sem** tocar `ability.ts`/`authz.guard.ts`.
- **Sem antecipar escopo:** SEM Auditoria administrativa (E8); SEM write-side/emissão de evento (3.4); SEM inventar
  eventos de arquivo (3.8) ou vínculo/`correlationId` (3.9) que não têm write-side — a projeção é fail-closed e a
  taxonomia `type` é string aberta, mas nada é fabricado.

## Escopo (do épico, congelado)

**Dentro:**
- **Timeline paginada** do Histórico de um Registro: eventos em ordem cronológica (`[createdAt, id]`), cada um com
  **tipo, resumo, ator/iniciador, data-hora** (os campos que o write-side 3.4 persiste hoje: `CREATED`,
  `VALUES_UPDATED`, `ARCHIVED`, `RESTORED`). Paginação por **cursor** determinístico (teto 100).
- **Autorização de visualização** pelo acesso atual ao Registro (ler o Database dono); sem acesso → 404
  não-enumerante.
- **Projeção segura**: só metadados e referência interna (nunca binários/chaves de objeto/URLs temporárias).

**Fora (Stories futuras / fora da Fase 1):**
- **Auditoria administrativa** (E8) — trilha distinta, com outra autorização e retenção.
- **Write-side / captura** de eventos (3.4 e evoluções 3.8/3.9). A 3.6 não escreve.
- **Eventos de arquivo** (inclusão/substituição/remoção lógica — 3.8) e **de vínculo/desvínculo com Card**
  (`correlationId` compartilhado — 3.9): entram com suas Stories, que evoluem o write-side. A projeção da 3.6 já
  os exibirá quando existirem (taxonomia `type` aberta), sem código novo de leitura — mas **não** se antecipa o
  write-side aqui.
- **Antes/depois (diff de valores)** e **origem** como campos ricos: `RecordHistory` hoje só persiste
  `type/summary/actorId/createdAt`; o `summary` carrega o resumo legível. Campos ricos exigiriam evolução do
  write-side (não desta Story) — a 3.6 **não inventa** colunas inexistentes.

## Critérios de aceite

- **AC1 — timeline autorizada:** Given eventos persistidos por 3.4 When o usuário autorizado (acesso atual ao
  Database dono) abre o Histórico do Registro Then vê a timeline com tipo/resumo/ator/data-hora, em ordem
  cronológica, **sem** binários/chaves de objeto/URLs temporárias.
- **AC2 — projeção segura:** Given um evento When exibido Then mostra apenas os campos da allowlist
  (`id`/`type`/`summary`/`actorId`/data-hora); `orgId`/`recordId` **não** aparecem; nenhum payload/binário/chave/URL.
- **AC3 — negação por falta de acesso atual:** Given um usuário **sem** acesso atual ao Registro (não pode ler o
  Database dono) When tenta consultar Then o acesso é negado com **404 não-enumerante** (idêntico a Registro
  inexistente ou de outra Organização).
- **AC4 — o histórico não concede acesso:** Given um usuário que foi ator/iniciador de um evento passado mas
  **perdeu** o acesso ao Database When tenta consultar Then é negado (404) — ter originado um evento não concede
  leitura (análogo a SC-2105).
- **AC5 — correção preserva o original:** Given uma correção registrada como novo evento (write-side) When a
  timeline é lida Then o evento original **não** é alterado e o novo evento aparece **append-only** em ordem (a
  imutabilidade de `RecordHistory` garante isso; a 3.6 só lê).
- **AC6 — paginação determinística:** Given mais eventos do que o teto de página When paginado por cursor Then a
  ordem é estável (`[createdAt, id]`) e o teto rígido (100) é respeitado; o cursor aponta o próximo.
- **AC7 — isolamento por Organização/Database (RLS):** Given um Registro de outra Organização When um principal de
  outra Org tenta consultar Then vê **404** (RLS + gate), nunca eventos alheios; a contagem/timeline é só do
  Registro visível.

## Rastreabilidade

FR-19; D3.5; AD-15/30. **Consome:** write-side (3.4 — `RecordHistory`), autorização de Database (3.2 —
`exigirLerDatabase`). **Espelha:** Histórico do Card (2.17). **Dependências:** 3.4. **Fora:** Auditoria (E8).

## Notas de implementação (guardrails para o dev)

- **Arquivos (novos):**
  - `apps/api/src/databases/records/history/record-history-read.service.ts` — `RecordHistoryReadService.verHistorico(databaseId, recordId, cursor, limite)`: `exigirLerDatabase` (404); reconfere que o Registro pertence ao Database (`db.record.findFirst({ where: { id, databaseId }, select: { id: true } })` → 404 não-enumerante); `db.recordHistory.findMany({ where: { recordId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: allowlist, take, cursor })`. Projeção allowlist (`id/type/summary/actorId/createdAt→occurredAt`).
  - `apps/api/src/databases/records/history/record-history.controller.ts` — `@Controller('databases/:databaseId/records/:recordId')`, `@Requer('ler','Database')`, `@Get('history')`. Reusa `validarIdRota` (records.dto) e um parser de cursor/limite.
  - `apps/api/src/databases/records/history/record-history.dto.ts` — `parseCursor`/`parseLimite` (espelho de `kanban.dto`, sem acoplar `databases/` a `pipes/`).
- **Registro no módulo:** `databases.module.ts` — `RecordHistoryController` + `RecordHistoryReadService`.
- **Sem** migration, **sem** GRANT, **sem** alteração de `MODELOS_AUDITADOS` (leitura pura).
- **Testes:** `record-history-read-rls.test.ts` (cross-tenant invisível; contagem escopada) + `record-history-read-http.test.ts` (AC1–AC7: timeline, projeção sem `orgId`/`recordId`, 404 sem acesso, histórico não concede, cursor, isolamento).

## Change Log

| Data | Descrição |
|------|-----------|
| 2026-07-16 | Story criada (create-story). sprint-status 3-6 backlog → ready-for-dev na branch `story/3-6-historico-do-registro-read-side`. |
| 2026-07-18 | Implementação retomada e integrada com o main (3.7/3.8) por merge normal (`db141df`); base parcial preservada (`efe2664` + bundle). PR #113 mergeado (`ebb9ddb`), CI 5/5. Story `done`. |

## Review Findings (T010 — 4 revisores adversariais)

Registro completo em `gates/3-6/T010-review-e-conclusao.md`. **0 CRITICAL / 0 HIGH.**

- **Segurança/Autz:** autz por acesso ATUAL (`exigirLerDatabase`), 404 não-enumerante, histórico não
  concede (SC-2105); isolamento cross-tenant provado (RLS). **AD-30 verificado:** o `summary` dos eventos
  de arquivo (3.8) carrega só a referência `fileId` — sem `bucketKey`/URL/PII —, então a projeção allowlist
  da timeline não vaza material sensível.
- **Correção/Edge:** cursor `[createdAt, id]` sem off-by-one; teto 100; `type` desconhecido e legados sem
  `actorId` tratados.
- **Observabilidade/LGPD:** sem log de PII; projeção exclui `orgId`/`recordId`/payload; read-side puro.
- **Aceite:** AC1–AC7 (HTTP) + RLS = 7/7; regressão dos vizinhos 17/17; **suíte serial 852/852**; typecheck limpo.

Gates de conclusão (security/observability/lgpd/migration/performance): a 3.6 é **read-side puro** — sem
migration e sem GRANT novo (o runtime já tem `SELECT` em `RecordHistory`, append-only desde 3.4); nenhuma
PII nova; sem N+1 (cursor + teto). `Card ≠ Registro` preservado.
