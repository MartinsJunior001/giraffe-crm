# context7-check — Story 2.1 (ciclo de vida e catálogo de Pipes)

## Superfície de biblioteca/stack tocada
- **Prisma** — novo `enum PipeState` + model `Pipe` no schema; migration versionada hand-written
  (`migrate deploy`); `$executeRaw`/`withTenantContext` para contexto de RLS; raw SQL para policies.
- **CASL** (`@casl/ability`) — novo sujeito `Pipe` no `AppAbility` (mesmo padrão de `Organizacao`).
- **NestJS** — novo módulo/controller/serviço (padrão do `organizations`).
- **Nenhuma dependência nova.** Todas as APIs já em uso no projeto.

## Baseline de versão
`apps/api/package.json` — Prisma, `@casl/ability`, NestJS nas versões fixadas no `pnpm-lock.yaml`. Sem upgrade.

## Consulta (MCP Context7)
- `/prisma/prisma` (High): **confirmado** que `prisma migrate deploy` aplica as migrations pendentes do
  diretório `prisma/migrations` (uma `migration.sql` hand-written é aplicada normalmente); editar o SQL
  da migration à mão é fluxo documentado (`--create-only` + edição manual); definição de `enum` + `model`
  no schema é padrão. RLS/policies não são um recurso do schema Prisma — entram como **raw SQL** na
  migration (como já fazem `init_tenancy_rls`/`auth_e_antiabuso`).
- **CASL:** o padrão de sujeito com forma (`Nome | Forma` no `MongoAbility`) já está validado no projeto
  (workaround de `paths` para os tipos do `@casl/ability` 7 permanece — `apps/api/tsconfig.json`).

## Divergências com o plano
Nenhuma. O padrão de migration hand-written + `migrate deploy` + rollback manual (`db-migrate.mjs`) é o
mesmo já provado por CI nas migrations existentes. Adicionar o sujeito `Pipe` ao CASL espelha
`Organizacao`. Sem API nova.

## Veredito
**APROVADO** — sem dependência nova; migration/`migrate deploy`, enum/model, raw SQL para RLS e sujeito
CASL confirmados e já em uso. Prosseguir.

---

## Revalidação pós-implementação (2026-07-13)

Reconferido contra o código efetivamente escrito, e **mantido APROVADO**:

- **Prisma** — a migration hand-written foi aplicada por `migrate deploy` num banco limpo e descartável,
  junto das duas anteriores, e reaplicada após rollback (SC-206, 13/13 — ver `migration-check.md`). O
  fluxo documentado se confirmou na prática, não só na leitura.
- **Nenhuma dependência nova** foi introduzida: `package.json` e `pnpm-lock.yaml` **não** foram tocados.
- **CASL** — o sujeito `Pipe` seguiu o padrão de `Organizacao` (nome | forma no `MongoAbility`), com o
  `paths` do tsconfig permanecendo necessário. Typecheck limpo.
- **NestJS** — uma correção de API surgiu aqui e vale registrar: `@Post` responde **201 por padrão**, o que
  estava errado para `archive`/`restore` (não criam recurso). Corrigido com `@HttpCode(HttpStatus.OK)`.
  Não é divergência de documentação — é o default do framework fazendo o que documenta.
