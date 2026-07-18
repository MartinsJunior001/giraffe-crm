# Data Model — Story 3.8: Campo Arquivo funcional e anexo geral

> **Meta: nenhuma tabela nova e nenhum GRANT novo além do que a 3.7 já concede.** A 3.7 materializa `FileObject`
> (mutável) e `FileScan` (append-only), org-scoped, RLS ENABLE+FORCE + `WITH CHECK`, com `resourceType`/
> `resourceId` **genéricos e imutáveis** (sem UPDATE). A 3.8 **referencia** essas linhas pelos recursos reais.
> **A forma final de `FileObject` é da 3.7** — este data-model se fecha quando a 3.7 mergear (NEEDS-3.7).

## Entidades reusadas (da 3.7 — não recriar)

### `FileObject` (org-scoped, mutável)
Campos (ADR §2): `id`, `orgId`, `bucketKey` (`<orgId>/<uuid>`), `nomeOriginal` (**PII**), `resourceType`,
`resourceId`, `state`, `createdAt`, `updatedAt`, `purgedAt`. GRANT `SELECT/INSERT` + `UPDATE
("state","nomeOriginal","updatedAt","purgedAt")`, **sem DELETE**. `bucketKey`/`orgId`/`resourceType`/`resourceId`
**sem UPDATE** → recurso não transferível garantido pelo banco.

### `FileScan` (org-scoped, append-only imutável)
`sha256Ingest`, `sha256Releitura`, `tamanhoBytes`, `mimeDetectado`, `veredito`, `scannedAt`. GRANT só `SELECT/INSERT`.

## O que a 3.8 acrescenta (mínimo, a confirmar no plan quando a 3.7 mergear)

### `resourceType` — valores concretos `CARD` e `RECORD`
A 3.7 nasce com `resourceType/resourceId` **genérico**. A 3.8 introduz os valores concretos que Card e Registro
usam. **Decisão (Q2, default):** validar por **allowlist no consumidor** (string) se a 3.7 modelar `resourceType`
como texto; se a 3.7 já usar enum, a 3.8 **estende o enum** por migration aditiva. Avatar (3.10) e E5/E6 estendem
depois — extensível sem acoplar a capacidade.

### Finalidade (Campo Arquivo × anexo geral) — discriminador SÓ se necessário
- **Opção A (preferida, sem coluna):** o **Campo Arquivo** mora no JSONB `valores` do Card/Registro (referência ao
  `fileId` por `Field.id`); o **anexo geral** é a linha `FileObject` **sem** referência em `valores`. A distinção é
  "referenciado por um `Field` vs. não". **Sem migration.**
- **Opção B (coluna `purpose ∈ {FIELD, ATTACHMENT}` + `fieldId?` em `FileObject`):** só se a Opção A não distinguir
  com clareza os fluxos de listagem/remoção. **Migration aditiva + fase vermelha.**
- **Default do planner:** Opção A (AD-11 "sem tabela/coluna a mais quando o JSONB resolve"). **Confirmar no plan.**

## Valor do Campo `FILE` no JSONB `valores` (por `Field.id`)

- **Único:** `valores[fieldId] = "<fileId>"`.
- **Múltiplo** (`typeConfig.multiplo = true`, congelado no snapshot da `FormVersion` — AD-12):
  `valores[fieldId] = ["<fileId>", ...]`.
- **Validação (submission.ts):** cada `fileId` é `FileObject` `AVAILABLE`, mesma Org, **vinculado a este
  recurso/finalidade**. `QUARANTINED`/cross-recurso/`fileId` inexistente → rejeita (400/409). Sem obrigatoriedade
  inventada (usa `Field.required` do snapshot — 2.15).

## Eventos (append-only, sem PII)

- `CardHistory`: `FILE_ATTACHED` / `FILE_REPLACED` / `FILE_REMOVED` (referenciando `fileId`, nunca `nomeOriginal`).
- `RecordHistory`: idem. Ambos escritos na **mesma transação** da mutação (`definirContextoOrg`, client raiz).
- **Substituição:** `FILE_REPLACED` referencia o `fileId` novo e o anterior; o anterior só é soft-deleted após o
  novo virar `AVAILABLE`.

## GRANT / RLS (herdado — a 3.8 não abre, como meta)

- `FileObject`/`FileScan`: RLS ENABLE+FORCE + `WITH CHECK` (INSERT e UPDATE) — da 3.7; em `MODELOS_AUDITADOS`.
- `CardHistory`/`RecordHistory`: append-only (`SELECT/INSERT`) — 2.7/3.4.
- **Se a Opção B (coluna nova) for adotada:** a migration é aditiva a `FileObject` (que já tem UPDATE column-scoped
  na 3.7) — `purpose`/`fieldId` entram no escopo de UPDATE **só** se mutáveis; senão ficam fora (imutáveis). Fase
  vermelha de GRANT provada por mutação.
