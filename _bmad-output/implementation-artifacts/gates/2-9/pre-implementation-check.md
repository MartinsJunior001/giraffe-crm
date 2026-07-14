# Pre-Implementation Check — Story 2.9

**Veredito: APROVADO.**

## Sequência e artefatos
- BMAD → Spec Kit → implementação respeitada. Os artefatos (spec/plan/clarify/checklist/tasks/analyze + story
  context) foram preparados na track paralela e **incorporados por cópia** (não merge cego), validados contra o
  escopo do dono.

## Divergência de escopo — RESOLVIDA pelo dono (2026-07-14)
- O brief e os comentários da migration da 2.7 assumiam 2.9 = movimentação; o **`epics.md` autoritativo** escopa a
  2.9 como **leitura** e coloca a movimentação na **2.14**. O dono confirmou: **2.9 = somente leitura**, SEM
  migration, SEM GRANT UPDATE/DELETE em `Card`, SEM movimentação/drag persistente/mudança de Fase. As questões
  Q1-Q7 foram decididas (leitura; ordem `createdAt`+`id`; API interna; "estado"=Fase; capacidades no payload;
  paginado por cursor; histórico só estruturado — 2.17).

## context7-check
- **Prisma 6.19.3** (instalado), via MCP do Context7: **paginação por cursor** (`take`, `skip: 1`, `cursor: { id }`,
  `orderBy`) e **`groupBy`** (`by`, `where`, `_count`) confirmados na versão. Ordenação `[{createdAt},{id}]` com
  cursor por `id` (único, tie-break estável). Nenhuma assinatura inventada.
- **NestJS 11**: rotas GET convencionais com `@Query`; nenhum recurso novo.

## Escopo (Constitution II)
- Só leitura sobre `Card`/`Phase` já materializados (2.7/2.3). NÃO materializa coluna de estado do Card (2.11),
  leitura de `CardHistory` (2.17), movimentação/`MOVED`/`position` em Card (2.14), acesso/Responsável (2.10), nem
  frontend definitivo (fatia = API interna, padrão das 2.x).

## Segurança/isolamento
- Nenhuma mudança de schema/migration/GRANT: o runtime já tem `SELECT` em `Card`/`Phase` e **segue sem UPDATE**
  (invariante da 2.7 preservado; movimentação é 2.14). Toda leitura por `withTenantContext` (RLS). Autorização fina
  reusa `resolverPoderNoPipe` (404 não-enumerante; VIEWER lê); C3/`ability.ts`/guard intocados (DBT-AUTHZ-01).
  `orgId` fora da fronteira; `valores` (PII) só no detalhe, nunca na lista nem em log.

## Migration
- **Nenhuma.** Fatia read-only.

## Riscos
- Paginação/N+1 (gate NFR-3/4): resolvido com colunas paginadas por cursor determinístico + `groupBy` único para
  contagem (sem N+1). Isolamento das leituras (incl. `groupBy`) provado em `kanban-rls`; no-UPDATE reafirmado.
