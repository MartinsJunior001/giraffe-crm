# context7-check — tech-2 (provisionamento de tenant)

## Superfície de biblioteca/stack tocada
- **Better Auth** — geração do hash de senha do Admin (`ctx.password.hash`) e verificação (`verify`).
- **Prisma** — raw query em transação (`set_config` de contexto de RLS) + `create/upsert`.
- **Nenhuma dependência nova.** Ambas já em uso (`seed-credentials.mjs`, `tenant-context.ts`).

## Baseline de versão
`apps/api/package.json` — Better Auth e Prisma nas versões já fixadas no `pnpm-lock.yaml`. Sem upgrade.

## Consulta (MCP Context7)
- Biblioteca: `/better-auth/better-auth` (High, benchmark 88.18).
- **Confirmado:**
  - O hash de senha padrão é interno do Better Auth (scrypt); pode ser customizado por
    `emailAndPassword.password.hash/verify`. **Nossa config não customiza** → usa o padrão, e
    `ctx.password.hash` (via `auth.$context`) produz o hash compatível. `ctx.password.verify({hash,
    password})` valida.
  - A credencial de senha é um registro com **`providerId: "credential"`, `accountId = user.id`,
    `password: hash`** — exatamente o que a rotina cria (e o que o `internalAdapter.linkAccount` do
    Better Auth faz internamente no sign-up).
  - `minPasswordLength` padrão **8**, `maxPasswordLength` **128**. A rotina exige **≥ 12** (mais forte,
    por ser Admin) e **≤ 128** (respeita o limite).
- **Prisma raw + set_config:** o padrão de `set_config('app.current_org_id', …, true)` em transação já é
  o de `tenant-context.ts`/`seed.sql` (transação-local, não gruda no pool). Sem API nova.

## Divergências com o plano
Nenhuma. `ctx.password.hash` é o caminho correto (não reimplementar derivação; `disableSignUp` impede o
`/sign-up`, mas o hashing do contexto continua disponível). A criação direta da credencial espelha o
`linkAccount` interno.

## Veredito
**APROVADO** — API de hashing/credencial do Better Auth confirmada e estável; sem dependência nova;
padrão de contexto do Prisma já validado no projeto.
