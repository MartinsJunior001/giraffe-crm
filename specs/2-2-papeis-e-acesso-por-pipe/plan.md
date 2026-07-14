# Plan — Story 2.2: Papéis e acesso por Pipe

> Risco CRÍTICO. Fonte: `spec.md` + Story + PRD §D1.4/D1.3. Nova tabela de concessão + RLS + autorização
> por recurso. Empilha sobre a 2.1 (PR #17).

## Stack e fronteiras
- **apps/api** (NestJS 11, Prisma, PostgreSQL RLS). Estende o domínio `pipes/` (não cria domínio novo — a
  concessão pertence ao Pipe). Migration hand-written SQL + rollback. CASL estendido **no serviço** (não no
  guard). Sem frontend nesta Story (consumo visual é posterior).
- Superfície = API interna (rotas de concessão + ajuste da listagem de Pipes) + banco.

## Decisões técnicas (Clarify/Analyze consolidados)
1. **Concessão liga a `Membership`** (não `Account`) — o papel por Pipe vive dentro da Org; a Membership já
   carrega `orgId`/estado (AD-7/AD-10). FK `membershipId`, `onDelete: Cascade`.
2. **Revogação = soft-delete** (`state = REVOKED`, `revokedAt`), não DELETE — preserva trilha, auditável,
   simétrico a `MembershipState`. GRANT do runtime: `SELECT, INSERT, UPDATE` (sem DELETE).
3. **No máximo um papel efetivo por Pipe por pessoa** — **índice único parcial** `(pipeId, membershipId)
   WHERE state = 'ACTIVE'`. Segunda concessão ativa é **recusada** (erro claro), não substitui em silêncio;
   trocar papel é o `PATCH`.
4. **Só o Admin da Org concede** em 2.2 (deny-by-default; ampliar ao Admin do Pipe é evolução futura).
5. **Autorização fina no serviço** (DBT-AUTHZ-01): o guard grosso concede o **tipo** Pipe na Org; o serviço
   decide **qual** Pipe carregando o `PipeGrant` ativo do principal. O `ability.factory` passa a construir
   abilities de Pipe para MEMBER/GUEST **a partir da concessão carregada** — nunca no vácuo. **O guard não
   muda** (o arquivo já foi tocado na 2.1; não reabrir).
6. **RLS simétrico a Membership/Pipe:** ENABLE+FORCE, policies por `orgId = current_org_id()`. A RLS de
   `Pipe` continua org-scoped; o filtro por concessão é da **query** (junção com `PipeGrant` ativo), com
   não-enumeração (404, não 403).
7. **Runtime:** `withTenantContext` (recusa `$transaction`); operações single-statement. Conceder e alterar
   papel são únicos; revogar é `updateMany`.

## Touch-points (arquivos)
- **Novos:** `prisma/migrations/<ts>_pipe_grants/migration.sql`, `prisma/rollback/<ts>_pipe_grants.down.sql`;
  `src/pipes/grants/{pipe-grants.service,pipe-grants.controller}.ts`, `dto/pipe-grants.dto.ts` (ou dentro de
  `src/pipes/`); `test/pipe-grants-{rls,http,authz}.test.ts`.
- **Modificados:** `prisma/schema.prisma` (model `PipeGrant` + enums + relações inversas em `Pipe`,
  `Membership`, `Organization`); `src/kernel/authz/ability.factory.ts` (regras de MEMBER/GUEST por
  concessão carregada); `src/pipes/pipes.service.ts` (listagem/acesso filtrado por concessão para não-Admin);
  `src/kernel/db/tenant-context.ts` (`PipeGrant` em `MODELOS_AUDITADOS`); `CLAUDE.md` (bloco de estado).
- **Regenerar** `generated/prisma` (`prisma generate`).
- **NÃO tocar:** a migration da 2.1, o `authz.guard.ts` (decisão D-1 fechada), o contrato C3.

## Sequência (red-green-refactor)
Gates → schema+migration+generate → CASL no serviço (papel efetivo por concessão) → módulo de concessão +
ajuste da listagem → testes (RLS, authz por recurso, revogação, unicidade, regressão da 2.1, migration
deploy+rollback) → docs → gates finais + revisão adversarial **independente** (não subagente do
implementador — lição do PR #17).

## Riscos e mitigações
- **Vazar existência de Pipe não concedido** → não-enumeração: 404 para não concedido (nunca 403); testar
  que MEMBER com papel no Pipe X não vê o Pipe Y por lista **nem** por id (SC-227).
- **Regressão do acesso do Admin da Org (2.1)** → a suíte da 2.1 roda junto; AC3 tem teste próprio (SC-224).
- **Autorização por recurso feita no guard por engano** → revisão fixa que a checagem fina é no serviço
  (DBT-AUTHZ-01); teste prova que sem concessão o serviço nega mesmo com o guard concedendo o tipo.
- **Corrida na unicidade "um papel por Pipe"** → índice único **parcial** no banco (não checagem só na
  app); o INSERT concorrente falha no constraint, não numa leitura-antes-de-escrever.
- **Migration concorrente com a 2.1** → esta migration encadeia **depois** da `_pipes` (branch empilhada);
  nunca concorrente com o mesmo estado-base. Timestamp posterior ao da 2.1.
- **Colisão de fixtures paralelas** → escrita na **Org C**, como as suítes existentes.

## Constitution / arquitetura
Consome C3 (sem alterar o mecanismo) e C4 (RLS). AD-9 (autorização por recurso dentro do escopo de Org),
AD-6 (RLS, dois papéis, sem bypass), AD-10 (Org dona), AD-7 (Membership é o vínculo), AD-17 (migration
reversível). Consome D1.4/D1.3 (Produto, já aprovadas). Sem antecipar Card (2.10) nem modos condicionais.
