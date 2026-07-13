# Pre-Implementation Check Report

## Identificacao da tarefa
tech-2 — Provisionamento seguro do primeiro tenant. Branch `tech/2-provisionamento-de-tenant`.
Baseline `c46c866`. Risco **CRÍTICO**.

## Fase e etapa atual
Fase 1, Épico 1, Lote 1 (tech story). L1: 1.5 (done) → 1.6 (done) → 1.7 (done) → 1.8 (done) → **tech-2**.
Documentação Base ✅ → BMAD ✅ → Spec Kit ✅ → **Implementação (aqui)**. Dependências 1.2/1.4 `done`.

## Objetivo
Rotina de ops versionada que cria o 1º tenant (Organization + Admin: Account + Membership ADMIN ACTIVE +
AuthCredential), idempotente e fail-closed, sem UI de convites (E8=WAVE2) e sem autocadastro.

## Escopo incluido / Fora do escopo
Incluído: script `db:provision-tenant`, núcleo validável, provisionamento com contexto de RLS, hash do
Better Auth, testes de integração reais. **Fora (congelado):** UI de convites; autocadastro; **D-06 e
CR-09/borda (L6)**; verificação de e-mail (1.10); multi-tenant/massa; desprovisionamento automático.

## Story e criterios de aceite
AC1 cria o tenant completo (Admin autentica); AC2 isolamento respeitado (contexto RLS, papel migrator,
sem bypass); AC3 idempotente; AC4 fail-closed e sem segredo vazado. Traduzidos em SC-T201..206.

## Regras de negocio afetadas
Papel único por Membership (AD-7): o Admin recebe `ADMIN/ACTIVE`. Admin **da Organização** ≠ Super Admin
da Plataforma (INV-ADMIN-01) — a rotina cria papel de Organização, não de Plataforma.

## Permissoes afetadas
Cria a primeira Membership ADMIN ACTIVE — a autorização efetiva (1.6) passa a reconhecê-la. A rotina
**não** altera policies nem GRANTs; usa o papel `migrator` (que já pode inserir com contexto).

## Dados e entidades afetados
`Organization`, `Account`, `Membership`, `AuthCredential` — **linhas novas**, **sem DDL**, **sem nova
migration**. `Organization`/`Membership` sob FORCE RLS → inserção com `set_config('app.current_org_id',
…, true)`. `Account`/`AuthCredential` são globais (sem RLS). E-mail é PII (minimizar).

## Arquitetura e modulos afetados
Novo `apps/api/prisma/provision-tenant.mjs` (núcleo + CLI) e `apps/api/test/provision-tenant.test.ts`;
script no `apps/api/package.json`. **Nada** no runtime HTTP, no schema, nas migrations ou na config de
auth. **Gate de Arquitetura:** provisionamento controlado por ops, papel migrator, sem bypass de RLS
(AD-6) — reusa padrão existente do seed; não cria superfície nova.

## Dependencias tecnicas
Reusa `better-auth` (hash — confirmado no Context7) e `generated/prisma`. **Nenhuma dependência nova.**

## Skills obrigatorias para esta tarefa
`context7-check` ✅ (Better Auth `ctx.password.hash`/credencial; Prisma raw + `set_config`).
`migration-check` **N/A** (sem DDL/migration). `backup-check` — reversão do 1º tenant documentada.
`security-check` **reforçado** (segredo, bypass de RLS, credencial, sanitização).
`observability-check` limitado (saída sanitizada; sem log de segredo). `lgpd-check` — e-mail é PII,
minimizado. `performance-check` não bloqueia (operação pontual de ops).

## Riscos identificados
1. **Bypass de RLS acidental** → mitigação: migrator + contexto por transação; teste prova que contexto
   ausente/errado **nega** o INSERT (não é bypass). **Proibido** criar policy/rota de bypass (AD-6).
2. **Vazar segredo** (senha/hash/DSN em log) → mitigação: sanitização testada; e-mail mascarado.
3. **Senha padrão / previsível** → mitigação: **nenhum** default; ausência → gerar forte e imprimir uma
   vez, ou falhar (filosofia do `00-roles.sql`).
4. **Sobrescrever credencial de Admin real** → mitigação: só criar se ausente; nunca sobrescrever.
5. **Tenant duplicado** → mitigação: idempotência por chave natural.
6. **Rodar contra banco errado** → mitigação: exige `MIGRATION_DATABASE_URL` explícita.

## Plano minimo de implementacao
(1) núcleo puro (validação/slug/máscara) + testes de unidade; (2) `provisionarTenant` idempotente com
contexto; (3) CLI/guard; (4) testes de integração (cria+autentica, contexto nega, idempotência, credencial
preservada, sanitização). **Não alterar:** schema, migrations, RLS, auth de runtime, seed de dev.

## Estrategia de testes
Vitest + PostgreSQL real (CLAUDE.md). Org **nova e única** por execução (UUID aleatório) — não colide com
A/B (leitura) nem C (escrita de outros). Provar que o Admin **autentica** (verify), não só que a linha
existe. Fase vermelha de segurança: contexto ausente → INSERT negado; senha curta → lança antes de escrever.

## Estrategia de rollback
Sem DDL → nada a reverter em schema. A rotina só cria; reversão do 1º tenant é operação manual controlada
(apagar Organization cascateia Membership; Account é global) — documentada no `backup-check`. Sem
desprovisionamento automático (fora de escopo).

## Decisoes pendentes
Nenhuma que gere retrabalho estrutural. Política de senha fixada em ≥12/≤128 (Admin).

## Status final
**APROVADO** — reusa padrão de provisionamento existente; sem DDL/migration; sem bypass de RLS; papel
migrator; dependências já presentes; riscos mitigados e testáveis; rollback trivial (sem schema).
Prosseguir para implementação com `security-check`/`backup-check` reforçados e revisão adversarial antes
de concluir.
