# Pacote de revisão externa — Story 2.1 (PR #17)

> **Para o revisor externo.** Este documento reúne tudo o que você precisa para revisar a Story 2.1 sem
> depender do agente que a implementou. O implementador **pode** responder perguntas e fornecer evidência,
> mas **não** emite o veredito — os três vereditos abaixo são seus.
>
> **Importante sobre a rodada anterior:** já houve uma revisão adversarial, de segurança e de arquitetura,
> porém emitida por **subagentes do próprio implementador** — o que **não** conta como independente. Os
> vereditos delas estão em `aceites-independentes.md` como *insumo* que você pode conferir ou contestar,
> **não** como aprovação válida. Sua revisão os substitui.

- **PR:** #17 · **Base:** `main` (`c1baef7`) · **Head:** `56f61f4`
- **Estado:** `OPEN`, `MERGEABLE/CLEAN`, 4 jobs de CI verdes
- **Commits:** `c91e321` (implementação), `56f61f4` (aceites + débitos — docs)
- **Diff:** 35 arquivos, +2641 −14

---

## 1. Objetivo e limites da Story 2.1

Primeira entidade de domínio do Épico 2. O Admin da Organização **cria, renomeia, arquiva e restaura**
Pipes; catálogo org-scoped; arquivamento reversível sem perda de dados. Risco **CRÍTICO** — nova tabela
com RLS, migration versionada, toca o invariante-mãe (isolamento por Organização).

**Fora do escopo (congelado):** papéis/acesso **por Pipe** (Story 2.2), **Fases** (2.3), Formulários,
Cards, exclusão definitiva, duplicação, reordenação global, semântica de `locked`, trava de arquivamento
por Cards ativos (contrato futuro 2.11).

Fonte completa: `specs/2-1-.../spec.md`, `_bmad-output/.../2-1-ciclo-de-vida-e-catalogo-de-pipes.md`.

## 2. Como ver o diff completo

```bash
git fetch origin
git diff main...origin/story/2-1-ciclo-de-vida-e-catalogo-de-pipes          # completo
git diff main...origin/story/2-1-... -- apps/api                            # só código
git show c91e321 -- apps/api/src/kernel/authz/                              # o ponto D-1
```

Arquivos de aplicação (revisão concentra-se aqui):
- `apps/api/prisma/schema.prisma` — enum `PipeState`, model `Pipe`, relação inversa
- `apps/api/prisma/migrations/20260713120000_pipes/migration.sql` — DDL + RLS + GRANT
- `apps/api/prisma/rollback/20260713120000_pipes.down.sql`
- `apps/api/src/pipes/{pipes.service,pipes.controller,pipes.module}.ts`, `dto/pipes.dto.ts`
- `apps/api/src/kernel/authz/{ability.ts,ability.factory.ts,authz.guard.ts}` ← **D-1 aqui**
- `apps/api/src/kernel/db/tenant-context.ts` — `Pipe` em `MODELOS_AUDITADOS`
- `apps/api/src/app.module.ts` — importa `PipesModule`
- `apps/api/test/pipes-{rls,http,authz}.test.ts`

## 3. Migration e rollback

`migration.sql`: `CREATE TYPE PipeState` · `CREATE TABLE Pipe` · índice `(orgId, state)` · FK →
`Organization` (`ON DELETE CASCADE`) · `ENABLE` **e** `FORCE ROW LEVEL SECURITY` · 4 policies ·
`GRANT SELECT, INSERT, UPDATE ... TO giraffe_app` (**sem DELETE**).

`..._pipes.down.sql`: `DROP POLICY` (as 4) → `DROP TABLE Pipe` → `DROP TYPE PipeState`. O passo de remover
a linha de `_prisma_migrations` fica no `db-migrate.mjs`, não no `.down.sql` (para não ser esquecido).

⚠️ Rollback desta migration **apaga os Pipes** (`DROP TABLE`) — operação com perda de dados; ver
`backup-check.md`.

## 4. Policies e grants (o que exatamente exercitar)

```
pipe_select  FOR SELECT  USING ("orgId" = current_org_id())
pipe_insert  FOR INSERT  WITH CHECK ("orgId" = current_org_id())
pipe_update  FOR UPDATE  USING (...) WITH CHECK ("orgId" = current_org_id())
pipe_delete  FOR DELETE  USING (...)         -- inalcançável: runtime sem GRANT DELETE
GRANT: SELECT, INSERT, UPDATE  (sem DELETE)
```

`current_org_id()` (definida em `..._init_tenancy_rls`) devolve NULL sem contexto → `orgId = NULL` nunca é
TRUE → nega. O contexto é injetado por transação via `set_config('app.current_org_id', ..., true)`.

## 5. Testes (o que provam)

- `pipes-rls.test.ts` (PostgreSQL real) — papel sem BYPASSRLS; ENABLE+FORCE; dono ≠ runtime (olha
  `relowner`, não só a flag); isolamento; **`WITH CHECK` provado com `createMany` (sem RETURNING)** para
  não passar pelo motivo errado; UPDATE que "moveria" para outra Org negado; contexto ausente falha
  fechado; runtime sem DELETE.
- `pipes-authz.test.ts` — ADMIN concede; MEMBER/GUEST negados em `ler` e `administrar`; ADMIN não alcança
  outra Org. Fixa o comportamento do guard (linhas 83-88: ficam vermelhas se o guard voltar a montar o
  sujeito sem `orgId`).
- `pipes-http.test.ts` — 401 sem principal; 403 MEMBER; 201 criar; 200 listar/renomear/arquivar/restaurar;
  404 cross-tenant (não-enumeração); 400 sanitizado (sem name, id malformado, PATCH vazio).

Rodar: `pnpm --filter @giraffe/api exec vitest run test/pipes-rls.test.ts test/pipes-authz.test.ts test/pipes-http.test.ts`

## 6. Evidência do SC-206 (migration em banco descartável)

`gates/2-1/migration-check.md` — 13/13 passos em PostgreSQL descartável: deploy → verificação de
RLS/policies/GRANT/dono → smoke de isolamento com o papel de runtime → rollback → remoção **cirúrgica**
(`Organization`/`Membership`/`Account` intactas, linha removida de `_prisma_migrations`) → reaplicação →
smoke → destruição. Comandos reproduzíveis inclusos.

## 7. CI (4 jobs, head `56f61f4`)

`Qualidade (format, lint, typecheck, build)` · `Testes (PostgreSQL real, migrations em banco vazio)` ·
`Containers (boot real + smoke)` · `Segurança (Trivy)` — **todos pass**. Confirme com `gh pr checks 17`.

## 8. Achados e correções já feitos

- **Defeito real corrigido:** `archive`/`restore` respondiam **201** (default do `@Post`) sem criar
  recurso → **200** (`@HttpCode`); `POST /pipes` segue 201. O teste falhou de verdade e a correção foi no
  código.
- **Probe residual removido:** um `zz-probe-adversarial.test.ts` untracked (resíduo da rodada anterior)
  foi apagado; nunca fez parte do commit.

## 9. Riscos residuais (todos LOW, aceitos e rastreados)

- **R-1** — arquivar um Pipe já arquivado gera linha `denied` na trilha (ruído de auditoria, `count: 0`).
- **R-2 / DBT-AUTHZ-01** — escopo do guard é organizacional; regra futura por *id de recurso* falha
  **fechada**. É para a Story 2.2.
- **R-3 / DBT-ROLLBACK-CI** — o CI exercita deploy, não rollback. SC-206 provou à mão; falta automatizar.
- **R-4** — rollback apaga os Pipes (esperado em rollback de schema).
- **M-1** — `?arquivados=` compara `=== 'true'`; `?arquivados=1` cai em "só ativos" (só UX).

Detalhes: `specs/2-1-.../analyze.md`, `gates/2-1/{code-review,debitos-gerados}.md`.

## 10. Decisão D-1/C3 — **o ponto que mais precisa do seu olhar**

`apps/api/src/kernel/authz/authz.guard.ts` **pertence ao contrato congelado C3** e foi modificado:

```
- ability.can(requisito.acao, subject(requisito.sujeito, { id: orgId }))
+ ability.can(requisito.acao, subject(requisito.sujeito, { id: orgId, orgId }))
```

Argumento do implementador (a validar): `Organizacao` escopa por `id`, sujeitos de domínio (`Pipe`) por
`orgId`; o campo extra é **inerte** para `Organizacao` (o CASL avalia só as chaves da condition); ambos
recebem o mesmo `orgId` resolvido no servidor. Regressão do L1 (`authz.test.ts`) verde.

**O que você deve decidir:**
- O comportamento de `Organizacao` é mesmo preservado bit a bit?
- A mudança amplia o alcance de algum papel?
- Um sujeito CASL futuro cuja condition use `id` como *id do recurso* — falha aberta (concede) ou fechada
  (nega)? Isso é aceitável?
- É extensão legítima do catálogo de sujeitos (que o AD-9 prevê) ou alteração do mecanismo congelado C3?

Contexto do C3: `_bmad-output/implementation-artifacts/l1-contratos-congelados.md` §C3; AD-9 em
`ARCHITECTURE-SPINE.md`.

## 11. Pontos de segurança a exercitar (banco de dev em 127.0.0.1:5434)

- RLS `ENABLE` **e** `FORCE` (`pg_class.relrowsecurity`, `relforcerowsecurity`).
- Runtime **sem** DELETE (`has_table_privilege('giraffe_app','"Pipe"','DELETE')` = f); SELECT/INSERT/UPDATE = t.
- Dono da tabela = `giraffe_migrator`, **não** o runtime (`relowner`).
- Falha fechada sem contexto (leitura vazia, escrita negada).
- Isolamento cross-tenant (leitura E escrita) — outro tenant não vê nem escreve.
- `WITH CHECK` efetivamente exercitado (INSERT com orgId alheio negado; UPDATE que moveria para outra Org
  negado) — prove **sem** RETURNING.
- Ausência de bypass direto pelo Prisma (todo acesso via `withTenantContext`; nenhum `where orgId` manual;
  `$transaction` recusada).
- ID inexistente ou de outro tenant → 404 uniforme (não-enumeração).

## 12. Contratos C1–C8

**C4** (RLS) e **C6** (casca, intocada) consumidos sem alteração. **C3** consumido pela adição do sujeito
`Pipe`, **com a ressalva D-1** (o arquivo do guard foi tocado). C1/C2/C5/C7/C8 não tocados; suítes
completas verdes. Confirme que nenhum outro contrato foi erodido.

## Arquivos deliberadamente fora do PR

`.python-version` e `.claude/skills/commit/` (possível padronização oficial — decisão de equipe, não da
2.1); `_bmad-output/.../tooling/closure-automation-proposal.md` (proposta de processo); tooling de agente
(`.claude/skills/bmad-*`, `speckit-*`, `.agent/`, `.agents/`) em `.git/info/exclude`. O `.gitignore`
versionado **não** foi alterado.

---

## Vereditos exigidos (registre evidência, não só a palavra)

1. **Revisão adversarial:** `APPROVED` | `APPROVED WITH LOW FINDINGS` | `CHANGES REQUIRED` | `BLOCKED`
2. **Segurança:** `SECURITY APPROVED` | `SECURITY CHANGES REQUIRED` | `SECURITY BLOCKED`
3. **Arquitetura C3:** `C3 COMPATIBLE — APPROVED` | `C3 CHANGES REQUIRED` | `ARCHITECTURAL DECISION REQUIRED`

CRITICAL/HIGH/MEDIUM → corrigir antes do merge. LOW → aceitável com justificativa, responsável, lote alvo,
critério de aceite e rastreabilidade.
