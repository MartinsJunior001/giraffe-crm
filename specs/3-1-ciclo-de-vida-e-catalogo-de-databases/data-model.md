# Data Model — Story 3.1 (Ciclo de vida e catálogo de Databases)

> **Uma tabela nova (`Database`) + um enum novo (`DatabaseState`).** Nenhuma outra entidade é criada ou tocada
> estruturalmente. O contexto `FormContext.DATABASE` **já existe** como contrato sem owner e **não é wire** aqui
> (owner é a 3.3). Registro/Campo/arquivo/vínculo **não existem** em 3.1 (contrato futuro — AD-11).

## Entidade nova — `Database` (org-owned, twin de `Pipe`)

| Campo        | Tipo                    | Notas |
|--------------|-------------------------|-------|
| `id`         | `String @id @db.Uuid`   | Identificador **estável** (AD-11). Ref por `id`, nunca por nome. |
| `orgId`      | `String @db.Uuid`       | FK → `Organization` (`onDelete: Cascade`). Dado org-owned (AD-10). |
| `name`       | `String`                | Rótulo da base. **Não é PII.** **Sem unicidade** (colidiria no restaurar). |
| `state`      | `DatabaseState`         | `ACTIVE` \| `ARCHIVED`. Fonte de verdade única do eixo somente-leitura. |
| `archivedAt` | `DateTime?`             | Instante do arquivamento; `null` quando `ACTIVE`. Restaurar zera. **`TIMESTAMP(3)`, não `Timestamptz`** — simétrico a `Pipe.archivedAt`/`Phase`/`Field` (D3, twin). O `Timestamptz` do schema é reservado a instantes que são carga funcional (`CardPhaseEntry.enteredAt`, base dos marcos — DIV-1; `MovementEvent.occurredAt`, ordenação de evento); `archivedAt` é carimbo de auditoria, e divergir do twin aqui seria inconsistência sem consumidor. |
| `createdAt`  | `DateTime @default(now())`  | — |
| `updatedAt`  | `DateTime @updatedAt`       | — |

- **Relação:** `Organization.databases Database[]` (nova). Nenhuma relação com `Pipe`/`Card`/`Registro`.
- **Índice:** `@@index([orgId, state])` — lista o catálogo por Org filtrando ativos/arquivados (simétrico a `Pipe`).
- **`@@map("Database")`.** Sem `locked`/`starred` (não na epics da 3.1 — ver research D4).

## Enum novo — `DatabaseState`

```
ACTIVE     -- no catálogo ativo; escrita permitida (renomear/arquivar)
ARCHIVED   -- somente leitura integral; só `restaurar` escreve
```

## Isolamento (RLS) — replica o padrão de `Pipe`/`Membership`

- **`ENABLE` + `FORCE ROW LEVEL SECURITY`** em `Database`.
- **4 policies** (`database_select`/`insert`/`update`/`delete`) por `orgId = current_org_id()`; **`WITH CHECK`**
  no INSERT **e** no UPDATE (barra INSERT com `orgId` alheio e barra **mover a linha** para outra Org no UPDATE).
- **GRANT do runtime (`giraffe_app`):** `SELECT, INSERT, UPDATE` — **sem DELETE**. "Sem exclusão definitiva" é
  fronteira de **banco**, não ausência de rota.
- **`giraffe_migrator`** é dono do schema (DDL); o runtime nunca tem a credencial do dono.
- **Auditoria:** `Database` entra em `MODELOS_AUDITADOS` (`tenant-context.ts`) — mutação org-scoped na trilha,
  inclusive tentativa negada; caminhos idempotentes **não** emitem `updateMany` (evitam `count: 0` falso-positivo).

## Transição de estado (o eixo desta Story)

```
        criar
          │
          ▼
      ┌─────────┐   arquivar (200)    ┌──────────┐
      │ ACTIVE  │ ──────────────────▶ │ ARCHIVED │
      │         │ ◀────────────────── │          │
      └─────────┘   restaurar (200)   └──────────┘
        │   ▲                            │
 renomear   │ renomear BLOQUEADO (409)   │  (escrita de dados dependentes:
 (200)      └────────────────────────────┘   contrato futuro 3.3/3.4/3.7/3.8/3.9)
```

- **Idempotência:** arquivar já-`ARCHIVED` → **200 no-op**; restaurar já-`ACTIVE` → **200 no-op**. Sem `updateMany`
  no caminho idempotente.
- **Somente-leitura integral:** em `ARCHIVED`, `renomear` → **409** (único write-side de Database em 3.1). As
  demais escritas (schema, Registro, Campo, arquivo, vínculo) **não existem** em 3.1 e serão negadas pelos owners
  futuros checando `state === ACTIVE`.
- **Invariante:** restaurar **preserva** `id` e `name` (e, no futuro, todas as referências); **não** cria nova
  identidade.

## Núcleo puro — `database-lifecycle.ts` (sem I/O)

- `planejarArquivamento(state) → { aplicar: bool, novoState, archivedAt }` — idempotente.
- `planejarRestauracao(state) → { aplicar: bool, novoState, archivedAt: null }` — idempotente.
- `assertDatabaseEditavel(state)` (ou `podeEditarDatabase(state): boolean`) — gate de `renomear`; **ponto de
  extensão** reusado por 3.4+ para o gate de somente-leitura. Espelha `card-lifecycle.transitions.ts` (E2).

## Autorização (CASL) — sujeito novo

- Sujeito `Database` na forma `{ id, orgId }` (como `Pipe`). **ADMIN da Org** → `ler`/`administrar` Database da
  própria Org; **MEMBER/GUEST → nada** (deny-by-default; papéis por Database = 3.2). Guard **não** tocado (D6).

## O que NÃO muda

- `FormContext.DATABASE` e `Form` (owner do Formulário de Database é 3.3 — **não** wire `Form.databaseId` aqui).
- Qualquer entidade de `Pipe`/`Card`/`Phase`/`Form` (não há relação nova com elas).
- Guard / `ability.factory` além da adição do subject `Database`.
- `apps/web` (sem UI nesta Story).
