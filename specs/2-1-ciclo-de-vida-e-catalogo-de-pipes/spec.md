# Spec — Story 2.1: Ciclo de vida e catálogo de Pipes

> Risco **CRÍTICO** (nova tabela + RLS + migration; invariante-mãe de isolamento). Spec completo.
> Fonte: `_bmad-output/implementation-artifacts/2-1-ciclo-de-vida-e-catalogo-de-pipes.md`.

## Contexto
Primeira entidade de domínio do Épico 2. O Admin da Organização modela seus processos criando **Pipes**
(catálogo). Consome os contratos congelados do L1 (C3 authz, C4 RLS, C6 casca) **sem alterá-los**.

## Modelo de dados
- **`Pipe`**: `id` (uuid, PK), `orgId` (uuid, FK `Organization`, `onDelete: Cascade`), `name` (text),
  `state` (`PipeState` = `ACTIVE`|`ARCHIVED`, default `ACTIVE`), `locked` (bool, default false),
  `starred` (bool, default false), `createdAt`, `updatedAt`, `archivedAt` (nullable).
- **Índice** `(orgId, state)` (todo acesso começa por Org; catálogo por estado). **Sem** unique de nome
  (id é o ref estável — AD-11; evita colisão no restaurar).
- **Enum** `PipeState`.
- `Organization.pipes` (relação inversa).

## Estados e transições
`ACTIVE` ⇄ `ARCHIVED`. `arquivar`: `ACTIVE → ARCHIVED` (`archivedAt = now`). `restaurar`:
`ARCHIVED → ACTIVE` (`archivedAt = null`). **Sem** exclusão definitiva (não há transição para "deletado";
o runtime não tem GRANT DELETE). Arquivar/restaurar **preservam todos os dados** (só muda estado).

## Contrato de API (interna)
- `POST /pipes` — cria (Requer `administrar Pipe`). Body: `{ name }`. → 201 `{ id, name, state, locked,
  starred, createdAt }`.
- `GET /pipes?arquivados=false` — lista o catálogo (Requer `ler Pipe`). Default só `ACTIVE`;
  `arquivados=true` inclui/filtra arquivados. → `Pipe[]` (org-scoped).
- `GET /pipes/:id` — um Pipe (Requer `ler Pipe`). → `Pipe` | 404.
- `PATCH /pipes/:id` — renomeia / define `locked`/`starred` (Requer `administrar Pipe`). Body parcial.
- `POST /pipes/:id/archive` — arquiva (Requer `administrar Pipe`). Idempotente (arquivar arquivado = ok).
- `POST /pipes/:id/restore` — restaura (Requer `administrar Pipe`).
- **Sem** endpoint de exclusão/duplicação/reordenação global.

## Autorização (CASL, C3)
- Novo sujeito `Pipe` (forma `{ orgId }`). **ADMIN** → `ler` e `administrar` Pipe no `orgId` resolvido.
  **MEMBER/GUEST** → nada (deny-by-default; papéis por Pipe = 2.2). O `AuthzGuard` (2º guard global) já
  aplica; cada rota carrega `@Requer`.

## Isolamento / RLS (C4)
- `Pipe` com **ENABLE + FORCE ROW LEVEL SECURITY**; policies `select/insert/update/delete` por
  `orgId = current_org_id()`. Queries por `withTenantContext` (contexto transação-local).
- **GRANT runtime:** `SELECT, INSERT, UPDATE` — **sem DELETE**.

## Migration e rollback
- Migration versionada (`prisma/migrations/<ts>_pipes/migration.sql`): enum + tabela + índices + FK +
  RLS + GRANT. Rollback (`prisma/rollback/<ts>_pipes.down.sql`): DROP policies, DROP table, DROP type.
- `prisma generate` após o schema. Testar `deploy` (banco limpo) e `rollback` (banco descartável).
- AD-17: sem alteração destrutiva de dados existentes (só cria); compatível durante deploy.

## Critérios de sucesso (verificáveis, PostgreSQL real)
- **SC-201** — ADMIN cria/renomeia Pipe; aparece no catálogo da Org; outro tenant **não** o vê. (AC1/AC4)
- **SC-202** — arquivar tira do catálogo ativo preservando dados; restaurar devolve com dados
  preservados. (AC2)
- **SC-203** — MEMBER e GUEST recebem **403** ao criar/arquivar/restaurar Pipe; ADMIN é concedido. (AC3)
- **SC-204** — INSERT/SELECT de Pipe **sem contexto** (ou com contexto de outra Org) é **negado** pelo
  banco (fase vermelha de RLS). (AC4)
- **SC-205** — o runtime (`giraffe_app`) **não** tem DELETE em `Pipe` (GRANT provado). (AC3)
- **SC-206** — migration `deploy` cria a tabela+RLS; `rollback` a remove; banco limpo e atualizado
  passam. (migration-check)

## Não-objetivos
Papéis por Pipe (2.2); Fases (2.3); Formulários (2.4+); Cards (2.7+); exclusão definitiva; duplicação;
reordenação global; semântica de bloqueio de `locked`; trava de arquivamento por Cards ativos (contrato
futuro 2.11 — não materializar tabela de Card).

## Segurança / observabilidade / LGPD
Sem bypass de RLS (AD-6). Nome de Pipe não é PII de pessoa. Logs sanitizados (Org, ator, operação,
recurso, resultado). Nenhum segredo.
