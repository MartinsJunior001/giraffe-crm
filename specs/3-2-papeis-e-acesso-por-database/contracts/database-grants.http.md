# Contrato HTTP — Concessões de Database (Story 3.2)

> API interna (NestJS 11). Todas as rotas: **autenticadas**, sob **contexto de Organização** resolvido no
> servidor (nenhuma aceita `orgId` do cliente), com guarda **grossa** `@Requer('ler', 'Database')` (guard + CASL —
> aberto a qualquer Membership ativa nesta Story) e **guarda fina no serviço** via `database-authz.ts` (a
> autoridade real). Executadas sob `withTenantContext`. Espelha o controller de `PipeGrant` (2.2). **Sem rota de
> exclusão** (revogar é soft-delete).

## Autorização (3.2) — grossa no guard, fina no serviço

- **Guarda grossa (guard):** `@Requer('ler','Database')` — confirma só o TIPO ("pode ler *algum* Database na
  Org"). Como `ler Database` foi aberto a qualquer Membership ativa (D6), MEMBER/GUEST **passam** o guard; a
  autoridade real é a fina.
- **Guarda fina (serviço, `database-authz.ts`):**
  - **Conceder/alterar/revogar `ADMIN` do Database:** só **Admin da Org** (403 para Admin do Database — Q1/D3).
  - **Conceder/alterar/revogar `MEMBER`/`VIEWER`:** **Admin da Org** ou **Admin do Database** (403 para
    Membro/Somente-leitura; 404 sem acesso ao Database).
  - **Listar concessões:** quem **gerencia** o Database (Admin da Org ou Admin do Database) — `exigirGerenciarDatabase`.
- **Teto da Org (AD-9):** alvo `Membership.role = GUEST` → só `VIEWER` (senão **400**).
- **Recurso/alvo de outra Org:** Database inexistente/cross-tenant → **404 não-enumerante**; `membershipId` alvo
  inexistente/inativo/de outra Org → **400** (corpo inválido; o recurso da rota — o Database — existe).

## Rotas — base `/databases/:databaseId/grants`

### `POST /databases/:databaseId/grants` — conceder papel
- **Body:** `{ "membershipId": uuid, "role": "ADMIN" | "MEMBER" | "VIEWER" }` (sem `orgId`).
- **Guarda grossa:** `ler Database`. **Fina:** `exigirConcederPapel(databaseId, role)`.
- **201 Created** → `Grant` (`{ id, databaseId, membershipId, role, state: "ACTIVE", createdAt, updatedAt,
  revokedAt: null }` — **sem `orgId`**).
- **400** `role`/`membershipId` inválido; alvo não é Membership ATIVA da Org; **GUEST recebendo ADMIN/MEMBER**
  (teto da Org).
- **403** Admin do Database tentando conceder `ADMIN`; Membro/Somente-leitura tentando conceder.
- **404** Database inexistente/cross-tenant; sem acesso ao Database (não-enumerante).
- **409** já existe concessão ACTIVE para este `(Database, membershipId)` (índice único parcial — alterar é o PATCH).

### `GET /databases/:databaseId/grants` — listar concessões ativas (roster do Database)
- **Guarda grossa:** `ler Database`. **Fina:** `exigirGerenciarDatabase(databaseId)`.
- **200 OK** → `Grant[]` **ACTIVE** daquele Database, **apenas da Org atual** (RLS).
- **403** quem só lê/opera o Database (não gerencia). **404** Database inexistente/cross-tenant/sem acesso.

### `PATCH /databases/:databaseId/grants/:grantId` — alterar papel
- **Body:** `{ "role": "ADMIN" | "MEMBER" | "VIEWER" }`.
- **Guarda grossa:** `ler Database`. **Fina:** `exigirConcederPapel` para o **papel de destino** **e**, se a
  concessão atual é `ADMIN`, exige **Admin da Org** (Admin do Database não altera um ADMIN — Q1/D3).
- **200 OK** → `Grant` atualizado.
- **400** `role` inválido; teto da Org (GUEST → não-VIEWER). **403** autoridade insuficiente (ex.: Admin do
  Database elevando para ADMIN ou mexendo em concessão ADMIN). **404** concessão inexistente/de outro Database/
  cross-tenant/já revogada (não-enumerante).

### `DELETE /databases/:databaseId/grants/:grantId` — revogar (soft-delete)
- **Guarda grossa:** `ler Database`. **Fina:** `exigirConcederPapel` para o papel da concessão-alvo (Admin do
  Database só revoga `MEMBER`/`VIEWER`; revogar um `ADMIN` exige Admin da Org).
- **200 OK** (`@HttpCode(HttpStatus.OK)` — transição de estado, **não** exclusão; devolve a concessão revogada,
  não 204) → `Grant` com `state: "REVOKED"`, `revokedAt` preenchido. **O acesso cessa imediatamente.**
- **403** autoridade insuficiente. **404** inexistente/de outro Database/cross-tenant/já revogada.

## Ajuste em rotas da 3.1 (catálogo)

- `GET /databases` (listar) e `GET /databases/:id` (obter): MEMBER/GUEST **passam** a ver os Databases
  **concedidos** (por `DatabaseGrant` ACTIVE); Admin da Org vê **todos** (inalterado). `obter` de um Database sem
  concessão → **404 não-enumerante**. `POST /databases` e `PATCH`/`archive`/`restore` seguem **Admin da Org**
  (`administrar Database`).

## Não existe

- Nenhuma rota de **exclusão física** de concessão — **sem GRANT de DELETE** no banco; uma rota adicionada por
  engano bateria em `permission denied`.
- Nenhuma rota que aceite `orgId`. Nenhuma rota que crie concessão para o Admin da Org (acesso implícito — Q4).
- Nenhuma gestão de Membership da Org (Épico 8) — o Admin do Database não cria/convida/remove/altera Memberships.

## Códigos de status (resumo)

| Situação | Código |
|----------|--------|
| Conceder | 201 |
| Listar / alterar / revogar (sucesso) | 200 |
| Segunda concessão ACTIVE ao mesmo par | 409 |
| Autoridade insuficiente (ex.: Admin do DB → ADMIN) | 403 |
| Sem acesso ao Database / concessão inexistente | 404 (não-enumerante) |
| `role`/alvo inválido; teto da Org (GUEST → não-VIEWER) | 400 (sanitizado) |
| Tentativa de DELETE físico (banco) | `permission denied` (nunca há rota) |
