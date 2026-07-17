# Research — Story 3.5 (context7-check + análise)

## context7-check (Prisma 6.19.3 / PostgreSQL — obrigatório antes de codificar)

- **Filtro por JSON path (nativo):** Context7 (`/prisma/web`) confirma `where: { valores: { path: ['<fieldId>'],
  equals | string_contains | gt | gte | lt | lte: <valor> } }` no PostgreSQL — comparação com escalar suportada
  (a limitação `gt/lt` vale só ao comparar **campo com campo**, não é o caso aqui). Cobre texto (contém/igual),
  Seleção (contém opção via `array_contains`/`string_contains` conforme o shape) e Sim/Não (equals boolean).
- **`orderBy` sobre JSON path:** **não** suportado nativamente pelo Prisma 6.19.3 (limitação conhecida). Para a
  **ordenação por Campo** usa-se `ORDER BY "valores"->>$fieldId` em **raw parametrizado**.
- **Raw sob RLS:** `withTenantContext` embrulha cada operação de modelo em `$transaction([...definirContextoOrg,
  query])`; `$queryRaw` (client-level) **não** herda esse wrapper. Solução: rodar o raw pelo **mesmo primitivo** —
  `prisma.$transaction([...definirContextoOrg(prisma, ctx), prisma.$queryRaw(sql)])` no client raiz — de modo que
  a RLS enxergue `current_org_id()`. Padrão análogo ao das escritas (2.6/2.7/3.4). Fonte: `tenant-context.ts` +
  Context7 (JSON filtering).

**Conclusão do gate:** o filtro é nativo e seguro; a ordenação por Campo exige raw parametrizado sob o primitivo
de contexto — sem tecnologia nova, reuso de padrões verdes. Fonte: Context7 `/prisma/web` + `tenant-context.ts`.

## Decisão de implementação: uma query raw parametrizada para a listagem

Como filtro (nativo) e ordenação por Campo (raw) não se combinam numa única chamada Prisma nativa, a listagem é
**uma query raw parametrizada** coerente (WHERE dos filtros + ORDER BY do Campo + LIMIT/OFFSET), rodada sob
contexto. Vantagens: um caminho único, ordenação por Campo entregue, tudo parametrizado (`Prisma.sql`/`Prisma.join`
/`Prisma.raw` só para fragmentos de **operador de allowlist**, nunca para entrada do cliente). O `total` é um
segundo raw `COUNT(*)` com o mesmo WHERE, sob o mesmo contexto.

## Reuso

| Peça | Origem | Uso |
|---|---|---|
| `exigirLerDatabase` (404 não-enumerante) | 3.2 | autz da tabela (qualquer poder — ler ≠ operar) |
| `definirContextoOrg` (contexto no client raiz) | 2.6 | rodar o raw sob RLS |
| Campos da definição (`Field` ativos) | 3.3/3.4 | allowlist de Campos p/ filtro/ordenação |
| padrão de projeção sem `orgId`/PII fora de log | 2.9 | `RecordLinhaVisao` |
| `RecordVisao`/`podeEditar` (Database/Registro ATIVO) | 3.4 | edição refletida |
