# context7-check — Story 2.2 (papéis e acesso por Pipe)

## Superfície de biblioteca/stack tocada
- **Prisma** — novos `enum PipeRole`/`PipeGrantState` + model `PipeGrant`; migration versionada
  hand-written; **índice único parcial** `(pipeId, membershipId) WHERE state='ACTIVE'`; RLS/policies em raw
  SQL; `withTenantContext` para o contexto.
- **CASL** (`@casl/ability`) — autorização **por recurso**: `subject('Pipe', pipeComPapelEfetivo)` avaliado
  no serviço, com o recurso carregado (não como condition do guard).
- **NestJS** — novo controller/serviço de concessão no domínio `pipes/` (padrão da 2.1).
- **Nenhuma dependência nova.**

## Baseline de versão (do `apps/api/package.json`)
- `prisma` / `@prisma/client` **6.19.3**
- `@casl/ability` **^7.0.1**
- NestJS 11. Sem upgrade.

## Consulta (MCP Context7)

### Prisma — índice único parcial
- Consultado `/prisma/web`: **o índice único parcial no schema** (`@@unique([...], where: raw("..."))` ou
  objeto) é recurso do **Prisma v7.4+**. **O projeto está no 6.19.3** → esse açúcar **não está disponível**.
- **Conclusão para o plano:** o índice único parcial vai como **raw SQL na migration hand-written**
  (`CREATE UNIQUE INDEX ... ON "PipeGrant" ("pipeId","membershipId") WHERE state = 'ACTIVE'`) — que é
  PostgreSQL puro e **o mesmo padrão** já usado para RLS/policies nas migrations `_init_tenancy_rls`,
  `_auth_e_antiabuso` e `_pipes`. Sem risco de recurso indisponível. O schema Prisma declara o model e os
  índices comuns; o índice **parcial** e as policies entram no SQL da migration.
- `prisma migrate deploy` aplica a migration hand-written normalmente (confirmado na 2.1, SC-206).

### CASL — autorização por recurso
- O padrão `subject(nome, instância)` com `conditions` avaliadas contra os campos da instância já está em
  uso e validado no projeto (o `AuthzGuard` usa `subject(...)`; o `@casl/ability` 7 avalia só as chaves da
  condition). A novidade da 2.2 é **carregar o recurso** (Pipe + concessão) e avaliar no **serviço** — o
  débito **DBT-AUTHZ-01** já registra que essa checagem fina **não** pertence ao guard. Sem API nova de
  CASL; é composição sobre o que já existe. O workaround de `paths` no `apps/api/tsconfig.json` permanece.

## Divergências com o plano
**Uma, já reconciliada:** o índice único parcial **não** pode ser declarado no schema Prisma 6.19.3 — vai
para o SQL da migration. O `plan.md` e o `tasks.md` (T002) **já** preveem isso. Nenhuma outra divergência.

## Veredito
**APROVADO** — sem dependência nova; índice parcial via raw SQL na migration (padrão do projeto);
autorização por recurso é composição sobre o CASL já validado; `migrate deploy` de migration hand-written
comprovado na 2.1. Prosseguir para `pre-implementation-check`.
