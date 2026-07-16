# Gate T001 — Pré-código da Story 3.2 (Papéis e acesso por Database)

Data: 2026-07-16 · Branch: `story/3-2-papeis-e-acesso-por-database` (off `origin/main` @ 29cf323; 3.1 `done`)

## context7-check (verificação documental — obrigatória antes de codificar)

Baseline: versões **instaladas** (`package.json`/lockfile): Prisma **6.19.3**, NestJS **11**, `@casl/ability` 7.

### Prisma 6.19.x (Context7 `/prisma/prisma/__branch__6.19.x`)
- **P2002 (unique constraint):** confirmado — `catch (e)` com `e instanceof Prisma.PrismaClientKnownRequestError`
  e `e.code === 'P2002'` (o teste oficial verifica `e.name === 'PrismaClientKnownRequestError'`, `e.code ===
  'P2002'`, `e.meta.modelName`). É **idêntico** ao padrão já em produção em `apps/api/src/pipes/grants/pipe-grants.service.ts:131`.
  → a `conceder` da 3.2 trata a colisão do índice único parcial exatamente assim.
- **Índice único PARCIAL (`WHERE state='ACTIVE'`):** não expressável no schema do Prisma 6.19.3 (é v7.4+); vai por
  **raw SQL** na `migration.sql` (`CREATE UNIQUE INDEX ... WHERE state = 'ACTIVE'`), DDL PostgreSQL padrão — **já
  provado** pela migration de `PipeGrant` (mesma versão instalada). Baseline = o código instalado.
- **CRUD:** `create` (RETURNING sob policy de SELECT), `findUnique`, `updateMany`→`{ count }` — inalterados vs 2.2.

### NestJS 11 (Context7 `/nestjs/nest/v11.1.16`)
- **Exceptions com corpo-objeto:** confirmado — `NotFoundException(objectOrError, ...)`/`ConflictException`/
  `BadRequestException`/`ForbiddenException` aceitam um objeto como primeiro argumento (via `HttpException.createBody`).
  → permite `throw new ConflictException(...)` e o corpo `{ motivo }` do padrão da 3.1.
- **`@Controller`/`@Post`/`@Get`/`@Patch`/`@Delete`/`@Param`/`@Body` + guards:** confirmados (inalterados).
- **`@HttpCode(HttpStatus.OK)`:** estável; **já provado** em `apps/api/src/pipes/grants/pipe-grants.controller.ts:69`
  (DELETE de revogação → 200, não 204). Baseline = o código instalado.

**Divergências com o plano:** nenhuma. As APIs usadas são as mesmas do twin `PipeGrant` (2.2), na mesma versão
instalada. Fonte: MCP Context7 (Prisma 6.19.x, NestJS v11.1.16) + código instalado como baseline autoritativo.

## pre-implementation-check

- **Sequência oficial:** ✅ Doc Base → BMAD (`create-story` done) → Spec Kit (`specify`→`analyze` done, `analyze` =
  APROVADO PARA IMPLEMENTAÇÃO) → **Implementação** (agora) → validações por skills → deploy.
- **Escopo congelado e sem antecipar (Constitution II):** ✅ só papéis/acesso por Database; poder diferencial
  MEMBER vs VIEWER = contrato futuro 3.3/3.4 (role dormente — não materializar Registro/schema).
- **Isolamento é do banco (AD-6):** ✅ `DatabaseGrant` = RLS+FORCE+WITH CHECK; toda query por `withTenantContext`.
- **GRANT é fronteira:** ✅ runtime `SELECT/INSERT/UPDATE`, **sem DELETE**; teste prova a fase vermelha.
- **Autorização deny-by-default; guard/`ability.ts` C3 congelados:** ✅ abre-se `ler Database` grosseiro
  (extensão prevista, idêntica a `ler Pipe`); guarda fina no serviço (DBT-AUTHZ-01); guard não tocado.
- **Migration como etapa controlada:** ✅ versionada + rollback + SC-206 em banco descartável.
- **Artefatos autoritativos:** ✅ PRD/UX/Spine/epics intactos; `sprint-status`/status da Story só pelo workflow
  BMAD (já movidos sob autorização explícita do dono).
- **Gates de verificação a vigiar (do `analyze`):** RV-1 (não-enumeração na leitura fina), RV-2 (authz fina no
  serviço), RV-3 (regressão da 3.1: Admin da Org vê todos + ciclo de vida Admin-only).

## Veredito

**APROVADO** — prosseguir para a implementação (Phase 2: schema + migration + RLS + índice parcial + GRANT +
CASL + `database-authz`), depois Phase 3 (grants + leitura fina) e Phase 4 (testes PostgreSQL real).
