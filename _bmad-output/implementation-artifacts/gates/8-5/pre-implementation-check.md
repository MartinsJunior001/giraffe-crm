# Gate — pre-implementation-check — Story 8.5

**Status: APROVADO**

## Escopo confirmado
Suspender (`ACTIVE→SUSPENDED`) e reativar (`SUSPENDED→ACTIVE`) Membership pela autoridade do Admin
ativo da Org, atômico, auditado, com invalidação de acesso. Decisões D-1..D-4 aprovadas.

## Verificações

- **Sequência oficial:** BMAD/épico §664–681 lido; Spec Kit consolidado produzido em
  `specs/8-5-...` (spec/plan/tasks/analyze). Sem ambiguidade material → sem `clarify` formal.
- **context7-check:** Prisma (`/prisma/web`) — enums nativos PG são versionados por migration e
  membros novos são anexados via `ALTER TYPE ADD VALUE` sem reescrita de tabela. Interactive tx +
  `$queryRaw … FOR UPDATE` já é padrão provado no código (8.4). Better Auth/step-up reusados via
  `StepUpService` (sem nova assinatura). Nenhuma API inventada.
- **Precedente 8.4 estudado:** `membership-role.{core,service,dto}.ts`, `members.controller.ts`,
  `MembershipEvent`, migration `20260723120000`, `membership-role-http.test.ts`,
  `membership-events-rls.test.ts`. Padrão replicado no eixo de estado.
- **Isolamento multi-tenant:** toda query por `withTenantContext`/tx com `definirContextoOrg`;
  nenhum `where orgId` como única defesa; nenhuma rota aceita `orgId` do cliente.
- **Migration:** mínima (2 `ADD VALUE`); sem tabela/coluna/GRANT novo. `Membership.state` já coberto
  pelo GRANT UPDATE de `init_tenancy_rls`. Drill + rollback previstos.
- **Deny-by-default (D-3):** confirmado que `OrgContextResolver` relê `membership … state:'ACTIVE'`
  por requisição → SUSPENDED cai em deny-by-default SEM coluna de versão de autorização nova
  (mecanismo existente preferido, conforme D-3).
- **Sem antecipar escopo:** revogação segue o contrato puro materializado (CardGrant/CardResponsavel);
  Pipe/Database não revogados (AUTONOMOUS_DECISION + `DEB-8-5-PIPE-DB-GRANT-REVOKE`).
- **Guard/ability.ts C3 congelado:** autoridade fina no serviço; guard grosso reusa
  `administrar Organizacao`.

## Riscos e mitigação
- Concorrência do último Admin → `FOR UPDATE` + recontagem in-tx + guarda otimista + teste concorrente.
- `ALTER TYPE ADD VALUE` na mesma tx → só adiciona (não usa) → seguro.
- Sessão viva → `AbilityCache.invalidar` + limpeza de `AuthSession.activeOrganizationId`.

## Próximo: safe-implementation.
