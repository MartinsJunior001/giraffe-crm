---
story_key: tech-2-provisionamento-de-tenant
epic: 1
status: review
release: CORE (Lote 1 — tech story)
risco: CRÍTICO
baseline_commit: c46c86609ce38da781add5adb0005e325e741f4d
gate_arquitetura: Provisionamento do 1º tenant (Org + Admin) por rotina de ops controlada, papel migrator, com contexto de RLS. Toca autenticação (credencial) e o invariante-mãe (isolamento). SEM nova tabela, SEM nova migration. Reusa o padrão do seed (contexto por transação) e o hash do Better Auth. Escopo congelado: **somente provisionamento seguro do primeiro tenant** — D-06 e endurecimento de borda são do L6.
---

# tech-2 — Provisionamento seguro do primeiro tenant

**As a** operador da plataforma,
**I want** um caminho controlado e versionado para criar a primeira Organização e seu primeiro Admin,
**So that** um cliente possa começar a operar sem depender da UI de convites (Épico 8 = WAVE 2) e sem
abrir autocadastro.

**Status: ready-for-dev.** Classificada **CORE (Lote 1 — tech story)**, risco **CRÍTICO** — cria
identidade (Account + credencial), a raiz do tenant (Organization) e o vínculo administrativo
(Membership ADMIN ACTIVE). Toca autenticação e o **invariante-mãe** (isolamento por Organização). Não
há autocadastro (`disableSignUp: true`) e o painel de convites é WAVE 2 (Épico 8); logo, o 1º Org+Admin
precisa de um **caminho controlado de provisionamento** (rotina de ops versionada, papel `migrator`),
não da UI.

> **Escopo congelado (decisão 2026-07-13):** **somente provisionamento seguro do primeiro tenant.**
> D-06 (rate limiter transacional sob rajada) e endurecimento de borda (CR-09) são do **L6**, não desta
> tech story. Não ampliar.

---

## Escopo

Rotina de ops (script versionado, executada deliberadamente como `db:*`) que cria, de forma
**idempotente** e **fail-closed**:
- **Organization** (raiz do tenant) — com contexto de RLS setado (o `migrator` é sujeito a
  `FORCE ROW LEVEL SECURITY`; sem `set_config('app.current_org_id', …, true)` o INSERT é negado);
- **Account** (identidade global; sem RLS) do primeiro Admin;
- **Membership** ADMIN ACTIVE vinculando a Account à Organization (com contexto de RLS);
- **AuthCredential** (`providerId: 'credential'`) com o hash de senha gerado pelo **próprio Better Auth**
  (`ctx.password.hash`) — nunca reimplementar a derivação.

**Rastreabilidade:** triagem de release (`mvp-core-triage.md` — tech-2, P0, risco C); AD-6 (dois papéis,
sem bypass de RLS), AD-7 (papel único por Membership), AD-10 (identidade global), INV-ADMIN-01
(Super Admin ≠ Admin da Org), NFR-3 (isolamento).

**Fora do escopo (congelado):**
- UI de convites / aceite (Épico 8, WAVE 2).
- Autocadastro (permanece `disableSignUp: true`).
- D-06 / rate limiting de borda / CR-09 (L6).
- Provisionamento em massa ou multi-tenant (só o **primeiro** tenant; a rotina é reutilizável, mas o
  caso é 1 Org + 1 Admin).
- Verificação de e-mail (Story 1.10).

**Demonstração vertical:** com o banco migrado, a rotina cria Org + Admin; o Admin **loga** e resolve a
própria Organização (reusa 1.4/1.3/1.6) — jornada operacional destravada sem convites.

---

## Acceptance Criteria

1. **AC1 — cria o tenant completo.** *Given* um banco migrado e as entradas do tenant (nome/slug da Org,
   nome/e-mail/senha do Admin) *When* a rotina roda *Then* existem: a **Organization**, a **Account**, a
   **Membership ADMIN ACTIVE** ligando as duas, e a **AuthCredential** do Admin — e o Admin **autentica**
   com a senha fornecida (hash compatível com o Better Auth).
2. **AC2 — isolamento respeitado (RLS).** *Given* que `Organization`/`Membership` têm FORCE RLS *When* a
   rotina insere *Then* o faz com o **contexto** correto (`app.current_org_id`), pelo papel **migrator**;
   **nunca** cria caminho de bypass de RLS nem usa o papel de runtime para criar Organization.
3. **AC3 — idempotente.** *Given* que a rotina já rodou *When* roda de novo com as mesmas entradas
   *Then* **não duplica** Org/Account/Membership/credencial e termina com sucesso (sem erro).
4. **AC4 — fail-closed e sem segredo vazado.** *Given* entradas inválidas (senha ausente/curta, e-mail
   inválido, slug inválido) *When* a rotina roda *Then* **falha honestamente** antes de qualquer escrita;
   **nenhuma** senha padrão é usada; **nenhum** log/erro contém a senha ou a `DATABASE_URL`
   (só nomes/host, nunca segredo).

---

## Tasks / Subtasks

- [x] **T1 — Gates pré-código.** `pre-implementation-check` **APROVADO**; `context7-check` **APROVADO**
  (Better Auth `ctx.password.hash`/credencial confirmados; Prisma raw + `set_config`); `migration-check`
  **N/A** (sem DDL); `backup-check` **APROVADO** (reversão do 1º tenant documentada).
- [x] **T2 — Núcleo puro e testável (`prisma/provision-tenant.mjs`).** Validação fail-closed (senha
  ≥12/≤128, e-mail, slug), `derivarSlug`, `mascararEmail`, `uuidV5`; mensagens sanitizadas (nunca a
  senha). Testável em unidade. (AC4) ✅
- [x] **T3 — Provisionamento idempotente.** `provisionarTenant`: transação com
  `set_config('app.current_org_id', orgId, true)`; Organization por `orgId` determinístico (UUIDv5 do
  slug), Membership por `accountId+orgId` (ADMIN ACTIVE), Account (global) por e-mail, AuthCredential por
  `userId` (cria se ausente; **não** sobrescreve). Papel **migrator**. (AC1, AC2, AC3) ✅
- [x] **T4 — CLI de ops (guard própria).** `PROVISION_*` do env; senha ausente → forte gerada e impressa
  UMA vez; `MIGRATION_DATABASE_URL` obrigatória; resumo sanitizado; guard `import.meta.url` (não roda ao
  ser importada). Script `db:provision-tenant`. (AC4) ✅
- [x] **T5 — Testes.** 11 casos (`test/provision-tenant.test.ts`): unidade + integração real (cria+**Admin
  autentica** via verify; **contexto ausente NEGA o INSERT** — prova de não-bypass; **idempotência**;
  **credencial preservada**; **fail-closed**). (todos) ✅
- [x] **T6 — Gates de conclusão.** `security-check` **APROVADO (reforçado)**, `backup-check` **APROVADO**,
  `observability-check` **N/A/APROVADO**; qualidade verde (typecheck/lint/format/**API 230/230**);
  revisão adversarial **reforçada** (agente independente) + `code-review`; `commit-check` na sequência.

---

## Dev Notes

### Padrão de provisionamento (reuso, não reinvenção)
- **Contexto de RLS:** `Organization.org_insert` = `WITH CHECK ("id" = current_org_id())`;
  `Membership.membership_insert` = `WITH CHECK ("orgId" = current_org_id())`;
  `current_org_id()` = `NULLIF(current_setting('app.current_org_id', true), '')::uuid`. O `seed.sql`
  já faz `set_config('app.current_org_id', <orgId>, true)` antes de inserir — a rotina segue o mesmo.
  [Source: migrations/…_init_tenancy_rls/migration.sql:120-174]
- **Papel:** `giraffe_app` (runtime) **não** tem `INSERT` em `Organization` (só `SELECT, UPDATE` —
  migration:206) — criar Organization exige o **migrator**. A rotina usa `MIGRATION_DATABASE_URL`.
  Isso **não** é bypass de RLS: o migrator é sujeito a FORCE RLS e insere com o contexto correto.
- **Hash de senha:** `ctx.password.hash` do Better Auth (scrypt padrão; `disableSignUp` impede o
  `/sign-up`). Credencial: `providerId: 'credential'`, `accountId = userId`, `password = hash`.
  [Source: seed-credentials.mjs; Context7 /better-auth/better-auth]

### Guard da rotina (inverso do seed-guard)
O `seed-guard.mjs` **proíbe** produção (grava senha pública). Esta rotina é o oposto: é **legítima em
produção** (é o seu propósito), mas (a) **nunca** usa senha padrão — ausência de senha → gerar forte e
imprimir uma vez, ou falhar; (b) exige entradas obrigatórias presentes (intenção explícita); (c) usa
`MIGRATION_DATABASE_URL` (credencial de ops). Não reaproveitar `verificarDestinoSeed` (semântica oposta).

### Segurança
- **Nunca** logar senha, hash ou `DATABASE_URL`. Erros citam só nome de variável/host (padrão do projeto).
- **E-mail é PII** — minimizar em log (mascarar).
- **Idempotência** evita segundo tenant acidental e permite replay seguro.
- **Não** sobrescrever credencial existente (um Admin real pode já ter trocado a senha).

### Testes
- Integração contra PostgreSQL real (CLAUDE.md): escrever numa Org **nova e única** por execução (UUID
  aleatório) — as fixtures A/B são leitura e a Org C é a área de escrita de outros arquivos paralelos.
- Provar que o Admin autentica (`ctx.password.verify`), não só que a linha existe.
- Provar a fase vermelha: senha curta/ausente reprova antes de qualquer escrita.

### References
- [Source: mvp-core-triage.md] — tech-2 (P0, risco C, L1).
- [Source: prisma/seed.sql; seed-credentials.mjs; seed-guard.mjs] — padrão de contexto e hash.
- [Source: migrations/…_init_tenancy_rls/migration.sql] — policies e GRANTs.
- [Source: kernel/auth/auth.factory.ts] — `disableSignUp`, config de senha.

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code)

### Debug Log References

- **Idempotência sob RLS:** o `migrator`, sujeito a `org_select USING (id = current_org_id())`, não
  enxerga Organization sem contexto — logo não conseguiria detectar uma Org existente por slug. Resolvido
  com **`orgId` determinístico (UUIDv5 do slug)**: o contexto é setado com esse id e o `findUnique` por id
  passa pela policy. Idempotente e RLS-compatível.
- **Verificação de existência em teste:** um `SELECT EXISTS(... FROM (SELECT set_config(...)) , Organization)`
  não garante o contexto na avaliação da RLS (o `set_config` no `FROM` é por-linha, ordem indefinida).
  Trocado por `$transaction` com `set_config` + `findUnique` (contexto transação-local confiável).
- **Import `.mjs` no typecheck:** `@ts-expect-error` só cobre a linha seguinte; num `import { … } from`
  multilinha o erro TS7016 ancora no especificador. Resolvido com `import * as provision` (linha única)
  + destructuring `as any` — mesmo padrão do `seed-guard.test.ts`.

### Completion Notes List

- `prisma/provision-tenant.mjs`: núcleo puro (validação fail-closed, `derivarSlug`, `mascararEmail`,
  `uuidV5`/`idOrganizacaoParaSlug`, `gerarSenhaForte`) + `provisionarTenant({prisma, hashSenha, entrada})`
  idempotente em transação com contexto de RLS + CLI de ops com guard (`import.meta.url`).
- Papel **migrator** (único com INSERT em Organization); hash via `ctx.password.hash` do Better Auth;
  credencial **não** sobrescrita; senha nunca padrão (gera forte e imprime uma vez se ausente);
  saída/erros sanitizados (sem senha/hash/DSN; e-mail mascarado).
- Testes (`test/provision-tenant.test.ts`): 11 casos — unidade (validação/slug/máscara/uuid) + integração
  real (cria+autentica; contexto ausente NEGA o INSERT; idempotência; credencial preservada; fail-closed).
- Gates **APROVADOS**: pre-implementation, context7, migration-check (N/A), security-check (reforçado),
  backup-check, observability-check. Qualidade verde: typecheck, lint, format, **API 230/230**.
- Script `db:provision-tenant` adicionado ao `apps/api/package.json`.

### File List

**API — novos:** `prisma/provision-tenant.mjs`, `test/provision-tenant.test.ts`.
**API — modificados:** `package.json` (script `db:provision-tenant`).
**Processo:** `specs/tech-2-.../{spec,plan,tasks}.md`; `gates/tech-2/*`; `sprint-status.yaml`.

---

## Change Log

| Data | Mudança |
|---|---|
| 2026-07-13 | Story criada (tech story) a partir da triagem de release (`mvp-core-triage.md` — tech-2, P0, risco C) e da pesquisa do padrão de provisionamento (seed/RLS/Better Auth). Escopo **congelado**: somente provisionamento seguro do 1º tenant (D-06/CR-09 são do L6). Risco **CRÍTICO**. Dependências 1.2/1.4 `done`. Status → ready-for-dev. |
| 2026-07-13 | Implementação (T1–T6): `prisma/provision-tenant.mjs` (núcleo + `provisionarTenant` idempotente com contexto de RLS + CLI) e `test/provision-tenant.test.ts` (11 casos, PostgreSQL real). Gates **APROVADOS** (pre-implementation, context7, migration-check N/A, security-check reforçado, backup-check, observability-check). Qualidade verde: typecheck/lint/format/**API 230/230**. **Revisão adversarial reforçada** (agente independente): nenhum CRITICAL/HIGH/MEDIUM; notas LOW/INFO (corrida concorrente → docstring esclarecido; reuso de Account → premissa de modelo de ameaça registrada). Status → review. |
