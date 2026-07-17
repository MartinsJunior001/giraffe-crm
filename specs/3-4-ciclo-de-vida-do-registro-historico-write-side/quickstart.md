# Quickstart — validar a Story 3.4

Pré: PostgreSQL no ar (`docker compose up -d db`), migrations aplicadas, seed.

```bash
# migration da 3.4
pnpm --filter @giraffe/api db:migrate
pnpm --filter @giraffe/api db:status

# testes-alvo (PostgreSQL real)
pnpm --filter @giraffe/api exec vitest run test/records-rls.test.ts test/records-http.test.ts

# regressão do reuso (Card + Formulário de Database)
pnpm --filter @giraffe/api exec vitest run test/card-submission-http.test.ts test/database-forms-http.test.ts

# suíte serial (gate autoritativo = CI limpo)
pnpm --filter @giraffe/api test:ci

# SC-206 (drill de rollback)
pnpm --filter @giraffe/api db:rollback   # DESTRUTIVO — só em base descartável; drop Record/RecordHistory
pnpm --filter @giraffe/api db:migrate    # reapply
```

## Fluxo funcional (via HTTP, contexto de Org resolvido)

1. Ter um Database com Formulário de Database **publicado** (3.3).
2. `POST /databases/:id/records` com `{ idempotencyKey, valores }` → 201 + Registro ATIVO; evento CREATED.
3. Repetir o mesmo `idempotencyKey` → 200 com o **mesmo** Registro (idempotente).
4. `PATCH /databases/:id/records/:recordId` `{ valores }` → 200; evento VALUES_UPDATED.
5. `POST .../archive` → 200 ARQUIVADO; editar agora → 409. `POST .../restore` → 200 ATIVO.
6. VIEWER do Database em qualquer POST/PATCH → 403; sem acesso → 404.
