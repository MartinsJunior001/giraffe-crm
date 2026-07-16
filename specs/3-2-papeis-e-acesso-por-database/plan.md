# Implementation Plan: Papéis e acesso por Database (Story 3.2)

**Branch**: `story/3-2-papeis-e-acesso-por-database` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/3-2-papeis-e-acesso-por-database/spec.md`

## Summary

Introduzir a **autorização fina por Database** sobre o substrato da 3.1, via **`DatabaseGrant`** — a concessão
que liga uma `Membership` a um `Database` com um papel (`ADMIN`/`MEMBER`/`VIEWER`). Isolamento pelo **banco**
(RLS + FORCE + `WITH CHECK`), **sem exclusão** (GRANT sem DELETE; revogar = `state`), **no máximo um papel
efetivo** por (Database, pessoa) via índice único parcial. A **autoridade hierárquica de concessão** (Admin da
Org concede qualquer papel; Admin do Database só `MEMBER`/`VIEWER`; só Admin da Org toca `ADMIN` do Database) é
resolvida no **serviço** (`database-authz.ts`, twin de `pipe-authz.ts`), consumindo DBT-AUTHZ-01. O sujeito CASL
`ler Database` é **aberto** de Admin-da-Org-only (3.1) para qualquer Membership ativa (grossa, como `ler Pipe`);
`administrar Database` permanece Admin-only; o guard **não** é tocado. O `DatabasesService` (3.1) é modificado
para **leitura fina** do não-Admin (404 não-enumerante). **Twin estrutural da Story 2.2**, domínio distinto
(RN-061). Poder diferencial MEMBER vs VIEWER sobre Registros/schema = **contrato futuro** (3.3/3.4 — role dormente).

## Technical Context

**Language/Version**: TypeScript estrito (`strict` + `noUncheckedIndexedAccess`, `tsconfig.base.json`); Node 24 (`.nvmrc`)

**Primary Dependencies**: NestJS 11 (API); Prisma 6.19.3 (ORM, client estendido `withTenantContext`); `@casl/ability` 7 (substrato de autorização — **congelado**; abre-se `ler Database` grosseiro na `ability.factory`, sem alterar o contrato/guard)

**Storage**: PostgreSQL 16 (host `127.0.0.1:5434` em dev). RLS + FORCE ROW LEVEL SECURITY como invariante-mãe; dois papéis (`giraffe_app` runtime / `giraffe_migrator` dono do schema). **Nova tabela `DatabaseGrant` + 2 enums + índice único parcial**; migration versionada + rollback.

**Testing**: Vitest 4 (`test/**/*.test.ts`), integração contra PostgreSQL **real**; suíte da API em SÉRIE no CI (`pnpm test:ci` = `vitest run --no-file-parallelism`). Regra de ouro: escrever na **Org C** com contas descartáveis (`randomUUID`).

**Target Platform**: Linux server (containerizado); runtime NestJS atrás de proxy

**Project Type**: Web service (monorepo pnpm workspaces — `apps/api` NestJS + `apps/web` Next.js). Esta Story toca **apenas `apps/api`** (o consumo visual é de telas do E3, fora do escopo).

**Performance Goals**: Sem meta nova de throughput; operações são escritas únicas/consultas simples. Resolução de acesso e listagem por `(orgId, databaseId)`/`(orgId, membershipId)` (índices) — sem N+1.

**Constraints**: Nenhuma rota aceita `orgId` do cliente; toda query por `withTenantContext`; `withTenantContext` **recusa** `$transaction` (3.2 não precisa — sem evento na mesma transação; Histórico do Registro é 3.4); `conceder` **201**, `alterar`/`revogar` **200** (`@HttpCode` no DELETE); unicidade por índice parcial (P2002 → 409); caminho de leitura-antes-de-escrever **não** emite `updateMany`.

**Scale/Scope**: 1 migration (nova tabela + 2 enums + índice parcial + RLS + GRANT), 2 enums + 1 model no schema, 1 helper de resolução (`database-authz.ts`), 1 subdomínio `grants/` (service + controller + DTO + module), 1 modificação em `databases.service.ts` (leitura fina), 1 abertura de ability, 1 linha em `MODELOS_AUDITADOS`, 3 arquivos de teste.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Sequência oficial (Doc Base → BMAD → Spec Kit → Implementação):** ✅ BMAD `create-story` feito (Story md
  `ready-for-dev`, sprint-status atualizado pelo workflow); Spec Kit `specify`+`clarify` concluídos; este `plan`
  prossegue; `checklist`/`tasks`/`analyze` e o gate `pre-implementation-check` **precedem** qualquer código.
- **Sem antecipar escopo / sem abstração especulativa:** ✅ o poder diferencial MEMBER vs VIEWER sobre Registros/
  schema **não** é materializado (AD-11 — Registro/schema não existem em 3.2); `database-authz.ts` nasce com
  **consumidor concreto** (autoridade de concessão + leitura fina do catálogo), não como framework vazio. **Não**
  se cria Registro/`Form.databaseId`/vínculo.
- **Isolamento multi-tenant é do banco:** ✅ `DatabaseGrant` recebe RLS+FORCE, 4 policies por `current_org_id()`
  com `WITH CHECK` no INSERT e UPDATE; toda query por `withTenantContext`; **nenhum `where orgId` manual**.
- **GRANT é fronteira de segurança:** ✅ runtime recebe `SELECT/INSERT/UPDATE`, **sem DELETE**; teste prova a
  **fase vermelha** e que o runtime não apaga concessão (revogar = `state`).
- **Autorização deny-by-default, C3/`ability.ts`/guard congelados:** ✅ abre-se `ler Database` grosseiro (extensão
  prevista, idêntica a `ler Pipe`); **guard não tocado**; a autoridade fina vive no serviço (DBT-AUTHZ-01). Se o
  guard precisar mudar, declarar desvio e escalar.
- **Migrations como etapa controlada:** ✅ migration versionada + rollback; **SC-206** em banco descartável;
  nunca no boot do container; `prisma db push` não substitui migration.
- **Verificação documental (context7-check):** ✅ requerido antes de codificar (Prisma 6.19.3 índice parcial/
  P2002/CRUD; NestJS 11 exceptions/`@HttpCode`) — executado no início da implementação.
- **Artefatos autoritativos não editados pela implementação:** ✅ PRD/UX/Architecture/`epics.md` intactos;
  `sprint-status.yaml` e status da Story só pelo workflow BMAD (`create-story` moveu 3-2 → ready-for-dev sob
  autorização explícita do dono).

**Resultado:** PASS — nenhuma violação; **Complexity Tracking** não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/3-2-papeis-e-acesso-por-database/
├── spec.md              # /speckit-specify (+ Clarifications Q1–Q5 de /speckit-clarify)
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 (decisões D1–D8)
├── data-model.md        # Fase 1 (DatabaseGrant + 2 enums + autoridade + transição)
├── quickstart.md        # Fase 1 (roteiro de validação executável)
├── contracts/
│   └── database-grants.http.md  # Fase 1 (contrato HTTP das 4 rotas + ajuste no catálogo 3.1)
├── checklists/
│   └── requirements.md  # /speckit-specify + revalidado no /speckit-clarify
├── tasks.md             # Fase 2 (/speckit-tasks)
└── analyze.md           # Análise de consistência cruzada pré-implementação
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                             # UPDATE — enums DatabaseRole/DatabaseGrantState; model DatabaseGrant; back-relations em Organization/Database/Membership
│   ├── migrations/
│   │   └── <timestamp>_database_grants/
│   │       └── migration.sql                     # NEW — 2 enums + tabela + índices + FKs + RLS ENABLE/FORCE + 4 policies + índice único parcial (WHERE state='ACTIVE') + GRANT (sem DELETE)
│   └── rollback/
│       └── <timestamp>_database_grants.down.sql  # NEW — rollback simétrico (⚠️ apaga concessões — exige backup em prod)
├── src/
│   ├── databases/
│   │   ├── database-authz.ts                      # NEW — resolução fina (twin de pipe-authz): resolverPoderNoDatabase / exigirLerDatabase / exigirGerenciarDatabase / exigirConcederPapel
│   │   ├── databases.service.ts                   # UPDATE — listar/obter finos p/ não-Admin (por DatabaseGrant); Admin da Org inalterado; ciclo de vida inalterado
│   │   ├── databases.module.ts                    # UPDATE — importa DatabaseGrantsModule (ou registra o subdomínio)
│   │   └── grants/                                # NEW subdomínio (espelha src/pipes/grants/ da 2.2)
│   │       ├── database-grants.module.ts          # NEW
│   │       ├── database-grants.service.ts         # NEW — conceder/listar/alterar/revogar; teto da Org; exigirConcederPapel; P2002→409; soft-revoke sem falso denied
│   │       ├── database-grants.controller.ts      # NEW — 4 rotas, @Requer('ler','Database'), @HttpCode no DELETE; sem exclusão física
│   │       └── dto/database-grants.dto.ts         # NEW — ConcederPapelDto / AlterarPapelDto (sem orgId)
│   ├── kernel/authz/
│   │   └── ability.factory.ts                     # UPDATE — abrir `ler Database` grosseiro (qualquer Membership ativa); manter `administrar Database` Admin-only
│   ├── kernel/db/tenant-context.ts                # UPDATE — DatabaseGrant em MODELOS_AUDITADOS
│   └── app.module.ts                              # UPDATE (se necessário) — subdomínio grants no DatabasesModule
└── test/
    ├── database-grants-rls.test.ts                # NEW — isolamento; WITH CHECK sem RETURNING (createMany); contexto ausente; UPDATE cross-tenant negado; índice único parcial; sem DELETE; fase vermelha
    ├── databases-authz.test.ts                    # UPDATE — `ler Database` grosseiro concede o TIPO a MEMBER/GUEST; negativa fina no serviço; ADMIN administra
    └── database-grants-http.test.ts               # NEW — conceder/listar/alterar/revogar; Admin do Database concede MEMBER/VIEWER; 403 ao conceder ADMIN; GUEST só VIEWER; sem-papel→404; revogar corta acesso; 409 unicidade; cross-tenant→404; 400 sanitizado
```

**Structure Decision**: Web service — a Story vive **inteiramente** em `apps/api`. O subdomínio `src/databases/grants/`
**espelha `src/pipes/grants/`** (2.2) sem reutilizar suas entidades (Pipe ≠ Database). A resolução fina
(`database-authz.ts`) espelha `pipe-authz.ts`. `apps/web` **não** é tocado. `authz.guard.ts` **não** é tocado
(só a `ability.factory` abre `ler Database`). O `databases.service.ts` (3.1) é **modificado** de forma aditiva
(leitura fina do não-Admin), preservando o comportamento do Admin da Org e o ciclo de vida.

## Complexity Tracking

> Não se aplica — Constitution Check = PASS sem violações.
