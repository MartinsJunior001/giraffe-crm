# Quickstart — validar a Story 3.5

Pré: PostgreSQL no ar; migrations aplicadas; um Database com Formulário publicado e alguns Registros (3.4).

```bash
# testes-alvo (PostgreSQL real) + unidade do núcleo de filtros
pnpm --filter @giraffe/api exec vitest run test/records-read-rls.test.ts test/records-read-http.test.ts test/record-query-core.test.ts

# regressão 3.4
pnpm --filter @giraffe/api exec vitest run test/records-http.test.ts test/records-rls.test.ts

# suíte serial (gate autoritativo = CI limpo)
pnpm --filter @giraffe/api test:ci
```

## Fluxo funcional (HTTP, contexto de Org)

1. `GET /databases/:id/records` → 200, Registros ATIVOS, `total`, `colunas`, paginação default.
2. `?take=10&skip=0&orderBy=<fieldId>&dir=asc` → ordena pelo Campo.
3. `?filtros=[{fieldId,op:contem,valor:"ana"}]` → filtra por texto (E de vários filtros).
4. `?incluirArquivados=true` → inclui ARQUIVADOS; cada linha traz `lifecycleState` e `podeEditar`.
5. `orderBy`/`fieldId` desconhecido, operador inválido, filtro de Arquivo → **400**.
6. Sem acesso ao Database → **404**; VIEWER concedido → **200** (ler ≠ operar); cross-tenant → 404.
