# Quickstart — Validação da Story 3.1 (Ciclo de vida e catálogo de Databases)

> Roteiro de validação **executável** (não é implementação). Prova o ciclo de vida do Database end-to-end contra
> PostgreSQL **real**, incluindo o **isolamento (RLS)** e a **fase vermelha** do GRANT. Detalhes em `contracts/` e
> `data-model.md`.

## Pré-requisitos

```bash
cp .env.example .env                                   # senhas exigidas pelo Compose
docker compose up -d db                                # PostgreSQL 16 (127.0.0.1:5434)
pnpm --filter @giraffe/api db:migrate                  # inclui a nova migration _databases
pnpm --filter @giraffe/api db:seed                     # Orgs A, B, C
```

> **Regra de ouro dos testes:** escrever na **Org C** com contas descartáveis (`randomUUID`). **Nunca** reusar
> Ana/Bruno/Carla/Eva do seed em `membership.create` persistente ([[test-iso-01-causa-raiz]]).

## Cenário 1 — Criar e catalogar (CA1)

1. Como **Admin da Org C**: `POST /databases { name: "Clientes" }` → **201**, `state: "ACTIVE"`.
2. `GET /databases` → **200**, lista contém "Clientes"; **não** contém Pipes (catálogo/rota/tabela distintos —
   RN-061). `GET /databases/:id` → **200**.
3. `PATCH /databases/:id { name: "Contatos" }` → **200**, nome atualizado no catálogo.

## Cenário 2 — Arquivar = somente-leitura integral; não bloqueado (CA2/CA3)

1. `POST /databases/:id/archive` → **200** (`@HttpCode`), `state: "ARCHIVED"`, `archivedAt` preenchido.
   **Não** bloqueado (não há Registros vinculados em 3.1 — contrato futuro).
2. `PATCH /databases/:id { name: "X" }` (renomear — único write-side de Database em 3.1) → **409**
   (`DATABASE_ARQUIVADO`). Prova a somente-leitura integral com consumidor concreto.
3. `GET /databases/:id` → **200** (dados existentes seguem **consultáveis**).
4. `POST /databases/:id/archive` de novo → **200** no-op idempotente (sem 2ª escrita/ruído de auditoria).

## Cenário 3 — Restaurar preserva identidade (CA4)

1. `POST /databases/:id/restore` → **200**, `state: "ACTIVE"`, `archivedAt: null`; **mesmo `id` e `name`**.
2. `PATCH /databases/:id { name: "Y" }` → **200** (escrita reabilitada).
3. `POST /databases/:id/restore` de novo → **200** no-op idempotente.

## Cenário 4 — Autorização deny-by-default (CA5)

| Ator | Ação | Esperado |
|------|------|----------|
| MEMBER (sem papel de Database) | `POST/GET/PATCH/archive/restore` | **403** (deny-by-default; papéis = 3.2) |
| GUEST | idem | **403** |
| Sem acesso / outra Org | `GET/PATCH/... /:id` | **404** não-enumerante |

## Cenário 5 — Isolamento (RLS) e GRANT: fase vermelha (segurança)

`databases-rls.test.ts` (PostgreSQL real):

1. **Isolamento:** um Database criado na Org C **não** aparece sob contexto da Org A/B (SELECT/list).
2. **`WITH CHECK` sem RETURNING:** INSERT com `orgId` alheio via `createMany` (sem `RETURNING`, que esbarraria na
   policy de SELECT e mascararia o teste) é **negado** — prova o `WITH CHECK` do INSERT.
3. **UPDATE cross-tenant:** tentar mover a linha para outra Org no UPDATE → **negado** pelo `WITH CHECK` do UPDATE.
4. **Contexto ausente:** query sem `withTenantContext` → negada (FORCE RLS, `current_org_id()` NULL).
5. **Fase vermelha do GRANT:** com a linha de GRANT removida/comentada, INSERT/UPDATE sob contexto →
   `permission denied` (prova que é o **banco** que autoriza). **Sem DELETE:** DELETE em `Database` →
   `permission denied` (segue sem GRANT).

## Cenário 6 — Migration reversível (SC-206)

Em **banco descartável**: `db:migrate deploy` → verificar RLS/policies/GRANT/índice → smoke (criar/arquivar/
restaurar) → `rollback` (down.sql) → remoção da tabela/enum → **reaplicar** a migration. Confirma que o rollback
é simétrico e a migration reaplicável. ⚠️ Em produção o rollback **apaga** Databases — exige backup verificado.

## Comandos de teste

```bash
# suíte da API (local, paralela por padrão)
pnpm --filter @giraffe/api test

# arquivos desta Story
pnpm --filter @giraffe/api exec vitest run test/databases-rls.test.ts
pnpm --filter @giraffe/api exec vitest run test/databases-authz.test.ts
pnpm --filter @giraffe/api exec vitest run test/databases-http.test.ts

# suíte cheia como no CI (serial — estado-alvo do isolamento)
pnpm --filter @giraffe/api test:ci
```

## Critério de pronto

- [ ] CA1–CA6 verdes contra PostgreSQL real.
- [ ] Isolamento provado (Org C invisível para A/B; WITH CHECK no INSERT e no UPDATE; contexto ausente negado).
- [ ] Fase vermelha do GRANT provada (quebra antes, concede depois); **sem DELETE**.
- [ ] Renomear em `ARCHIVED` → 409; arquivar/restaurar idempotentes (200 no-op).
- [ ] MEMBER/GUEST negados (403); cross-tenant 404 não-enumerante.
- [ ] SC-206 (deploy + rollback + reaplicação) em banco descartável.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test:ci` verdes.
