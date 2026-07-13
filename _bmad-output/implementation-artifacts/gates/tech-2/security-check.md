# security-check — tech-2 (provisionamento de tenant) — REFORÇADO (risco crítico)

## Superfície
Rotina de ops (`prisma/provision-tenant.mjs`) que cria o 1º tenant: Organization + Account + Membership
ADMIN ACTIVE + AuthCredential. Papel **migrator**. **Sem** superfície HTTP de runtime, **sem** DDL,
**sem** nova migration.

## Verificações

### Sem bypass de RLS (AD-6) — o ponto mais crítico
- `Organization`/`Membership` têm FORCE RLS. A rotina insere **com contexto**
  (`set_config('app.current_org_id', orgId, true)` por transação), exatamente como o `seed.sql`. O
  migrator é **sujeito** à RLS — não a contorna.
- **Provado por teste** (`SC-T202`): sem contexto, o INSERT de Organization é **NEGADO** (`WITH CHECK
  (id = current_org_id())` com `current_org_id()` NULL). Se a rotina dependesse de bypass, este teste
  ficaria verde com o INSERT passando — ele falha, provando que é o **contexto** que habilita.
- **Nenhuma** policy, GRANT, função `SECURITY DEFINER` ou `bypass_rls_policy` é criada. Proibição do
  AD-6 respeitada.

### Papel correto (dois papéis, AD-6)
- Usa `MIGRATION_DATABASE_URL` (migrator). O runtime `giraffe_app` **não** tem `INSERT` em
  `Organization` (GRANT: só SELECT/UPDATE) — a rotina **não** usa o papel de runtime para criar tenant.
- A rotina **não** é alcançável pela superfície HTTP (é `.mjs` de ops, executado deliberadamente).

### Sem segredo vazado
- **Senha/hash/`DATABASE_URL` nunca** aparecem em log/erro. Erros de validação citam só o **comprimento**
  permitido, nunca a senha (provado: a mensagem de senha curta **não contém** a senha).
- **E-mail é PII** → mascarado na saída (`a***@dominio`). Provado em unidade.
- A URL do banco só é referenciada por **nome de variável** em erro (`MIGRATION_DATABASE_URL ausente`).

### Sem senha padrão / previsível
- Nenhum valor default. Senha ausente na CLI → **gerada forte** (`randomBytes(24)`) e impressa **uma
  vez**; nunca persistida em log. Validação exige ≥12 e ≤128 (mais forte que o `minPasswordLength` 8 do
  Better Auth). Filosofia do `00-roles.sql` (credencial ausente falha, não vira valor conhecido).

### Credencial e identidade
- Hash gerado pelo **próprio Better Auth** (`ctx.password.hash`) — sem reimplementar derivação
  (reimplementação divergente autenticaria com segurança menor). Credencial: `providerId: 'credential'`,
  `accountId = userId` (confirmado no Context7).
- **Não sobrescreve** credencial existente (idempotência preserva a senha de um Admin real). Provado
  (`SC-T205`: hash inalterado na 2ª execução).
- Cria Admin **da Organização** (Membership ADMIN), **não** Super Admin da Plataforma (INV-ADMIN-01).

### Fail-closed e idempotência
- Validação **antes de qualquer escrita** (`SC-T204`: senha curta lança e a Org **não** é criada).
- Idempotente por chave natural (org id determinístico por slug, account por e-mail, membership por
  par, credencial por userId) — 2ª execução não duplica (`SC-T203`).

## Premissa do modelo de ameaça (revisão adversarial)
- **Quem executa detém a credencial `migrator`** (poder total no banco) — a rotina não amplia poder de
  quem já a executa. Se o e-mail casar com um Account global preexistente **sem** credencial, a rotina
  cria a credencial e concede ADMIN na nova Org; **não** é escalonamento (o operador já tem poder de
  ops, e o caso é "primeiro tenant" / banco vazio). Registrado como premissa, não como falha.
- **Concorrência:** duas execuções simultâneas do mesmo slug colidem no unique de `Organization` e uma
  falha por rollback (fail-closed, sem escrita parcial). Idempotência é para reexecuções sequenciais.

## Veredito
**APROVADO (reforçado)** — sem bypass de RLS (provado pela negação sem contexto); papel migrator; sem
segredo em log; sem senha padrão; credencial via Better Auth e não sobrescrita; fail-closed e idempotente.
Revisão adversarial independente sem findings CRITICAL/HIGH/MEDIUM.
