# Plan — Story 3.5

Baseline `ba412d7`. Read-side puro (sem migration/GRANT). Uma query raw parametrizada sob RLS para filtrar +
ordenar por Campo + paginar (offset), reusando os padrões de leitura (2.9) e contexto (2.6).

## Decisões do clarify (Q1–Q5)

- **Q1** `total` exposto (contagem escopada ao Database legível — INV-REPORT-01 seguro).
- **Q2** ordenação por Campo via `ORDER BY "valores"->>$fieldId` parametrizado; coerção por tipo; desempate `id`.
- **Q3** número/data por coerção (`::numeric`/`::timestamptz`) com o valor validado por tipo antes (400 se
  malformado).
- **Q4** sem acesso → 404 não-enumerante (nunca 403 enumerante).
- **Q5** paginação **offset** (`skip`/`take ≤ 100`) + `total`.

## Camadas e arquivos (todos em `apps/api/src/databases/records/`)

1. **`record-query.core.ts`** (puro): valida a query (filtros/orderBy) contra a lista de Campos da definição
   (allowlist de `Field.id` + operadores por tipo); coage/valida o valor por tipo; devolve um **plano** estruturado
   (filtros validados, orderBy `{fieldId|createdAt, dir}`, `skip`, `take`). Erro tipado → 400. **Rejeita** o filtro
   de Arquivo (gated). Provado em unidade.
2. **`records-read.service.ts`** (`RecordsReadService`): `exigirLerDatabase`; resolve os Campos ativos da
   definição publicada/rascunho (para a allowlist e as colunas); chama o núcleo; monta `Prisma.sql` parametrizado
   (WHERE + ORDER BY + LIMIT/OFFSET) e roda por `prisma.$transaction([...definirContextoOrg(prisma, ctx),
   prisma.$queryRaw(sql), prisma.$queryRaw(countSql)])`; projeta `RecordLinhaVisao` (com `podeEditar`). `orgId`
   fora da fronteira.
3. **`records-query.dto.ts`**: parse manual de `skip`/`take`/`orderBy`/`dir`/`filtros[]`/`incluirArquivados`.
4. **Controller** (`records.controller.ts`, existente da 3.4): adiciona `GET /databases/:databaseId/records` (200
   `RecordPaginaVisao`). Coexiste com `GET .../records/:recordId` (Nest resolve rota estática vs. param).
5. **Fiação:** `RecordsReadService` em `DatabasesModule` (sem novo módulo).
6. **Testes:** `records-read-rls`, `records-read-http`, `record-query.core` (unidade).
7. **Docs:** `CLAUDE.md` (bloco de estado 3.5); gate `gates/3-5/`.

## Segurança da query raw

- **Colunas/tabela:** literais fixos (`"Record"`, `"valores"`, `"lifecycleState"`, `"createdAt"`, `"id"`).
- **`Field.id`:** validado como UUID pertencente à definição do Database (allowlist) **e** bound como parâmetro
  (`"valores"->>$n`).
- **Operador:** mapeado de um enum de allowlist para um fragmento SQL fixo (`Prisma.raw` de um literal controlado,
  nunca entrada do cliente).
- **Valores:** sempre bound (`$n`).
- **`databaseId`/estado/limit/offset:** bound.
- RLS aplicada por rodar sob `definirContextoOrg` (cross-tenant invisível — provado).

## Ordem de execução (tasks)

T001 (gate) → T002 (núcleo puro) → T003 (service) → T004 (dto) → T005 (controller) → T006 (fiação) → T007/T008/
T009 (testes rls/http/unidade) → T010 (regressão) → T011 (CLAUDE.md) → T012 (revisão) → T013 (commit-check→PR→CI→
merge→closure).

## Riscos e mitigação

Ver `spec.md §7`. Principal: injeção — mitigada por allowlist + parametrização total; prova por teste (Campo
desconhecido → 400; RLS cross-tenant → invisível). INV-REPORT-01 por escopo de Database legível + 404.
