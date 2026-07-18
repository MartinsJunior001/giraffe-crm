# Data model — Story 3.9

## Nova tabela `CardRecordLink` (org-scoped)
| Coluna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| orgId | UUID | FK Organization (Cascade); RLS por `current_org_id()` |
| cardId | UUID | FK Card (Cascade) |
| recordId | UUID | FK Record (Cascade) |
| state | `CardRecordLinkState` = ACTIVE\|REMOVED (default ACTIVE) | desvincular = REMOVED (soft; sem DELETE) |
| correlationId | UUID | da operação que criou o vínculo (traça os 2 eventos LINKED) |
| createdBy | UUID? | ator |
| createdAt / updatedAt | TIMESTAMP(3) | |
| removedAt | TIMESTAMP(3)? | quando REMOVED |

- Índices: `(orgId, cardId)`, `(orgId, recordId)`, e **índice único parcial** `UNIQUE (orgId, cardId, recordId) WHERE state='ACTIVE'` (raw SQL — Prisma 6.19.3 não expressa parcial). Impede 2º vínculo ativo do mesmo par (contrato #6).
- RLS ENABLE+FORCE; policies select/insert/update/delete por `orgId=current_org_id()`, WITH CHECK no INSERT e UPDATE.
- GRANT `SELECT/INSERT/UPDATE` a `giraffe_app` — **sem DELETE** (desvincular é `state`).
- Em `MODELOS_AUDITADOS`.

## Alteração aditiva nas trilhas
- `CardHistory.correlationId UUID?` e `RecordHistory.correlationId UUID?` (nullable — eventos antigos não têm). Usado pelos eventos `LINKED`/`UNLINKED` da 3.9 para correlacionar os dois lados (mesmo valor). Não é projetado pelas leituras 2.17/3.6 (allowlist não inclui) — sem impacto de vazamento; blindado por construção. `@@index([orgId, correlationId])` nas duas.

## Vocabulário de evento novo
`LINKED` / `UNLINKED` (em `CardHistory` e `RecordHistory`). Summary sem PII (só referências).

## Rollback
DROP TABLE `CardRecordLink`; DROP TYPE `CardRecordLinkState`; ALTER TABLE ... DROP COLUMN `correlationId` (Card/Record History). Aditivo e reversível; nenhum dado existente perdido.
