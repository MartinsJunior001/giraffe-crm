# Quickstart — Validação da Story 3.2 (Papéis e acesso por Database)

> Roteiro de validação **executável** (não é implementação). Prova a concessão de papéis por Database, a
> **autoridade hierárquica**, o teto da Org, o corte imediato do acesso na revogação, o **isolamento (RLS)** e a
> **fase vermelha** do GRANT, contra PostgreSQL **real**. Detalhes em `contracts/` e `data-model.md`.

## Pré-requisitos

```bash
cp .env.example .env                                   # senhas exigidas pelo Compose
docker compose up -d db                                # PostgreSQL 16 (127.0.0.1:5434)
pnpm --filter @giraffe/api db:migrate                  # inclui a nova migration _database_grants
pnpm --filter @giraffe/api db:seed                     # Orgs A, B, C
```

> **Regra de ouro dos testes:** escrever na **Org C** com contas descartáveis (`randomUUID`). **Nunca** reusar
> Ana/Bruno/Carla/Eva do seed em `membership.create` persistente ([[test-iso-01-causa-raiz]]). Precisa-se de um
> **Database** na Org C (criado pelo Admin, via 3.1) e de Memberships-alvo descartáveis (MEMBER e GUEST).

## Cenário 1 — Admin da Org concede e o acesso passa a existir (CA1)

1. Como **Admin da Org C**: crie um Database "Clientes" (3.1). Uma Membership MEMBER descartável **sem** concessão:
   `GET /databases` → **não** lista "Clientes"; `GET /databases/:id` → **404 não-enumerante**.
2. Admin: `POST /databases/:id/grants { membershipId: <member>, role: "MEMBER" }` → **201**.
3. O MEMBER concedido: `GET /databases` → **200**, lista "Clientes"; `GET /databases/:id` → **200**. Um **segundo**
   Database sem concessão continua **404** para ele (não enxerga o que não lhe foi concedido).

## Cenário 2 — Autoridade hierárquica: Admin do Database (CA2)

1. Admin da Org concede `ADMIN` do Database a uma Membership X (só o Admin da Org pode — Q1/D3).
2. Como **X (Admin do Database)**: `POST /.../grants { membershipId: <outro>, role: "VIEWER" }` → **201**;
   `... role: "MEMBER"` → **201**. (Admin do Database concede Membro/Somente leitura.)
3. Como **X**: `POST /.../grants { role: "ADMIN" }` → **403** (só Admin da Org concede Admin do Database).
4. Como **X**: `PATCH /.../grants/:adminGrantId { role: "MEMBER" }` sobre uma concessão `ADMIN` → **403**;
   `DELETE /.../grants/:adminGrantId` (revogar um ADMIN) → **403**.
5. Como **X**: qualquer rota de gestão de Membership da Org → **não existe** (o Admin do Database não gere
   Memberships — fora do escopo/Épico 8).

## Cenário 3 — Teto da Org: Convidado só Somente leitura (CA3)

| Ator concede a | role pedido | Esperado |
|----------------|-------------|----------|
| GUEST (Membership `role=GUEST`) | `VIEWER` | **201** |
| GUEST | `MEMBER` | **400** (teto da Org — AD-9) |
| GUEST | `ADMIN` | **400** (teto da Org) |

## Cenário 4 — Revogar corta o acesso imediatamente (CA4)

1. MEMBER concedido acessa "Clientes" (`GET /databases/:id` → 200).
2. Admin: `DELETE /databases/:id/grants/:grantId` → **200**, `state: "REVOKED"`, `revokedAt` preenchido.
3. O MEMBER: `GET /databases/:id` → **404** (acesso cessou na hora; a resolução lê só ACTIVE). A concessão
   revogada **permanece** na trilha (não foi apagada — autoria/Histórico preservados).

## Cenário 5 — No máximo um papel efetivo (CA5)

1. Admin concede `VIEWER` a M; depois `POST` de novo `{ membershipId: M, role: "MEMBER" }` ao mesmo Database →
   **409** (índice único parcial `WHERE state='ACTIVE'`; alterar é o **PATCH**).
2. `PATCH /.../grants/:grantId { role: "MEMBER" }` → **200** (altera o papel da concessão ativa).
3. Revogar M e **re-conceder** → **201** (linha nova ACTIVE; a unicidade só vale entre ativas).

## Cenário 6 — Autorização deny-by-default e não-enumeração (CA1/CA2)

| Ator | Ação | Esperado |
|------|------|----------|
| Sem concessão (não-Admin) | `GET/POST/PATCH/DELETE /databases/:id/grants...` | **404** não-enumerante |
| Membro/Somente-leitura do DB (não Admin do DB) | `POST /.../grants` | **403** |
| Admin do Database | conceder `ADMIN` | **403** |
| Admin do Database | conceder `MEMBER`/`VIEWER` | **201** |
| Admin da Org | qualquer papel | **201/200** |

## Cenário 7 — Isolamento (RLS) e GRANT: fase vermelha (segurança)

`database-grants-rls.test.ts` (PostgreSQL real):

1. **Isolamento:** uma concessão criada na Org C **não** aparece sob contexto da Org A/B.
2. **`WITH CHECK` sem RETURNING:** INSERT com `orgId` alheio via `createMany` (sem `RETURNING`, que esbarraria na
   policy de SELECT e mascararia o teste) é **negado** — prova o `WITH CHECK` do INSERT.
3. **UPDATE cross-tenant:** tentar mover a concessão para outra Org no UPDATE → **negado** (WITH CHECK do UPDATE).
4. **Contexto ausente:** query sem `withTenantContext` → negada (FORCE RLS, `current_org_id()` NULL).
5. **Índice único parcial:** dois INSERT ACTIVE ao mesmo `(databaseId, membershipId)` → o segundo **viola** o
   índice parcial; após revogar o primeiro, um novo ACTIVE é aceito.
6. **Fase vermelha do GRANT:** com a linha de GRANT removida/comentada, INSERT/UPDATE sob contexto →
   `permission denied`. **Sem DELETE:** DELETE em `DatabaseGrant` → `permission denied`.

## Cenário 8 — Migration reversível (SC-206)

Em **banco descartável**: `db:migrate deploy` → verificar 2 enums/tabela/RLS/policies/índice parcial/GRANT → smoke
(conceder/alterar/revogar) → `rollback` (down.sql) → remoção da tabela/enums **sem tocar** `Database`/`Membership`/
`PipeGrant` → **reaplicar**. ⚠️ Em produção o rollback **apaga** concessões — exige backup verificado.

## Comandos de teste

```bash
pnpm --filter @giraffe/api test                                          # local (paralelo)
pnpm --filter @giraffe/api exec vitest run test/database-grants-rls.test.ts
pnpm --filter @giraffe/api exec vitest run test/databases-authz.test.ts
pnpm --filter @giraffe/api exec vitest run test/database-grants-http.test.ts
pnpm --filter @giraffe/api test:ci                                        # suíte cheia (serial, estado-alvo)
```

## Critério de pronto

- [ ] CA1–CA6 verdes contra PostgreSQL real.
- [ ] Autoridade hierárquica provada (Admin do DB concede MEMBER/VIEWER; 403 ao conceder/alterar/revogar ADMIN).
- [ ] Teto da Org provado (GUEST só VIEWER; ADMIN/MEMBER a GUEST → 400).
- [ ] Revogar corta o acesso na hora (MEMBER volta a 404); concessão preservada na trilha.
- [ ] No máximo um papel ACTIVE por (Database, pessoa) (2ª concessão ativa → 409); re-conceder após revogar → 201.
- [ ] Não-enumeração: sem concessão → 404 (nunca 403 que revelaria existência).
- [ ] Isolamento (RLS) + fase vermelha do GRANT + **sem DELETE** provados.
- [ ] Admin da Org acessa todos sem grant (regressão da 3.1 verde).
- [ ] SC-206 (deploy + rollback + reaplicação) em banco descartável.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test:ci` verdes.
