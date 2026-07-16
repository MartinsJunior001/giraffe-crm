# Data Model — Story 3.4

## Enum `RecordLifecycleState`

`ATIVO | ARQUIVADO` — 2 estados persistentes. Não há `FINALIZADO` (é do Card). `restaurado`/`arquivado` são
transições. Restaurar sempre volta a **ATIVO** (sem estado anterior a preservar).

## Enum `RecordOrigin` (mínimo — AD-11)

`NOVO_REGISTRO` (único valor com consumidor na 3.4 — criação interna autenticada). `AUTOMACAO` (E4) e `PUBLIC`
**não** são materializados agora (sem consumidor). Default `NOVO_REGISTRO`.

## Modelo `Record`

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | identidade estável; preservada por arquivar/restaurar |
| `orgId` | uuid | RLS `current_org_id()`; fora do payload; **sem** UPDATE |
| `databaseId` | uuid FK→Database(Cascade) | dono; **não transferível** (sem UPDATE) |
| `formId` | uuid FK→Form(Cascade) | Formulário de Database de origem |
| `formVersionId` | uuid FK→FormVersion(Cascade) | **definição congelada** (AD-12); sem UPDATE |
| `idempotencyKey` | string | idempotência; sem UPDATE |
| `valores` | Json `@default("{}")` | JSONB por `Field.id`; validado contra snapshot; **UPDATE permitido** (edição) |
| `origin` | RecordOrigin `@default(NOVO_REGISTRO)` | sem UPDATE |
| `lifecycleState` | RecordLifecycleState `@default(ATIVO)` | **UPDATE permitido** (ciclo de vida) |
| `createdAt` | DateTime `@default(now())` | |
| `updatedAt` | DateTime `@updatedAt` | **UPDATE permitido** |

Relations: `organization`, `database`, `form`, `formVersion`, `history RecordHistory[]`.
Índices: `@@unique([orgId, databaseId, idempotencyKey])` (**raw SQL** na migration — idempotência);
`@@index([orgId, databaseId])` (consulta por Database — 3.5 consumirá).

### GRANT (fronteira de segurança)

`GRANT SELECT, INSERT ON "Record" TO giraffe_app;`
`GRANT UPDATE ("lifecycleState", "valores", "updatedAt") ON "Record" TO giraffe_app;`
**Sem DELETE.** **Sem** UPDATE em `databaseId`/`formVersionId`/`orgId`/`origin`/`idempotencyKey`/`formId` → uma
tentativa de "mover"/reatribuir bate em `permission denied` (provado em `records-rls`).

### RLS

ENABLE + FORCE ROW LEVEL SECURITY; 4 policies (`select/insert/update/delete`) por `orgId = current_org_id()`,
`WITH CHECK` no INSERT **e** UPDATE. Policy `delete` existe por simetria/defesa; quem barra o runtime é a
ausência de GRANT DELETE.

## Modelo `RecordHistory` (write-side append-only)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid | RLS |
| `recordId` | uuid FK→Record(Cascade) | |
| `type` | string | `CREATED`/`VALUES_UPDATED`/`ARCHIVED`/`RESTORED` (arquivo=3.8, vínculo=3.9) |
| `summary` | string | legível, sem PII desnecessária |
| `actorId` | uuid? | ator/iniciador quando disponível |
| `createdAt` | DateTime `@default(now())` | |

Índice: `@@index([orgId, recordId, createdAt])` (a 3.6 consumirá para a timeline).

### GRANT / RLS

`GRANT SELECT, INSERT ON "RecordHistory" TO giraffe_app;` — **sem UPDATE/DELETE** (imutável, como
`CardHistory`/`FormVersion`). RLS ENABLE+FORCE + 4 policies com `WITH CHECK`.

## `MODELOS_AUDITADOS`

Acrescentar `Record` e `RecordHistory` em `tenant-context.ts` (mutação organizacional entra na trilha de
auditoria técnica, inclusive tentativa negada — coerente com o restante do domínio).

## Migration & rollback

- **Migration `..._records`:** cria os 2 enums, as 2 tabelas, FKs, RLS+policies, GRANTs, índice único de
  idempotência (raw SQL) e `@@index`. Tabelas **novas e vazias** → sem backfill.
- **Rollback cirúrgico:** `DROP TABLE "RecordHistory"; DROP TABLE "Record"; DROP TYPE "RecordOrigin"; DROP TYPE
  "RecordLifecycleState";` (ordem respeita FK). Não toca `Database`/`Form`/`FormVersion`.
