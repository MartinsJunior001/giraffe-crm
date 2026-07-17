# Contrato HTTP — Visualização de Registros (Story 3.5)

Sob `@Controller('databases/:databaseId')`, `@Requer('ler','Database')` (grossa; fina no serviço). `orgId` nunca
no payload/resposta. Read-side (sem mutação). Coexiste com `GET .../records/:recordId` (3.4).

## Listagem (poder: ler — `exigirLerDatabase`)

- `GET /databases/:databaseId/records` → **200** `RecordPaginaVisao`
  - Query params:
    - `take` (int, 1..100, default 50), `skip` (int, ≥0, default 0) — paginação offset.
    - `orderBy` (opcional): `Field.id` da definição, ou omitido (default `createdAt`). `dir` = `asc`|`desc`
      (default `desc`).
    - `incluirArquivados` (bool, default false) — inclui ARQUIVADOS (mesma autz de leitura).
    - `filtros` (opcional): lista de `{ fieldId, op, valor }` — `op` por tipo (texto: `contem`|`igual`; número/
      data: `igual`|`maior`|`menor`|`intervalo`; Seleção: `contemOpcao`; booleano: `igual`). Combinação por **E**.
  - Resposta: `{ linhas: RecordLinhaVisao[], total, skip, take, colunas }`.
  - Erros: **400** (`take`>100/ inválido; `orderBy`/`fieldId` desconhecido; operador inválido para o tipo; valor
    malformado para o tipo; filtro de **Arquivo** — gated 3.7/3.8); **404** (sem acesso ao Database /
    inexistente — não-enumerante); **401** (sem principal).

## `RecordLinhaVisao`

`{ id, valores, lifecycleState, podeEditar, createdAt, updatedAt }`. `podeEditar = Database ATIVO && Registro
ATIVO` (edição refletida, não executada — a mutação é 3.4, 409 sob arquivamento). Nunca `orgId`/`databaseId`/
`formVersionId`/`idempotencyKey`.

## Status codes

- 200: listagem (inclusive vazia — Database sem Registros visíveis).
- 400: paginação/ordenação/filtro inválidos; filtro de Arquivo (gated).
- 404: sem acesso ao Database (não-enumerante) / Database inexistente.
- 401: sem principal.

## INV-REPORT-01

A contagem (`total`) e as linhas são sempre do **Database consultado**, que o principal pode ler
(`exigirLerDatabase` → 404 sem acesso). Nenhuma rota agrega/contabiliza Registros de Databases inacessíveis.
