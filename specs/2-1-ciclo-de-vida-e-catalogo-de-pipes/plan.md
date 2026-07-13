# Plan — Story 2.1: Ciclo de vida e catálogo de Pipes

> Risco CRÍTICO. Fonte: `spec.md` + Story. Nova tabela + RLS + migration.

## Stack e fronteiras
- **apps/api** (NestJS 11, Prisma, PostgreSQL RLS). Domínio novo `pipes/`. Migration hand-written SQL
  (padrão do projeto) + rollback. CASL estendido no kernel de authz.
- Sem frontend nesta Story (o catálogo visual é consumo posterior; a casca C6 já existe). Superfície =
  API interna + banco.

## Decisões técnicas (Clarify/Analyze consolidados)
1. **Sem unicidade de `name`** — id é o ref estável (AD-11); evita colisão no restaurar. RN-024 é
   consistência de exibição, não unicidade.
2. **Arquivamento = mudança de estado** (`ACTIVE`/`ARCHIVED` + `archivedAt`), nunca DELETE. Runtime
   **sem GRANT DELETE** → "sem exclusão definitiva" é fronteira de banco, não só de app.
3. **Trava por Cards ativos = contrato futuro (2.11)** — AD-11 proíbe materializar relação para o
   futuro; não há tabela de Card. `arquivar` é incondicional em 2.1 (vacuamente correto: zero Cards).
4. **`locked`/`starred`** = atributos persistidos/alternáveis, **sem** semântica de bloqueio inventada
   (Constitution II).
5. **Autorização:** só ADMIN administra/lê Pipe em 2.1 (papéis por Pipe = 2.2). Estende o catálogo CASL
   (novo sujeito `Pipe`), sem alterar o mecanismo C3.
6. **RLS simétrico a Membership:** ENABLE+FORCE, policies por `orgId = current_org_id()`; GRANT
   SELECT/INSERT/UPDATE.
7. **Runtime:** `withTenantContext` (recusa `$transaction`); todas as operações de 2.1 são single-
   statement (create/update/find) — sem necessidade de transação multi-statement.

## Touch-points (arquivos)
- **Novos:** `prisma/migrations/<ts>_pipes/migration.sql`, `prisma/rollback/<ts>_pipes.down.sql`;
  `src/pipes/{pipes.module,pipes.service,pipes.controller,dto/*}.ts`;
  `test/pipes.test.ts` (ou `test/pipes-rls.test.ts` + `test/pipes-http.test.ts`).
- **Modificados:** `prisma/schema.prisma` (model `Pipe` + `Organization.pipes` + enum);
  `src/kernel/authz/ability.ts` (+sujeito `Pipe`), `ability.factory.ts` (+regras ADMIN);
  `src/app.module.ts` (importa `PipesModule`); `CLAUDE.md` (bloco de estado da Story).
- **Regenerar** `generated/prisma` (`prisma generate`).

## Sequência (red-green-refactor)
Gates → schema+migration+generate → CASL → module/service/controller → testes (RLS, authz negativa,
CRUD, archive/restore, migration deploy+rollback) → docs → gates finais.

## Riscos e mitigações
- **Bypass/erro de RLS** → replicar exatamente o padrão de Membership; teste prova negação sem contexto
  (fase vermelha) e isolamento cross-tenant.
- **Drift schema↔migration** (SQL hand-written vs Prisma client) → escrever DDL fiel às convenções do
  Prisma (init migration) e rodar `prisma generate`; typecheck + testes reais pegam divergência.
- **Colisão de migration** (pipeline 2.1/2.2) → uma única migration estrutural ativa nesta cadeia; a
  2.2 encadeia depois (branch empilhada), nunca concorrente com o mesmo estado-base.
- **Exclusão definitiva acidental** → sem GRANT DELETE; teste prova.
- **Colisão de fixtures paralelas** → testes de escrita na **Org C** (área de escrita), como as suítes
  existentes.

## Constitution / arquitetura
Consome C1–C8 sem alterar. AD-6 (RLS, dois papéis, sem bypass), AD-10 (Org dona), AD-11 (id estável, não
materializar futuro), AD-13 (mutação pelo domínio dono), AD-14 (fonte única), AD-17 (migration
reversível). Sem antecipar 2.2/2.3/Cards.
