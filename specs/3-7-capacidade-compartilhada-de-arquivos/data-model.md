# Data Model — Capacidade compartilhada de arquivos

> Detalhamento completo na ADR-001 §2. Aqui: o contrato de dados que o `tasks.md` implementa.

## FileObject (org-scoped, MUTÁVEL — ciclo de vida)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid | RLS por `current_org_id()`; nunca do cliente |
| `bucketKey` | text | chave opaca `<orgId>/<uuidv4>` no storage; **nunca** é autorização |
| `nomeOriginal` | text | **PII** — fora de log; mascarável |
| `resourceType` | text/enum | tipo do recurso dono (preenchido pelo consumidor via porta) |
| `resourceId` | uuid | id do recurso dono |
| `state` | enum | `QUARENTENA` → `DISPONIVEL` → `REMOVIDO_LOGICO` → `EXPURGADO` (+ `BLOCKED`) |
| `createdAt`/`updatedAt`/`purgedAt` | timestamptz | |

- **RLS**: ENABLE + FORCE; policies select/insert/update/delete por `orgId = current_org_id()`; **WITH CHECK** no INSERT **e** UPDATE.
- **GRANT** (runtime `giraffe_app`): `SELECT, INSERT` + `UPDATE ("state","nomeOriginal","updatedAt","purgedAt")`. **Sem DELETE.** `bucketKey`/`resourceType`/`resourceId`/`orgId` **sem** UPDATE (não transferível — provado por `permission denied`).
- Em `MODELOS_AUDITADOS`.

## FileScan (org-scoped, APPEND-ONLY IMUTÁVEL — fato apurado)

| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `orgId` | uuid | RLS |
| `fileId` | uuid FK→FileObject | |
| `tamanhoBytes` | bigint | |
| `mimeDetectado` | text | por conteúdo real (magic bytes) |
| `sha256Ingest` | text | checksum no aceite |
| `sha256Releitura` | text | checksum na releitura durante o scan (anti-troca-de-bytes) |
| `veredito` | enum | `CLEAN` / `BLOCKED` |
| `scannedAt` | timestamptz | |

- **RLS**: ENABLE + FORCE + WITH CHECK (INSERT).
- **GRANT**: **só `SELECT, INSERT`** — sem UPDATE/DELETE (imutável, como `FormVersion`/`CardHistory`).
- Em `MODELOS_AUDITADOS`.

## ScanSlot (GLOBAL, sem RLS — semáforo de verificação)

| Coluna | Tipo | Notas |
|---|---|---|
| `key` | text | `scan:<orgId>` |
| `token` | uuid | posse do slot |
| `expiraEm` | timestamptz | expiração (auto-liberação) |

- **Sem RLS** (global, como `RateLimit`/`Account`/`PublicFormRoute`). Vive conceitualmente sob `kernel/antiabuso/`.
- **GRANT**: `SELECT, INSERT, DELETE` (`liberarSlot` apaga a linha).
- Primitivas: `adquirirSlot(orgId)` (statement atômico: conta slots ativos, insere só abaixo do teto → token ou null/429); `liberarSlot(key, token)` (DELETE, em `finally`).

## Máquina de estados (núcleo puro)

```
QUARENTENA ──veredito CLEAN──▶ DISPONIVEL ──remover lógico──▶ REMOVIDO_LOGICO ──expurgo──▶ EXPURGADO
    │
    └──veredito BLOCKED──▶ BLOCKED (terminal; nunca baixável/associável)
```

- Transições **idempotentes** com guarda otimista (`updateMany where state=<lido>` → 409; caminho no-op não emite updateMany, para não falsear a auditoria).
- Promoção (QUARENTENA→DISPONIVEL) = **transação atômica** INSERT `FileScan` + UPDATE `FileObject.state` no client raiz (`definirContextoOrg`); P2002/P2028 → idempotente/409, nunca 500.
