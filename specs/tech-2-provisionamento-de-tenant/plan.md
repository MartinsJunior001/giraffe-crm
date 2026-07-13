# Plan — tech-2: Provisionamento seguro do primeiro tenant

> Risco CRÍTICO. Fonte: `spec.md` + Story. Sem nova migration.

## Stack e fronteiras
- **Script de ops em `.mjs`** (como `seed-credentials.mjs`), rodando com `node` direto (sem build),
  usando a `generated/prisma` e `better-auth`. Núcleo puro separado para teste de unidade; núcleo de
  provisionamento com injeção de dependências (`prisma`, `hashSenha`) para teste de integração.
- **Papel `migrator`** (`MIGRATION_DATABASE_URL`) — único que pode inserir `Organization`.

## Decisões técnicas
- **Contexto de RLS por transação:** `prisma.$transaction(tx => { tx.$executeRaw\`SELECT
  set_config('app.current_org_id', ${orgId}, true)\`; …inserts })`. `true` = transação-local (não gruda
  no pool). Fiel ao `seed.sql` e ao `tenant-context.ts`.
- **Idempotência por chave natural:** Organization por `slug`, Account por `email`, Membership por
  `(accountId, orgId)`, AuthCredential por `userId+providerId`. `upsert`/`findFirst`+`create`.
  Credencial existente **não** é sobrescrita (um Admin real pode ter trocado a senha).
- **Hash:** instanciar `betterAuth(...)` (mesma config de modelos do seed) e usar `ctx.password.hash`
  (e `ctx.password.verify` no teste). Sem reimplementar derivação.
- **Guard próprio (não o seed-guard):** entradas obrigatórias presentes = intenção; **nenhuma senha
  padrão**; senha ausente → gerar forte aleatória (crypto) e imprimir uma vez. `MIGRATION_DATABASE_URL`
  obrigatória.
- **Sanitização:** funções de validação lançam `Error` com host/nome de variável, nunca segredo;
  e-mail mascarado em saída (`a***@dominio`).
- **Política de senha:** ≥ 12 (mais forte que o `minPasswordLength: 8` do Better Auth, por ser Admin) e
  ≤ 128 (limite do Better Auth).

## Touch-points (arquivos)
- **Novos:** `apps/api/prisma/provision-tenant.mjs` (núcleo + CLI), `apps/api/test/provision-tenant.test.ts`
  (unidade + integração). Script `db:provision-tenant` em `apps/api/package.json`.
- **Sem** alteração de schema, migration, RLS, auth de runtime.

## Sequência (red-green-refactor)
T2 (núcleo puro + testes de unidade) → T3 (provisionamento + integração) → T4 (CLI/guard) →
T5 (testes de segurança/idempotência/fail-closed) → T6 (gates + revisão reforçada).

## Riscos e mitigações
- **Vazar segredo em log** → sanitização testada; e-mail mascarado; nunca logar senha/DSN.
- **Bypass de RLS acidental** → usar migrator + contexto; teste prova que contexto errado NEGA o INSERT.
- **Sobrescrever credencial de Admin real** → não sobrescrever; só criar se ausente.
- **Tenant duplicado** → idempotência por chave natural.
- **Rodar contra banco errado** → exige `MIGRATION_DATABASE_URL` explícita (credencial de ops); sem
  default de senha.
- **Teste colidir com fixtures paralelas** → Org nova e única por execução (UUID aleatório).

## Constitution / arquitetura
AD-6 (sem bypass de RLS; dois papéis), AD-7 (papel único), AD-10 (Account global), INV-ADMIN-01
(Admin da Org ≠ Super Admin da Plataforma — a rotina cria Admin **da Organização**). Sem antecipar
escopo (sem desprovisionamento automático, sem UI, sem multi-tenant).
