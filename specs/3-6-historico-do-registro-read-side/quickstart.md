# Quickstart — Story 3.6

```bash
# banco no ar
docker compose up -d db
pnpm --filter @giraffe/api db:migrate   # nenhuma migration nova nesta Story

# testes-alvo (PostgreSQL real)
pnpm --filter @giraffe/api exec vitest run test/record-history-read-rls.test.ts test/record-history-read-http.test.ts

# regressão do Registro (3.4/3.5)
pnpm --filter @giraffe/api exec vitest run test/records-http.test.ts test/records-rls.test.ts test/records-read-http.test.ts test/records-read-rls.test.ts

# suíte serial (gate autoritativo = CI)
pnpm --filter @giraffe/api test:ci
```

Rota: `GET /databases/:databaseId/records/:recordId/history?cursor=&limite=` → `{ eventos, proximoCursor }`.
