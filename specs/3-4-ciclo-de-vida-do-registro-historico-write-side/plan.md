# Plan — Story 3.4

Baseline `4e60ee4`. Estratégia: **reuso máximo** da maquinaria de E2 (submissão 2.7, ciclo de vida 2.11) aplicada
ao Formulário de Database publicado (3.3), com uma entidade **distinta** `Record` (Card ≠ Registro).

## Decisões do clarify (Q1–Q5)

- **Q1 — GRANT de edição:** GRANT column-scoped único `UPDATE("lifecycleState","valores","updatedAt")`.
  `databaseId`/`formVersionId`/`orgId`/`origin`/`idempotencyKey`/`formId` **sem** UPDATE. Teste prova o escopo.
- **Q2 — leitura da 3.4:** só `GET /records/:recordId` (detalhe cru). Sem listagem (3.5), sem timeline (3.6).
- **Q3 — `origin`:** enum `RecordOrigin` com **um** valor (`NOVO_REGISTRO`). Não antecipar `AUTOMACAO`/`PUBLIC`.
- **Q4 — Database arquivado:** criar/editar/arquivar/**restaurar** Registro sob Database ARCHIVED → 409
  `DATABASE_ARQUIVADO` (Database arquivado = somente-leitura integral, coerente com 3.1). Ler é permitido.
- **Q5 — idempotencyKey obrigatória** na criação (400 se ausente).

## Camadas e arquivos

1. **Migration** `apps/api/prisma/migrations/<ts>_records/migration.sql` + rollback
   `apps/api/prisma/rollback/<ts>_records.down.sql`.
2. **Schema** `apps/api/prisma/schema.prisma` — `Record`/`RecordHistory`/`RecordLifecycleState`/`RecordOrigin` +
   back-relations. Regenerar client.
3. **Auditoria** `apps/api/src/kernel/db/tenant-context.ts` — `Record`/`RecordHistory` em `MODELOS_AUDITADOS`.
4. **Autz** `apps/api/src/databases/database-authz.ts` — `exigirOperarDatabase` (função pura).
5. **Núcleo puro** `apps/api/src/databases/records/record-lifecycle.transitions.ts` — espelho reduzido de 2.11.
6. **Serviços** `apps/api/src/databases/records/records.service.ts` (criação + edição de valores) e
   `record-lifecycle.service.ts` (arquivar/restaurar). Reusam `submission.ts` (de `pipes/cards/`) e o
   reconhecedor de conflito; resolvem a `FormVersion` publicada via publicação/localizadores da 3.3.
7. **Controllers** `apps/api/src/databases/records/records.controller.ts`.
8. **Módulo** `apps/api/src/databases/records/records.module.ts` (ou dentro de `DatabasesModule`), importando o
   necessário de `PipesModule` (já exporta o builder/publicação; `submission.ts` é puro).
9. **Testes** `apps/api/test/records-rls.test.ts` e `records-http.test.ts`.
10. **Docs** `CLAUDE.md` (bloco de estado 3.4); gates `gates/3-4/`.

## Fiação de módulos (sem ciclo)

`DatabasesModule` já importa `PipesModule` (3.3). `submission.ts` é função pura (import direto, sem provider). A
resolução da `FormVersion` publicada do Formulário de Database reusa `form-locate`/publicação exportados por
`PipesModule`. `database-authz` é puro. Databases→Pipes permanece **unidirecional**; sem ciclo.

## Ordem de execução (tasks)

T001 (gate) → T002/T003 (migration+schema) → T004 (autz) → T005/T006 (criação/edição) → T007 (ciclo de vida) →
T008 (controllers) → T009 (módulo) → T010/T011 (testes RLS+HTTP) → T012 (regressão) → T013 (SC-206) → T014
(CLAUDE.md) → T015 (revisão adversarial) → T016 (commit-check→PR→CI→merge→closure).

## Riscos e mitigação

Ver `spec.md §7`. Principal: não acoplar Card↔Registro — `submission.ts` permanece com assinatura intacta
(recebe snapshot+valores), e a regressão de Card (2.7/2.8) roda verde (T012). GRANT column-scoped provado por
fase vermelha (T010).
