# Pacote de revisão externa — Story 2.2, incremento 1 (PR #18, empilhado sobre #17)

> **Para o revisor externo.** Este documento reúne tudo o que você precisa para revisar o **incremento 1**
> da Story 2.2 sem depender do agente que o implementou. O implementador **pode** responder perguntas e
> fornecer evidência, mas **não** emite o veredito — os vereditos abaixo são seus.
>
> **Independência (lição do #17):** qualquer revisão emitida por subagentes do próprio implementador **não**
> conta como independente. O revisor externo é outro humano ou uma IA iniciada separadamente pelo usuário.

- **PR:** #18 · **Base:** `story/2-1-ciclo-de-vida-e-catalogo-de-pipes` (**empilhado**, não `main`) · **Head:** `c3871e6`
- **Estado:** `Draft`, `MERGEABLE`. **Não** deve mergear em `main` antes do #17 (Story 2.1) ser revisado e mergeado por humano.
- **Commits sobre a 2.1:** `8828f20` (prep BMAD/Spec Kit/gates — docs), `c3871e6` (implementação — feat)
- **Diff (`2.1...HEAD`):** 21 arquivos, +1711 −8 — **somente arquivos da 2.2**; nenhum arquivo da 2.1 tocado.

---

## 1. Objetivo e limites do incremento 1

Story 2.2 = **Papéis e acesso por Pipe**. Este PR entrega **apenas o incremento 1**: a camada de **gestão de
concessões** (`PipeGrant`) — conceder/listar/alterar/revogar um papel de Pipe a uma Membership. É
**exclusivamente aditivo**: **não** altera o comportamento de acesso a Pipe da Story 2.1.

**Fora do escopo deste PR (incremento 2, suspenso até o merge da 2.1):** a **abertura de acesso** a
MEMBER/VIEWER (fazer o não-Admin enxergar só os Pipes concedidos) — reescreve `pipes.service`,
`pipes.controller` e `ability.factory`, que estão **sob revisão no #17**. Por isso está separado.

Neste incremento, as rotas de concessão exigem **Admin da Organização** (`@Requer('administrar','Pipe')`).

Fonte completa: `specs/2-2-papeis-e-acesso-por-pipe/spec.md`, `_bmad-output/.../2-2-papeis-e-acesso-por-pipe.md`.

## 2. Como ver o diff completo

```bash
git fetch origin
git diff origin/story/2-1-ciclo-de-vida-e-catalogo-de-pipes...origin/story/2-2-papeis-e-acesso-por-pipe            # completo
git diff origin/story/2-1-...origin/story/2-2-... -- apps/api                                                       # só código
git show c3871e6 -- apps/api/prisma/migrations/20260713130000_pipe_grants/migration.sql                             # a migration
```

Arquivos de aplicação (a revisão concentra-se aqui):
- `apps/api/prisma/schema.prisma` — enums `PipeRole`/`PipeGrantState`, model `PipeGrant`, relações inversas
- `apps/api/prisma/migrations/20260713130000_pipe_grants/migration.sql` — DDL + índice parcial + RLS + GRANT
- `apps/api/prisma/rollback/20260713130000_pipe_grants.down.sql`
- `apps/api/src/pipes/grants/{pipe-grants.service,pipe-grants.controller,pipe-grants.dto}.ts`
- `apps/api/src/pipes/pipes.module.ts` — registra o controller/service novos
- `apps/api/src/kernel/db/tenant-context.ts` — `PipeGrant` em `MODELOS_AUDITADOS`
- `apps/api/test/pipe-grants-{rls,http}.test.ts`

## 3. Migration e rollback

`migration.sql`: `CREATE TYPE PipeRole` · `CREATE TYPE PipeGrantState` · `CREATE TABLE PipeGrant` · índices
`(orgId,pipeId)` e `(orgId,membershipId)` · **índice único PARCIAL** `(pipeId, membershipId) WHERE
state='ACTIVE'` · 3 FKs → `Pipe`/`Membership`/`Organization` (`ON DELETE CASCADE`) · `ENABLE` **e** `FORCE
ROW LEVEL SECURITY` · 4 policies · `GRANT SELECT, INSERT, UPDATE ... TO giraffe_app` (**sem DELETE**).

`..._pipe_grants.down.sql`: `DROP POLICY` (as 4) → `DROP TABLE PipeGrant` → `DROP TYPE` (os 2 enums).
**Não toca** `Pipe`/`Membership`/`Organization`. A remoção da linha de `_prisma_migrations` fica no
`db-migrate.mjs`, não no `.down.sql`.

⚠️ Rollback **apaga as concessões** (`DROP TABLE`) — perda de dados própria de rollback de schema.

## 4. O índice único parcial (coração deste incremento)

```
CREATE UNIQUE INDEX "PipeGrant_pipeId_membershipId_active_key"
  ON "PipeGrant"("pipeId","membershipId") WHERE "state" = 'ACTIVE';
```

Garante **um papel ativo por par (Pipe, pessoa)** — no **banco**, não na aplicação. A parcialidade
(`WHERE state='ACTIVE'`) permite **revogar e re-conceder** sem colisão (a linha `REVOKED` sai do índice). O
Prisma 6.19.3 **não** expressa índice parcial no schema (é v7.4+; ver `context7-check.md`), então vai no raw
SQL da migration, como as policies. `conceder` captura o `P2002` do banco e responde **409**.

## 5. Policies e grants

```
pipe_grant_select  FOR SELECT  USING ("orgId" = current_org_id())
pipe_grant_insert  FOR INSERT  WITH CHECK ("orgId" = current_org_id())
pipe_grant_update  FOR UPDATE  USING (...) WITH CHECK ("orgId" = current_org_id())
pipe_grant_delete  FOR DELETE  USING (...)      -- defesa em profundidade: inalcançável (runtime sem GRANT DELETE)
GRANT: SELECT, INSERT, UPDATE  (sem DELETE)  →  revogar = soft-delete (state=REVOKED, revokedAt)
```

## 6. Testes (o que provam) — PostgreSQL real

- `pipe-grants-rls.test.ts`: papel sem BYPASSRLS; ENABLE+FORCE; dono = migrator (`relowner`, não só a flag);
  isolamento cross-org; **`WITH CHECK` com `createMany` (sem RETURNING)**; contexto ausente falha fechado;
  **índice parcial** (2ª ativa ao mesmo par barrada; revogar+re-conceder aceito); runtime sem DELETE.
- `pipe-grants-http.test.ts`: 401 sem principal; **403 MEMBER** (só Admin da Org concede neste incremento);
  ciclo CRUD completo; **409** 2ª concessão ativa; revogação idempotente (2ª → 404); **404 cross-tenant
  (não-enumeração)**; **400** alvo de Membership de outra Org; 400 validação (id malformado, papel inválido).

Rodar: `pnpm --filter @giraffe/api exec vitest run test/pipe-grants-rls.test.ts test/pipe-grants-http.test.ts`

## 7. Evidência do SC-228 (migration em banco descartável)

`gates/2-2/migration-check.md` — deploy (encadeia após `_pipes`) → verificação de tabela/enums/RLS/policies/
**índice parcial**/GRANT/dono → smoke do índice parcial com o papel de runtime → rollback **cirúrgico**
(`Pipe`/`Membership`/`Account` intactos, linha removida de `_prisma_migrations`) → reaplicação → destruição.
Todos os passos verdes; comandos reproduzíveis inclusos. Falso negativo do arranjo (autocommit vs.
`set_config(...,true)` transaction-local) foi identificado e corrigido — a migration sempre esteve correta.

## 8. CI (head `c3871e6`)

`Qualidade` · `Testes (PostgreSQL real)` · `Containers (boot real + smoke)` · `Segurança (Trivy)`. Confirme
com `gh pr checks 18`. **266/266** testes locais (13 novos da 2.2), build/format/lint/typecheck verdes.

## 9. Pontos de segurança a exercitar (banco de dev em 127.0.0.1:5434)

- RLS `ENABLE` **e** `FORCE` em `PipeGrant`.
- Runtime **sem** DELETE (`has_table_privilege('giraffe_app','"PipeGrant"','DELETE')` = f); SELECT/INSERT/UPDATE = t.
- Dono da tabela = `giraffe_migrator`, não o runtime.
- Índice parcial impede 2ª concessão ativa ao mesmo par; revogar+re-conceder funciona.
- Não-enumeração: Pipe de outra Org → 404 (não 403); Membership de outra Org como alvo → 400 sanitizado.
- Todo acesso via `withTenantContext`; nenhum `where orgId` manual; nenhuma rota aceita `orgId` do cliente.
- Auditoria registra concessão/revogação **e** a tentativa negada (`count: 0`).

## 10. Contratos e escopo

- **C4** (RLS): consumido pelo padrão replicado em `PipeGrant` (ENABLE+FORCE, 4 policies, WITH CHECK, GRANT mínimo).
- **C3** (autorização): consumido **sem alteração do mecanismo** — as rotas usam `@Requer('administrar','Pipe')`,
  o sujeito `Pipe` já existente da 2.1. `authz.guard.ts` **não** foi tocado neste incremento (a checagem fina
  por concessão é do incremento 2, e roda no serviço, não no guard — DBT-AUTHZ-01).
- **Sem antecipação de escopo** (Constitution II): a abertura de acesso, que exigiria tocar arquivos da 2.1,
  foi **deliberadamente adiada**, não implementada.

## 11. Riscos residuais (LOW, aceitos e rastreados)

- **DBT-ROLLBACK-CI** (L6) — o CI exercita deploy, não rollback. SC-228 provou à mão.
- Rollback apaga as concessões (esperado em rollback de schema; exige backup verificado em produção).
- Auditoria: revogar uma concessão já revogada produz `count: 0` → aparece como `denied` (ruído conhecido,
  mesmo padrão da 2.1).

## Arquivos deliberadamente fora do PR

`.python-version` e `.claude/skills/commit/` (possível padronização oficial — decisão de equipe);
`_bmad-output/.../tooling/closure-automation-proposal.md` (proposta de processo). O `.gitignore` versionado
**não** foi alterado.

---

## Vereditos exigidos (registre evidência, não só a palavra)

1. **Revisão adversarial:** `APPROVED` | `APPROVED WITH LOW FINDINGS` | `CHANGES REQUIRED` | `BLOCKED`
2. **Segurança:** `SECURITY APPROVED` | `SECURITY CHANGES REQUIRED` | `SECURITY BLOCKED`
3. **Migration/RLS:** `MIGRATION APPROVED` | `MIGRATION CHANGES REQUIRED` | `MIGRATION BLOCKED`

CRITICAL/HIGH/MEDIUM → corrigir antes do merge. LOW → aceitável com justificativa, responsável, lote alvo,
critério de aceite e rastreabilidade.
