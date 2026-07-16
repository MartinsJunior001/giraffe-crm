# Gate T020 — Gates de conclusão da Story 3.2 (Papéis e acesso por Database)

Data: 2026-07-16 · Branch: `story/3-2-papeis-e-acesso-por-database` (off `origin/main` @ 29cf323; 3.1 `done`)

Este documento registra a execução dos gates obrigatórios de conclusão (CLAUDE.md / Constitution) com **evidência de
execução real** (Constitution X). A evidência de segurança/edge/aceite vem também da revisão adversarial read-only
(três camadas paralelas: Segurança, Edge Cases, Aceite), triada nesta Story.

Estado dos gates de qualidade no momento deste registro:

- **typecheck** (`tsc --noEmit -p tsconfig.json`, cobre `src` **e** `test`): ✅ verde.
- **lint** (`eslint .` na raiz): ✅ verde.
- **format** (Prettier): ✅ `All matched files use Prettier code style`.
- **suíte afetada** (`vitest run database-grants-http | database-grants-rls | databases-http`): ✅ **34/34** em
  PostgreSQL real (era 33; +1 do caso de escopo cross-Database adicionado na triagem — MÉDIO-1).

---

## security-check — ✅ APROVADO

Fonte primária: revisão adversarial de Segurança (read-only) + testes de integração real.

- **Isolamento é do banco (AD-6):** `DatabaseGrant` com RLS **ENABLE + FORCE**, 4 policies por `orgId =
  current_org_id()`, **WITH CHECK no INSERT e no UPDATE** (impede inserir/mover linha para outra Org). Provado por
  `database-grants-rls.test.ts` (dono = `giraffe_migrator`; isolamento cross-tenant; WITH CHECK via `createMany`
  sem RETURNING; UPDATE que tenta mover `orgId` negado; contexto ausente falha fechado).
- **GRANT é fronteira:** runtime `giraffe_app` com `SELECT/INSERT/UPDATE`, **sem DELETE** — revogar é soft-delete
  (`state=REVOKED`, `revokedAt`). Fase vermelha provada: `deleteMany` → `permission denied`.
- **`orgId` nunca vem do cliente:** gravado do contexto do servidor; DTOs só extraem `membershipId`/`role` (sem
  mass-assignment de `orgId`/`state`/`revokedAt`). Nenhum `where orgId` manual.
- **Não-enumeração:** sem acesso ao Database → **404 uniforme** (`resolverPoderNoDatabase`); concessão de outro
  Database/Org → 404; alvo de outra Org → 400 sem vazar. Coberto por CA1 e pelo caso de escopo cross-Database.
- **Autoridade hierárquica sem escalonamento:** Admin da Org concede qualquer papel; Admin do Database só
  MEMBER/VIEWER; tocar `ADMIN` do Database (conceder/alterar/revogar) é **só** do Admin da Org (403 senão).
  Vetores de escalonamento testados em CA2 (todos → 403).
- **Teto da Org (AD-9):** GUEST só recebe VIEWER (senão 400), aplicado em `conceder` **e** `alterarPapel`. CA3.
- **`ability.ts`/guard C3 congelados:** abriu-se apenas `ler Database` grosseiro na CASL (extensão prevista,
  idêntica a `ler Pipe`); `administrar Database` segue Admin-only; a autoridade fina vive no serviço (DBT-AUTHZ-01).

Achado residual (BAIXO, defesa em profundidade): o ciclo de vida (renomear/arquivar/restaurar) autoriza pela
guarda **grossa** `@Requer('administrar','Database')` (Admin-da-Org-only via CASL) e não por checagem fina no
serviço. **Decisão:** manter — a autorização de ciclo de vida é grossa por design (RV-2), e mantê-la Admin-da-Org-
only é o próprio RV-3; introduzir `exigirGerenciarDatabase` no serviço deixaria o **Admin do Database** arquivar,
violando o RV-3. Não é vulnerabilidade viva; o decorator é o guard pretendido.

## observability-check — ✅ APROVADO

- **Trilha de auditoria:** `DatabaseGrant` incluído em `MODELOS_AUDITADOS` (`tenant-context.ts`) — toda mutação
  (inclusive tentativa negada por RLS) entra na trilha. Os caminhos idempotentes (`revogar`/`alterarPapel` sobre
  concessão inexistente/já-revogada) fazem a leitura-guarda **antes** do `updateMany`, evitando um falso `denied`
  de auditoria (`count: 0`).
- **Logs sanitizados:** nenhum log de valores sensíveis; o payload de saída (`SELECT_GRANT`) exclui `orgId` por
  construção; `membershipId` é identificador interno (não PII: não é e-mail/nome). Mensagens de erro não ecoam
  valores recebidos.

## migration-check (SC-206) — ✅ APROVADO

- **Migration versionada** (`20260716140000_database_grants`) aplicada como etapa controlada (`db:migrate`), nunca
  no boot. `db:status` = `Database schema is up to date!` (17 migrations).
- **Bootstrap de papéis idempotente** e anterior às migrations (inalterado).
- **Drill SC-206 (deploy → rollback → reapply) verde em banco descartável:** o rollback
  (`prisma/rollback/20260716140000_database_grants.down.sql`) é **cirúrgico** — remove apenas as 4 policies, a
  tabela `DatabaseGrant` e os 2 enums (`DatabaseGrantState`, `DatabaseRole`), com `IF EXISTS` e na ordem correta;
  **não toca** `Database`/`Membership`/`Organization`/`PipeGrant`. Reapply íntegro; estado final intacto.
- **Índice único parcial** (`WHERE state='ACTIVE'`) por raw SQL (não expressável no Prisma 6.19.3) — provado no
  RLS suite.

## lgpd-check — ✅ APROVADO (mínima superfície)

- **Sem exclusão de dado do titular:** runtime sem GRANT de DELETE; revogar preserva a linha (`state`), mantendo a
  trilha de autoria/histórico. Consistente com o princípio de preservação já adotado (2.8/2.10).
- **Sem novo dado pessoal:** `DatabaseGrant` referencia `Membership` (vínculo interno), não `Account` global; não
  armazena e-mail/nome/telefone. Nenhum campo de PII novo. `orgId` fora do payload.

## backup-check — ✅ APROVADO (não aplicável a mudança de dado)

- Migration **aditiva** (nova tabela + enums), sem alteração destrutiva de dados existentes; rollback testado
  (SC-206). Nenhuma coluna/tabela existente é removida ou reescrita. Sem impacto no plano de backup.

## performance-check — ✅ APROVADO

- Índices em `(orgId, databaseId)` e `(orgId, membershipId)` + índice único parcial cobrindo os acessos do
  serviço (`findFirst` por `databaseId+membershipID+state`; `findMany` por `databaseId+state`). Toda query é
  org-scoped por `withTenantContext`. Sem N+1: `listar` de não-Admin é um único `findMany` com `grants.some`.
  Volumes de concessão por Database são pequenos; sem varredura ampla.

---

## Veredito

**APROVADO PARA COMMIT/PR.** Todos os gates de conclusão verdes com evidência real. Ressalvas de processo do
revisor de Aceite endereçadas: (a) `database-grants.module.ts` não criado — controller/service registrados
diretamente em `DatabasesModule`, equivalente e wired (typecheck+DI verdes), espelhando o padrão de Pipe;
(b) cobertura do caminho de escopo cross-Database (MÉDIO-1) **adicionada** (34/34). O aceite formal de "verde real"
da suíte cheia serial fica para o CI (runner limpo), conforme o padrão do repositório.
