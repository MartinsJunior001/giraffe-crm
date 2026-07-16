# Data Model — Story 3.2 (Papéis e acesso por Database)

> **Uma tabela nova (`DatabaseGrant`) + dois enums novos (`DatabaseRole`, `DatabaseGrantState`).** Nenhuma outra
> entidade é criada. `Database` (3.1), `Membership` e `Organization` recebem apenas **back-relations** (sem coluna
> nova). Twin estrutural de `PipeGrant` (2.2), entidade **distinta** (RN-061).

## Entidade nova — `DatabaseGrant` (org-owned, twin de `PipeGrant`)

| Campo          | Tipo                        | Notas |
|----------------|-----------------------------|-------|
| `id`           | `String @id @db.Uuid`       | Identificador estável da concessão. |
| `orgId`        | `String @db.Uuid`           | FK → `Organization` (`onDelete: Cascade`). Dado org-owned (AD-10). `WITH CHECK` reconfere. |
| `databaseId`   | `String @db.Uuid`           | FK → `Database` (`onDelete: Cascade`). O Database concedido. |
| `membershipId` | `String @db.Uuid`           | FK → `Membership` (`onDelete: Cascade`). **A concessão liga a Membership, não a Account** (AD-7): o papel vive DENTRO da Org. |
| `role`         | `DatabaseRole`              | `ADMIN` \| `MEMBER` \| `VIEWER`. Poder por Database. |
| `state`        | `DatabaseGrantState`        | `ACTIVE` \| `REVOKED`. Revogar é `state`, não DELETE. |
| `createdAt`    | `DateTime @default(now())`  | — |
| `updatedAt`    | `DateTime @updatedAt`       | — |
| `revokedAt`    | `DateTime?`                 | Instante da revogação; `null` quando `ACTIVE`. `TIMESTAMP(3)`, simétrico a `PipeGrant.revokedAt` (twin). |

- **Relações (back-relations, sem coluna nova nas donas):** `Organization.databaseGrants DatabaseGrant[]`,
  `Database.grants DatabaseGrant[]`, `Membership.databaseGrants DatabaseGrant[]`.
- **Índices:** `@@index([orgId, databaseId])` (quem acessa este Database) e `@@index([orgId, membershipId])`
  (quais Databases esta pessoa acessa) — acesso começa por Org. Simétrico a `PipeGrant`.
- **Índice único PARCIAL** `(databaseId, membershipId) WHERE state='ACTIVE'` — **no máximo um papel efetivo por
  (Database, pessoa)** (AC5) sem colidir com uma concessão revogada e re-concedida. Criado por **raw SQL** na
  migration (o Prisma 6.19.3 não expressa índice parcial — é v7.4+). **Não** declarável no schema.
- **`@@map("DatabaseGrant")`.** Sem `reviewPublicSubmissions`/`restritoAoProprio` (capacidades de Pipe — 2.8/2.10;
  não estão na epics de Database; não inventar — Constitution II).

## Enums novos

```
DatabaseRole
  ADMIN    -- Admin do Database: configura/administra estrutura (schema=3.3); concede MEMBER/VIEWER (3.2).
           --   NÃO controla ciclo de vida do Database (Admin da Org) nem Memberships da Org (D3.4 §969).
  MEMBER   -- Membro do Database: cria/edita Registros (poder DIFERENCIAL = contrato futuro 3.4 — role dormente).
  VIEWER   -- Somente leitura: consulta. Único papel possível para um Convidado (GUEST) — teto da Org (AD-9).

DatabaseGrantState
  ACTIVE   -- concessão vigente; concede acesso ao Database.
  REVOKED  -- revogada; NÃO concede acesso (a resolução lê só ACTIVE). Preserva a trilha (soft-delete).
```

## Isolamento (RLS) — replica o padrão de `PipeGrant`/`Membership`

- **`ENABLE` + `FORCE ROW LEVEL SECURITY`** em `DatabaseGrant`.
- **4 policies** (`database_grant_select`/`insert`/`update`/`delete`) por `orgId = current_org_id()`; **`WITH
  CHECK`** no INSERT **e** no UPDATE (barra INSERT com `orgId` alheio e barra **mover a concessão** para outra Org
  no UPDATE).
- **GRANT do runtime (`giraffe_app`):** `SELECT, INSERT, UPDATE` — **sem DELETE**. Revogar é `UPDATE` de `state`.
- **`giraffe_migrator`** é dono do schema (DDL); o runtime nunca tem a credencial do dono.
- **Auditoria:** `DatabaseGrant` entra em `MODELOS_AUDITADOS` — conceder/alterar/revogar na trilha (PRD §1073),
  inclusive tentativa negada; leituras-antes-de-escrever e caminhos idempotentes **não** emitem `updateMany`
  (evitam `count: 0` como falso `denied`, mesma correção de 2.1/2.2).

## Transição de estado

```
        conceder (201)
           │
           ▼
      ┌─────────┐   revogar (200)     ┌──────────┐
      │ ACTIVE  │ ──────────────────▶ │ REVOKED  │   (terminal para aquela linha)
      └─────────┘                     └──────────┘
        │   ▲
 alterar│   │ re-conceder = NOVA linha ACTIVE
 papel  │   │ (a unicidade parcial só vale entre ACTIVE)
 (200)  └───┘
```

- **Sem** transição `REVOKED → ACTIVE` (revogar é definitivo para aquela concessão; re-conceder é ato novo,
  auditável). Alterar papel de uma concessão ACTIVE é `UPDATE` de `role`.
- **Acesso cessa na revogação** por construção: `resolverPoderNoDatabase` só consulta concessões `ACTIVE`.

## Autoridade de concessão (a regra distintiva — resolvida no serviço, não no banco)

| Ator | Conceder/alterar/revogar `ADMIN` do DB | Conceder/alterar/revogar `MEMBER`/`VIEWER` | Ciclo de vida do DB |
|------|:--:|:--:|:--:|
| **Admin da Org** | ✅ | ✅ | ✅ (3.1) |
| **Admin do Database** (grant `ADMIN` ACTIVE) | ❌ **403** (Q1/D3) | ✅ (só alvos `Membership` ATIVOS da Org) | ❌ (Q3/D3.4 §969) |
| **Membro/Somente-leitura do DB** | ❌ | ❌ **403** | ❌ |
| **Sem concessão (não-Admin)** | ❌ **404** | ❌ **404** | ❌ |

- **Teto da Org (AD-9):** alvo `Membership.role = GUEST` → só `VIEWER`; `ADMIN`/`MEMBER` do DB para GUEST → **400**.
- **Admin da Org acessa todos sem grant** (Q4): nenhuma linha de `DatabaseGrant` é criada para o Admin da Org.

## Núcleo de resolução — `database-authz.ts` (twin de `pipe-authz.ts`, sem I/O de negócio)

- `type Poder = 'gerenciar' | 'operar' | 'ler'` (reuso conceitual do `pipe-authz`).
- `resolverPoderNoDatabase(db, principal, databaseId): Poder` — Admin da Org → `gerenciar`; senão `DatabaseGrant`
  ACTIVE + `Membership.state = ACTIVE`: ADMIN → `gerenciar`, MEMBER → `operar`, VIEWER → `ler`; sem acesso → **404
  não-enumerante**.
- `exigirLerDatabase` / `exigirGerenciarDatabase` — gates por poder.
- `exigirConcederPapel(db, principal, databaseId, roleAlvo)` — a autoridade hierárquica (D2/D3): Admin da Org →
  qualquer papel; Admin do Database → só `MEMBER`/`VIEWER` (403 em `ADMIN`); demais → 403; sem acesso → 404.

## O que muda em código já existente

- **`ability.factory.ts`:** `can('ler','Database',{orgId})` sai do ramo `if ADMIN` para **qualquer** Membership
  ativa (grossa, como `ler Pipe`). `administrar Database` **permanece** Admin-only. (D6)
- **`databases.service.ts` (3.1):** `listar`/`obter` passam a resolver acesso fino para **não-Admin** (por
  `DatabaseGrant` ACTIVE; 404 não-enumerante em `obter` sem concessão). **Admin da Org inalterado** (todos).
  `criar`/`renomear`/`arquivar`/`restaurar` **inalterados** (Admin da Org; ciclo de vida 3.1 congelado).
- **`tenant-context.ts`:** `DatabaseGrant` em `MODELOS_AUDITADOS`.

## O que NÃO muda

- `Database` (nenhuma coluna nova; só a back-relation `grants`). `FormContext.DATABASE`/`Form` (owner é 3.3).
- Qualquer entidade de `Pipe`/`Card`/`Phase` (nenhuma relação nova). `authz.guard.ts` (C3 congelado — D6).
- `apps/web` (sem UI nesta Story). O poder diferencial MEMBER vs VIEWER sobre Registros (não existe em 3.2 — D8).
