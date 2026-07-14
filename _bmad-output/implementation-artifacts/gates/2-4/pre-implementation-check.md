# Pre-Implementation Check Report — Story 2.4 (Form Builder e catálogo canônico de Campos)

## Identificacao da tarefa
Story 2.4 — introdução do domínio **Formulário** do Épico 2: catálogo canônico de tipos de Campo (12 tipos) +
montagem de Formulários (adicionar/listar/reordenar Campos) nos contextos inicial e de Fase, com isolamento
por contexto (INV-FORM-01) e gate fail-closed do Campo Arquivo (AD-28). Branch
`story/2-4-form-builder-e-catalogo-canonico-de-campos`, empilhada sobre a 2.3 (PR #22, na `main`).

## Fase e etapa atual
Fase 1 (MVP CORE), Épico 2, bloco 2.4–2.6. BMAD (Story) e Spec Kit (`specify → plan → tasks → analyze`)
concluídos: `spec.md` + `plan.md` (8 Clarifications **fechadas**) + `tasks.md` + `analyze.md` (APROVADO PARA
IMPLEMENTAÇÃO). Liberada para implementação.

## Objetivo
Permitir que um usuário autorizado (Admin da Org ou Admin do Pipe) monte Formulários a partir de um catálogo
canônico de tipos de Campo, com identidade estável e isolamento por contexto e por Organização.

## Escopo incluido
Catálogo (enum `FieldType`, 12 tipos); `Form` (tabela única, contexto+owner) e `Field` (com `typeConfig`/
`defaultValue` `Json`, `position` fracionária, `state`); opções de Seleção em **JSON com UUID estável**;
montagem (getOrCreate/obter, listar na ordem, adicionar, reordenar) nos contextos inicial e de Fase;
autorização de config reusando a resolução da 2.3 (helper extraído); gate fail-closed do Campo Arquivo
(função + flag `FILE_UPLOAD_ENABLED`); RLS ENABLE+FORCE + GRANT sem DELETE.

## Fora do escopo
Editar/arquivar/restaurar Campo com travas, mudança de tipo, ciclo de opções (**2.5**); publicação/
versionamento e a **aplicação** do gate do Arquivo no ato de publicar (**2.6**); submissão/Card (**2.7+**);
contexto Database funcional e owner de Database (**E3**); exclusão definitiva; regras condicionais/validação
programável (fora da Fase 1). **Nada** de Card/Submissão/Database materializado (AD-11).

## Documentacao consultada
`epics.md` (Story 2.4), `prd.md` (D3.1/D3.2), `regras-negocio-fase-1.md` (RN-050..054), `ARCHITECTURE-SPINE`
(AD-11/12/27/28); código-fonte de 2.1/2.2/2.3 (`src/pipes/**`, `tenant-context.ts`, `env.ts`,
`request-context.ts`, migrations/rollbacks). **Context7** (`/prisma/web`): API de campo `Json` confirmada
(`@default("[]")`, `Prisma.DbNull` para `Json?`, `array_contains`).

## Story e criterios de aceite
AC1–AC6 (BDD) com SC-241..SC-249. Cobertura requisito→prova na tabela do `analyze.md`. Sem
`[NEEDS CLARIFICATION]` pendente.

## Regras de negocio afetadas
FR-14; D3.1 (catálogo/estrutura); D3.2 (config = Admin da Org/Admin do Pipe; publicação = 2.6); RN-050..054
(INV-FORM-01, RN-054 crítica → teste dedicado); AD-12 (identidade estável); AD-27/28 (fail-closed do Arquivo).

## Permissoes afetadas
`PERMISSAO = ACAO + ESCOPO`. Guarda grossa `@Requer('ler','Pipe')`; guarda fina no serviço (DBT-AUTHZ-01,
helper extraído): montar/ordenar = Admin da Org **ou** Admin do Pipe (grant ADMIN ACTIVE + Membership ACTIVE);
MEMBER/VIEWER concedidos só leem (403 ao montar); sem acesso → 404 não-enumerante. Deny-by-default. C3
(guard/`ability.ts`) **intocado**.

## Dados e entidades afetados
Novas: `Form`, `Field` (org-scoped). Enums `FieldType`/`FormContext`/`FieldState`. Fonte de verdade: o banco
(RLS). Isolamento multi-tenant: ENABLE+FORCE RLS, 4 policies por `current_org_id()`, WITH CHECK INSERT+UPDATE.
Relações inversas em `Organization`/`Pipe`/`Phase`. `Form`/`Field` em `MODELOS_AUDITADOS`. **Sem** tabela
`FieldOption` (opções em JSON — DBT-2.4-OPCOES-JSON). **Sem** coluna `databaseId` (contrato do E3).

## Arquitetura e modulos afetados
`apps/api/prisma/schema.prisma` (+enums/models); migration `<ts>_forms` + rollback; `src/pipes/forms/`
(service/controller/dto); helper de poder extraído em `src/pipes/`; `PhasesService` refatorado para consumir o
helper (neutro); `tenant-context.ts` (MODELOS_AUDITADOS); `env.ts` (+`FILE_UPLOAD_ENABLED`); `PipesModule`.

## Dependencias tecnicas
Prisma 6.19.3 (`Json`/enum/`Decimal` — `Json` verificado no Context7; índice único parcial e CHECK por raw
SQL, como 2.2/2.3), NestJS 11, CASL 7 (só consumo, sem novo mecanismo). Sem dependência nova.

## Skills obrigatorias para esta tarefa
`context7-check` (feito p/ Json; confirmar Decimal/enum na implementação), `security-check`,
`observability-check`, `lgpd-check` (definição de Campo = metadado, não PII), `migration-check`,
`safe-implementation`, revisão adversarial **independente**, `commit-check`. `backup-check`: sem novo dado
sensível persistido além do padrão org-scoped já coberto.

## Riscos identificados
- **RV-1** INV-FORM-01 provado por comportamento (SC-243), não só por construção.
- **RV-2** atomicidade de criar Campo de Seleção (opções no `typeConfig`, um único `create`).
- **RV-3** regressão da 2.3 pela extração do helper (suíte `phases-authz` verde antes/depois).
- **RV-4** ordem: rebasear sobre a `main` corrente antes do PR.

## Plano minimo de implementacao
Ordem: (1) schema; (2) migration+rollback; (3) `prisma generate` + deploy/rollback em banco descartável; (4)
extrair helper de poder + refatorar `PhasesService`; (5) `FormsService`+DTO+controller+gate do Arquivo+env; (6)
`MODELOS_AUDITADOS`; (7) módulo; (8) testes; (9) docs+gates. **Não alterar** C3 (`ability.ts`/`authz.guard.ts`),
o `criar` de Pipe/Fase, nem artefatos autoritativos.

## Estrategia de testes
PostgreSQL real, escrita na Org C, `toContain`. `forms-rls` (isolamento, fase vermelha, WITH CHECK via
`createMany`, sem DELETE, relowner); `forms-http` (catálogo, identidade estável, INV-FORM-01 dedicado,
ordenação, getOrCreate); `forms-authz` (diferencial em fase vermelha, SUSPENDED negado, 404); `forms-file-gate`
(unit puro fail-closed); regressão `phases-authz`; `migration-check`.

## Estrategia de rollback
`<ts>_forms.down.sql`: DROP policies/índices/CHECK/unique parciais/tabelas/enums, **sem tocar**
`Pipe`/`Phase`/`PipeGrant`/`Membership`. Provado por migration-check (deploy+rollback+reaplicação, descartável).

## Decisoes pendentes
Nenhuma bloqueante. As 8 Clarifications estão fechadas no `plan.md`. Débitos abertos registrados:
DBT-2.4-OPCOES-JSON, DBT-2.4-FILE-GATE-CONSUMO; herda DBT-2.2-FK-COMPOSTA.

## Status final
**APROVADO** — iniciar pela Phase 1 (schema/migration/RLS). RV-1/RV-2/RV-3 são gates de verificação durante a
codificação; RV-4 é regra de ordem.
