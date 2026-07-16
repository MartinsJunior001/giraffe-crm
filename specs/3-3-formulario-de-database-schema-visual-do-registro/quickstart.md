# Quickstart — validar a Story 3.3

Pré: PostgreSQL no ar (127.0.0.1:5434), migrations aplicadas, seed (Orgs A/B/C).

```bash
pnpm --filter @giraffe/api db:migrate            # aplica ..._database_forms
pnpm --filter @giraffe/api db:status             # up to date
pnpm --filter @giraffe/api exec vitest run test/database-forms-rls.test.ts test/database-forms-http.test.ts
pnpm --filter @giraffe/api test:ci               # suíte serial (regressão de E2 incluída)
```

Fluxo manual (Admin da Org ou Admin do Database do Database X):
1. `GET /databases/X/form` → `{ id: null, context: 'DATABASE', databaseId: X, fields: [] }` (ler não cria).
2. `POST /databases/X/form/fields` (tipo TEXT) → 201; `GET` volta com 1 Campo e `id` preenchido.
3. `PATCH .../fields/:id` edita rótulo → 200; `type` não muda.
4. `POST .../form/publish` → 200 `VersaoDetalhe` (version 1, snapshot). Republicar após novo Campo → version 2.
5. MEMBER/VIEWER do Database: `GET` funciona (lê); `POST` de Campo → 403. Sem concessão → 404.

Fase vermelha (RLS): inserir `Form` DATABASE sem `databaseId` (ou com `pipeId`) → CHECK viola; `UPDATE`/`DELETE`
em `FormVersion` pelo runtime → `permission denied`.
