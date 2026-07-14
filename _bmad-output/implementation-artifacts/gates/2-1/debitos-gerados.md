# Débitos gerados pela Story 2.1 (rastreamento)

> A Story 2.1 gerou débitos que **não a bloqueiam** (o merge está autorizado), mas precisam de dono e de
> registro no lugar autoritativo correto. Este arquivo é o rastro da implementação; a inscrição nos
> artefatos autoritativos (`mvp-core-triage.md`, `l1-contratos-congelados.md`) deve ser feita pelo
> **workflow de governança apropriado**, não por edição da implementação (CLAUDE.md — artefatos
> autoritativos não mudam pela implementação).

Data: 2026-07-13 · Origem: Story 2.1 (`c91e321`, PR #17)

---

## DBT-ROLLBACK-CI — automatizar a regressão de rollback das migrations no CI

- **Severidade:** LOW / processual.
- **Origem:** risco residual **R-3** (`specs/2-1-.../analyze.md`, `gates/2-1/migration-check.md`).
- **Lote alvo:** **L6 — Recuperação e Observabilidade** (cross-cutting P0), junto de CR-09, D-01, D-02,
  D-05, D-06.
- **Responsável:** dono do L6 (Trilha A/Backend — mesmo dono do D-06).
- **Não bloqueia a Story 2.1:** o **SC-206** comprovou deploy + rollback + reaplicação em banco
  descartável (13/13, `gates/2-1/migration-check.md`). O que falta é **automatizar** essa prova, não
  produzi-la.

**Problema.** O CI (`.github/workflows/ci.yml`, job `testes`) exercita o `migrate deploy` em banco vazio,
mas **não** o rollback. Uma migration futura cujo `.down.sql` esteja quebrado só seria descoberta quando
alguém precisasse do rollback — durante um incidente.

**Critérios de aceite (futuros):**
1. Job de CI sobe um PostgreSQL descartável e provisiona os papéis pelo `00-roles.sql` (a mesma
   definição do Compose — uma verdade só).
2. `migrate deploy` completo (todas as migrations).
3. Executa os `.down.sql` da migration mais recente (via `db-migrate.mjs rollback`, que também remove a
   linha de `_prisma_migrations`).
4. Verifica **remoção cirúrgica**: os objetos da migration revertida somem; os objetos das migrations
   anteriores **permanecem** (as tabelas do L1 e seus dados).
5. Reaplica a migration (`migrate deploy`) e confirma o schema de volta.
6. O job **falha** se o rollback ou a reaplicação quebrarem.

**Relação com outros gates:** operacionaliza no CI o que o `migration-check` faz manualmente por Story; é
pré-requisito natural do `backup-check` (restauração confiável depende de rollback confiável).

---

## DBT-AUTHZ-01 — escopo do `AuthzGuard` é organizacional, nunca por recurso

- **Severidade:** LOW / de desenho (fail-closed).
- **Origem:** decisão de Arquitetura sobre D-1 (`gates/2-1/aceites-independentes.md` §3).
- **Lote/Story alvo:** **Story 2.2** (papéis e acesso **por Pipe**) — é ela quem introduz granularidade
  fina por recurso.
- **Responsável:** implementador da Story 2.2.

**Fato.** Enquanto o guard injetar o `orgId` do contexto também como `id`, uma regra futura cuja condition
use `id` no sentido de *id do recurso* **nunca casará no guard** — nega (falha **fechada**, comprovado pelo
Arquiteto). O guard é a guarda **grossa** ("papel pode a ação sobre o TIPO, nesta Org"); a granularidade
fina de *qual* recurso é da RLS/serviço.

**Consequência para a 2.2 (não exigida agora):** a checagem de papel **por Pipe** deve ser feita no
serviço, com o recurso carregado do banco (`ability.can('administrar', subject('Pipe', pipeCarregado))`),
**não** como condition avaliada pelo guard. Sugestão: acrescentar a `authz.test.ts` uma asserção que prove
o fail-closed (uma regra `can(acao, Sujeito, { id: <id de recurso> })` **não** é satisfeita pelo escopo do
guard), fixando a fronteira por teste e não por comentário.

---

## GOV-C3-NOTA — nota de esclarecimento no contrato congelado C3

- **Severidade:** processual (governança).
- **Origem:** decisão de Arquitetura sobre D-1.
- **Responsável:** dono do workflow de governança de contratos (não a implementação).

O Arquiteto aprovou registrar em `l1-contratos-congelados.md` §C3 uma **nota de esclarecimento** — **não**
uma mudança de contrato:

> C3 (esclarecimento, 2026-07-13): o `AuthzGuard` aplica a guarda **grossa** — "papel pode a ação sobre o
> TIPO, na Org do contexto". O sujeito é montado com o `orgId` resolvido no servidor sob as duas formas
> usadas pelas conditions (`{ id, orgId }`). Adicionar sujeitos de domínio é extensão prevista (AD-9), não
> alteração do mecanismo.

Fica **pendente** de inscrição pelo workflow apropriado. Não foi aplicada por esta implementação de
propósito — a implementação não edita artefato autoritativo.

---

## Não resolvido por esta Story (registro explícito)

Os débitos obrigatórios de staging do **L6** — **CR-09, D-01, D-02, D-05, D-06** — permanecem **ABERTOS**.
Nada na Story 2.1 os toca ou resolve. **D-06 continua bloqueando `STAGING APPROVED`.**
