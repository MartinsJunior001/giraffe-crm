# Data Model — Story 3.5

**Sem migration. Sem GRANT novo. Sem nova entidade.** A 3.5 é **leitura pura** sobre `Record`/`RecordHistory`
(3.4) e `Field` (3.3). O runtime segue com o GRANT column-scoped da 3.4 (`SELECT/INSERT` + UPDATE de
`lifecycleState`/`valores`/`updatedAt`); ler é `SELECT`, já concedido.

## Projeções (saída da API)

### `RecordLinhaVisao` (linha da tabela)
`{ id, valores, lifecycleState, podeEditar, createdAt, updatedAt }`.
- `valores`: JSONB por `Field.id` — **exibido** (o Registro é o dado; acesso por Database). Fora de log.
- `podeEditar`: `Database.state === 'ACTIVE' && lifecycleState === 'ATIVO'` (edição refletida, não executada).
- **Nunca** `orgId`/`databaseId`/`formVersionId`/`idempotencyKey`/`origin` na linha.

### `RecordPaginaVisao` (página)
`{ linhas: RecordLinhaVisao[], total, skip, take, colunas: { fieldId, label, type }[] }`.
- `colunas`: Campos **ativos** da definição (para o cabeçalho da tabela); sem `typeConfig` sensível além do
  necessário.
- `total`: contagem dos Registros **visíveis** do Database consultado (INV-REPORT-01 seguro).

## Query (parametrizada, sob RLS)

```sql
-- linhas
SELECT "id","valores","lifecycleState","createdAt","updatedAt"
FROM "Record"
WHERE "databaseId" = $db
  AND ("lifecycleState" = 'ATIVO' OR $incluirArquivados)
  AND <predicados de filtro parametrizados>
ORDER BY <ordExpr> <dir>, "id" ASC
LIMIT $take OFFSET $skip;

-- total (mesmo WHERE, sob o mesmo contexto)
SELECT COUNT(*)::int AS total FROM "Record" WHERE ... ;
```

- `<ordExpr>`: `"createdAt"` (default) ou `("valores"->>$fieldId)` com coerção por tipo (`::numeric`/`::timestamptz`
  /texto). `$fieldId` bound; `<dir>` de allowlist (`ASC`/`DESC`).
- `<predicados>`: por filtro validado — ex.: `"valores"->>$k ILIKE $v` (contém), `= $v` (igual),
  `("valores"->>$k)::numeric > $v` (número maior), etc. Operador de allowlist; `$k`/`$v` bound.

Roda por `prisma.$transaction([...definirContextoOrg(prisma, ctx), $queryRaw(linhas), $queryRaw(total)])` — RLS
filtra por `current_org_id()`.
