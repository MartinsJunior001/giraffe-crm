# Contrato HTTP — Databases (Story 3.1)

> API interna (NestJS 11). Todas as rotas: **autenticadas**, sob **contexto de Organização** resolvido no
> servidor (nenhuma aceita `orgId` do cliente), autorizadas via `@Requer(<ação>, 'Database')` (guard + CASL) e
> executadas sob `withTenantContext`. Espelha o controller de `Pipe` (2.1). **Sem rota de exclusão.**

## Autorização (3.1)

- **Admin da Org:** `ler` e `administrar` Databases da própria Org (todas as rotas abaixo).
- **MEMBER/GUEST:** **negados** em tudo (deny-by-default) — papéis por Database são a **3.2**.
- Recurso de outra Org: **404 não-enumerante** (nunca revela existência).

## Rotas

### `POST /databases` — criar
- **Body:** `{ "name": string }` (não vazio, sanitizado; sem `orgId`).
- **Ação:** `administrar`.
- **201 Created** → `{ id, name, state: "ACTIVE", archivedAt: null, createdAt, updatedAt }`.
- **400** nome inválido (mensagem sanitizada). **403** não-Admin. 

### `GET /databases` — catálogo (listar)
- **Query (opcional):** filtro por `state` (`ACTIVE`/`ARCHIVED`); default = todos da Org, ou ativos — decisão de
  implementação alinhada ao catálogo de `Pipe`. **Distinto do catálogo de Pipe** (rota/tabela próprias).
- **Ação:** `ler`.
- **200 OK** → `Database[]` **apenas da Org atual** (RLS). Nunca lista de outra Org.

### `GET /databases/:id` — obter
- **Ação:** `ler`.
- **200 OK** → `Database`. **404** se não existir **ou** for de outra Org (não-enumerante).

### `PATCH /databases/:id` — renomear
- **Body:** `{ "name": string }`.
- **Ação:** `administrar`.
- **200 OK** → `Database` atualizado.
- **409 Conflict** se `state = ARCHIVED` (**somente-leitura integral** — D1; `{ motivo: "DATABASE_ARQUIVADO" }`).
- **400** nome inválido. **403** não-Admin. **404** inexistente/cross-tenant.

### `POST /databases/:id/archive` — arquivar
- **Ação:** `administrar`.
- **200 OK** (`@HttpCode(HttpStatus.OK)` — transição, **não** cria) → `Database` com `state: "ARCHIVED"`,
  `archivedAt` preenchido. **Idempotente:** já-`ARCHIVED` → **200** no-op (sem `updateMany`).
- **Não bloqueado** por Registros vinculados (inexistentes em 3.1; contrato futuro). **403**/**404** conforme acima.

### `POST /databases/:id/restore` — restaurar
- **Ação:** `administrar`.
- **200 OK** (`@HttpCode`) → `Database` com `state: "ACTIVE"`, `archivedAt: null`, **identidade/referências
  preservadas**. **Idempotente:** já-`ACTIVE` → **200** no-op. **403**/**404** conforme acima.

## Não existe

- `DELETE /databases/:id` — **sem exclusão definitiva** (e sem GRANT de DELETE no banco; uma rota adicionada por
  engano bateria em `permission denied`).
- Duplicação; transferência entre Organizações; qualquer rota que aceite `orgId`.

## Códigos de status (resumo)

| Situação | Código |
|----------|--------|
| Criar | 201 |
| Listar / obter / renomear / arquivar / restaurar (sucesso) | 200 |
| Renomear com `state = ARCHIVED` | 409 |
| Arquivar já-arquivado / restaurar já-ativo | 200 (no-op idempotente) |
| Não-Admin (MEMBER/GUEST) | 403 |
| Inexistente ou cross-tenant | 404 (não-enumerante) |
| Nome inválido | 400 (sanitizado) |
| Tentativa de DELETE (banco) | `permission denied` (nunca há rota) |
