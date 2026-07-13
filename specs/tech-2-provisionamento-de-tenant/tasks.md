# Tasks — tech-2: Provisionamento seguro do primeiro tenant

> Fonte: `spec.md` + `plan.md`. Risco CRÍTICO — revisão reforçada.

## Phase 1: Núcleo puro (unidade, sem I/O)

- [ ] **T001** `provision-tenant.mjs`: `validarEntradaProvisionamento({orgNome, orgSlug, adminEmail,
  adminNome, adminSenha})` — obrigatórios; senha ≥12 e ≤128; e-mail válido; slug kebab; erros
  sanitizados. [FR-T206/FR-T208]
- [ ] **T002** `derivarSlug(nome)` (kebab-case) e `mascararEmail(email)`. [FR-T206/FR-T208]
- [ ] **T003** Testes de unidade: obrigatórios ausentes lançam; senha curta/longa lança; e-mail/slug
  inválidos lançam; slug derivado correto; e-mail mascarado; erro não contém senha. [SC-T204/SC-T206]

## Phase 2: Provisionamento (integração, PostgreSQL real)

- [ ] **T004** `provisionarTenant({prisma, hashSenha, entrada, gerarId})`: transação com
  `set_config('app.current_org_id', orgId, true)`; upsert Organization(slug)/Membership(accountId+orgId,
  ADMIN/ACTIVE); Account(email) global; AuthCredential(userId) criada se ausente (não sobrescreve).
  [FR-T201..205]
- [ ] **T005** Integração numa Org nova e única: cria as 4 entidades; Admin autentica (`verify`).
  [SC-T201]
- [ ] **T006** Integração: contexto errado/ausente NEGA o INSERT de Organization/Membership (prova de
  que não é bypass). [SC-T202]
- [ ] **T007** Integração: 2ª execução não duplica e não sobrescreve a credencial. [SC-T203/SC-T205]

## Phase 3: CLI de ops e guard

- [ ] **T008** CLI (quando executado direto): lê `PROVISION_*` do env/vault; senha ausente → gera forte
  e imprime uma vez; `MIGRATION_DATABASE_URL` obrigatória; resumo sanitizado. Script
  `db:provision-tenant` no package.json. [FR-T207/FR-T208/FR-T209]

## Phase 4: Gates

- [ ] **T009** `security-check` (sem segredo em log; sem bypass de RLS; papel migrator; credencial não
  sobrescrita), `backup-check` (reversão do 1º tenant documentada), reexecução de qualidade,
  `commit-check`, **revisão adversarial reforçada** (risco crítico).
