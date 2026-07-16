# Gate T001 — Pré-código da Story 3.3 (Formulário de Database)

Data: 2026-07-16 · Branch: `story/3-3-formulario-de-database-schema-visual-do-registro` (off `origin/main` @ 53ad4b8; 3.2 `done`)

## context7-check (verificação documental — obrigatória antes de codificar)

Baseline: versões **instaladas** (`package.json`/lockfile): Prisma **6.19.3**, NestJS **11**.

### NestJS 11 (Context7 `/nestjs/docs.nestjs.com`)
- **Compartilhar provider entre módulos:** confirmado — o módulo host coloca o provider em `exports`; o módulo
  consumidor o obtém via `imports` e pode injetá-lo em seus **controllers e providers**. Módulos encapsulam por
  padrão; `exports` é a interface pública.
  → `PipesModule` exporta `FormsService`/`FieldsService`/`FormPublicationService`; `DatabasesModule` importa
  `PipesModule` e injeta esses serviços nos controllers novos de `databases/forms/`. Sem ciclo (Databases→Pipes
  unidirecional; `database-authz` é função pura).

### Prisma 6.19.3 (Context7 `/prisma/web`)
- **Índice parcial no SCHEMA (`@@unique(..., where: raw(...))`)** é recurso do **Prisma v7.4+** — **NÃO** disponível
  no 6.19.3. → o índice único parcial `Form_database_uq WHERE context='DATABASE'` vai por **raw SQL na migration**,
  exatamente como os já existentes `Form_pipe_initial_uq`/`Form_phase_uq` (2.4) e o `DatabaseGrant_..._active_key`
  (3.2). Baseline = **código instalado** (padrão já provado no repositório).
- **CHECK constraint:** não expressável no schema Prisma — vai por raw SQL na migration (`ADD/DROP CONSTRAINT`),
  idêntico ao `Form_context_owner_ck` existente. DDL PostgreSQL padrão.
- **Relação opcional + `@@index`:** `Form.databaseId String? @db.Uuid` + FK `Database(id)` Cascade + back-relation
  `Database.forms Form[]` + `@@index([orgId, databaseId])` — sintaxe padrão, pervasiva em `schema.prisma`.

**Divergências com o plano:** nenhuma. A generalização reusa o builder de E2 (mesma versão instalada) e o padrão
de índice parcial/CHECK por raw SQL já vigente. Fonte: MCP Context7 (NestJS docs, Prisma web) + código instalado.

## pre-implementation-check

- **Sequência oficial:** ✅ Doc Base → BMAD (`create-story` done) → Spec Kit (`specify`→`analyze`; analyze =
  APROVADO PARA IMPLEMENTAÇÃO) → **Implementação** (agora) → validações → deploy.
- **Escopo congelado, sem antecipar (Constitution II):** ✅ só o schema (montar/evoluir/publicar o Formulário de
  Database). Registro/`Novo Registro`/submissão = 3.4 (fora). Campo Arquivo gated (AD-28) — montar ok, publicar
  gated. Sem permissões por Campo (fora da Fase 1).
- **Sem segundo builder (INV-FORM-01):** ✅ reutiliza `FormsService`/`FieldsService`/`FormPublicationService`, o
  catálogo canônico dos 12 tipos e a estrutura de `Field`. Contextos isolados por owner.
- **Isolamento é do banco (AD-6):** ✅ RLS ENABLE+FORCE já em Form/Field/FormVersion; toda query por
  `withTenantContext`; `orgId`/`databaseId` do cliente nunca confiados.
- **GRANT é fronteira:** ✅ nenhum GRANT novo — `Form`/`Field` já `SELECT/INSERT/UPDATE` (sem DELETE);
  `FormVersion` só `SELECT/INSERT` (imutável). A coluna `databaseId` é coberta pelo GRANT de tabela.
- **Autorização deny-by-default; guard/`ability.ts` C3 congelados:** ✅ `@Requer('ler','Database')` grosso (aberto
  na 3.2); guarda fina roteada por contexto no serviço (`form-authz.ts`, DBT-AUTHZ-01).
- **Migration como etapa controlada + rollback + SC-206:** ✅ versionada; rollback cirúrgico; drill em banco
  descartável.

**Veredito:** APROVADO. Sem bloqueio; sem divergência documental. Prosseguir para a implementação (T002+).
