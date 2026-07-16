# Implementation Plan: Ciclo de vida e catálogo de Databases (Story 3.1)

**Branch**: `story/3-1-ciclo-de-vida-e-catalogo-de-databases` | **Date**: 2026-07-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/3-1-ciclo-de-vida-e-catalogo-de-databases/spec.md`

## Summary

Introduzir a **primeira entidade do Épico 3** — `Database` — como dado org-owned com ciclo de vida
**criar / renomear / arquivar / restaurar** e **catálogo real da Org atual** (RN-131), **distinto de Pipe**
(RN-061). Isolamento pelo **banco** (RLS + FORCE + `WITH CHECK`), **sem exclusão definitiva** (GRANT sem DELETE),
novo sujeito CASL `Database` (ADMIN da Org apenas; papéis por Database = 3.2). Arquivar → **somente leitura
integral**: o único write-side de Database em 3.1 (`renomear`) é **bloqueado em `ARCHIVED` (409)**; a trava sobre
Registro/Formulário/Campo/arquivo/vínculo é **contrato futuro** (AD-11 — essas entidades não existem em 3.1).
**Twin estrutural da Story 2.1** — mesma forma de schema/migration/RLS/GRANT/CASL/guard, domínio novo.

## Technical Context

**Language/Version**: TypeScript estrito (`strict` + `noUncheckedIndexedAccess`, `tsconfig.base.json`); Node 24 (`.nvmrc`)

**Primary Dependencies**: NestJS 11 (API); Prisma 6.19.3 (ORM, client estendido `withTenantContext`); `@casl/ability` 7 (substrato de autorização — **congelado**; adiciona-se o subject `Database`, não se altera o contrato/guard)

**Storage**: PostgreSQL 16 (host `127.0.0.1:5434` em dev). RLS + FORCE ROW LEVEL SECURITY como invariante-mãe; dois papéis (`giraffe_app` runtime / `giraffe_migrator` dono do schema). **Nova tabela `Database` + enum `DatabaseState`**; migration versionada + rollback.

**Testing**: Vitest 4 (`test/**/*.test.ts`), integração contra PostgreSQL **real**; suíte da API em SÉRIE no CI (`pnpm test:ci` = `vitest run --no-file-parallelism`). Regra de ouro: escrever na **Org C** com contas descartáveis (`randomUUID`).

**Target Platform**: Linux server (containerizado); runtime NestJS atrás de proxy

**Project Type**: Web service (monorepo pnpm workspaces — `apps/api` NestJS + `apps/web` Next.js). Esta Story toca **apenas `apps/api`** (o consumo visual do catálogo é de telas do E3, fora do escopo).

**Performance Goals**: Sem meta nova de throughput; operações são escritas únicas/consultas simples. Catálogo lista por `(orgId, state)` (índice) — sem N+1.

**Constraints**: Nenhuma rota aceita `orgId` do cliente; toda query por `withTenantContext`; `withTenantContext` **recusa** `$transaction` (3.1 não precisa — escrita única, sem segundo write na mesma transação; Histórico do Registro é 3.4); transições `archive`/`restore` respondem **200** (`@HttpCode`), criar **201**; caminho idempotente **não** emite `updateMany`.

**Scale/Scope**: 1 migration (nova tabela + enum + RLS + GRANT), 1 enum + 1 model no schema, 1 núcleo puro, 1 service + 1 controller + 1 DTO + 1 module, 1 linha em `MODELOS_AUDITADOS`, 1 subject CASL, 3 arquivos de teste.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Sequência oficial (Doc Base → BMAD → Spec Kit → Implementação):** ✅ BMAD `create-story` feito; Spec Kit
  `specify`+`checklist`+`clarify` concluídos; este `plan` prossegue; `tasks`/`analyze` e o gate
  `pre-implementation-check` **precedem** qualquer código.
- **Sem antecipar escopo / sem abstração especulativa:** ✅ nada de Registro/Formulário-owner/Campo/arquivo/
  vínculo materializado (AD-11) — a somente-leitura sobre eles é **contrato** (3.3/3.4/3.7/3.8/3.9); o núcleo puro
  `database-lifecycle.ts` nasce com **consumidor concreto** (`renomear` + transições), não como framework vazio.
  **Não** wire `Form.databaseId` (é 3.3).
- **Isolamento multi-tenant é do banco:** ✅ `Database` recebe RLS+FORCE, 4 policies por `current_org_id()` com
  `WITH CHECK` no INSERT e UPDATE; toda query por `withTenantContext`; **nenhum `where orgId` manual**.
- **GRANT é fronteira de segurança:** ✅ runtime recebe `SELECT/INSERT/UPDATE`, **sem DELETE**; teste prova a
  **fase vermelha** (quebra a policy/GRANT de propósito e confirma vermelho) e que o runtime não apaga Database.
- **Autorização deny-by-default, C3/`ability.ts`/guard congelados:** ✅ adiciona-se o subject `Database`
  (extensão prevista pelo catálogo CASL); **guard não tocado** (herda `{ id, orgId }` da 2.1); MEMBER/GUEST
  negados. Se o guard precisar mudar, declarar desvio e escalar.
- **Migrations como etapa controlada:** ✅ migration versionada + rollback; **SC-206** em banco descartável;
  nunca no boot do container; `prisma db push` não substitui migration.
- **Verificação documental (context7-check):** ✅ requerido antes de codificar (Prisma 6.19.3 DDL/enum/CRUD;
  NestJS 11 DTO/exceptions/`@HttpCode`) — executado no início da implementação.
- **Artefatos autoritativos não editados pela implementação:** ✅ PRD/UX/Architecture/`epics.md` intactos;
  `sprint-status.yaml` e status da Story só pelo workflow BMAD (`create-story` já os moveu: epic-3 → in-progress;
  3-1 → ready-for-dev).

**Resultado:** PASS — nenhuma violação; **Complexity Tracking** não se aplica.

## Project Structure

### Documentation (this feature)

```text
specs/3-1-ciclo-de-vida-e-catalogo-de-databases/
├── spec.md              # /speckit-specify (+ Clarifications de /speckit-clarify)
├── plan.md              # Este arquivo (/speckit-plan)
├── research.md          # Fase 0 (decisões D1–D6)
├── data-model.md        # Fase 1 (entidade Database + enum + transição de estado)
├── quickstart.md        # Fase 1 (roteiro de validação executável)
├── contracts/
│   └── databases.http.md   # Fase 1 (contrato HTTP das 6 rotas)
├── checklists/
│   └── requirements.md  # /speckit-specify + revalidado no /speckit-clarify
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                      # UPDATE — enum DatabaseState; model Database; Organization.databases
│   ├── migrations/
│   │   └── <timestamp>_databases/
│   │       └── migration.sql              # NEW — enum + tabela + índice + FK + RLS ENABLE/FORCE + 4 policies + GRANT (sem DELETE)
│   └── rollback/
│       └── <timestamp>_databases.down.sql # NEW — rollback simétrico (⚠️ apaga Databases — exige backup em prod)
├── src/
│   ├── databases/                         # NEW módulo (espelha src/pipes/ da 2.1)
│   │   ├── databases.module.ts            # NEW
│   │   ├── databases.service.ts           # NEW — CRUD org-scoped por withTenantContext; gate de renomear em ARCHIVED
│   │   ├── databases.controller.ts        # NEW — 6 rotas, @Requer, @HttpCode em archive/restore; sem exclusão
│   │   ├── database-lifecycle.ts          # NEW — núcleo PURO (planejarArquivamento/Restauracao; assertDatabaseEditavel)
│   │   └── dto/databases.dto.ts           # NEW — CriarDatabaseDto / RenomearDatabaseDto (sem orgId)
│   ├── kernel/authz/
│   │   ├── ability.ts                     # UPDATE — novo subject Database ({ id, orgId })
│   │   └── ability.factory.ts             # UPDATE — ADMIN → ler/administrar Database; MEMBER/GUEST nada
│   ├── kernel/db/tenant-context.ts        # UPDATE — Database em MODELOS_AUDITADOS
│   └── app.module.ts                      # UPDATE — importa DatabasesModule
└── test/
    ├── databases-rls.test.ts              # NEW — isolamento; WITH CHECK sem RETURNING (createMany); contexto ausente; cross-tenant UPDATE negado; sem DELETE; fase vermelha
    ├── databases-authz.test.ts            # NEW — negativa MEMBER/GUEST; ADMIN ok
    └── databases-http.test.ts             # NEW — ciclo; catálogo distinto de Pipe; 404 cross-tenant; 400 sanitizado; renomear em arquivado → 409; idempotência
```

**Structure Decision**: Web service — a Story vive **inteiramente** em `apps/api`, no novo módulo `src/databases/`,
**espelhando `src/pipes/`** (2.1) sem reutilizar suas entidades (Pipe ≠ Database). O **núcleo puro**
(`database-lifecycle.ts`) fica separado do serviço, seguindo o padrão `card-lifecycle.transitions.ts` do E2.
`apps/web` **não é tocado**. `authz.guard.ts` **não é tocado** (herda o escopo de sujeito de domínio da 2.1).

## Complexity Tracking

> Não se aplica — Constitution Check = PASS sem violações.
