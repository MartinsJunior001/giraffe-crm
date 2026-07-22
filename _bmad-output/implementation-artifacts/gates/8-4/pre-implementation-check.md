# pre-implementation-check — Story 8.4

**Status: APROVADO**

## Escopo confirmado
Alteração de papel da Membership (ADMIN/MEMBER/GUEST) pela autoridade do Admin da Org, com step-up (D-1),
proteção atômica do último Admin (D-2), evento canônico + auditoria e invalidação de abilities (D-3).

## Sequência oficial
BMAD (épico 8.4 em `epics.md`) + decisões D-1..D-4 APROVADAS → Spec Kit consolidado (spec/plan/tasks/analyze
em `specs/8-4-...`) → implementação → gates. OK.

## Verificações
- **Não antecipa escopo:** `MembershipEvent` tem consumidor concreto (8.4) e imediato (8.5/8.6). Preflight de
  Card e teto GUEST de PipeGrant NÃO inventados (DIV-3; `DEB-PIPEGRANT-GUEST-CEILING`). OK.
- **Artefatos autoritativos:** PRD/UX/Spine/epics/sprint-status NÃO editados. Só specs/gates/código. OK.
- **Migration:** 1 migration nova (tabela `MembershipEvent`), aditiva, com rollback trivial (DROP). Slot único. OK.
- **context7-check:** executado (Prisma interactive tx + FOR UPDATE + parametrização). OK.
- **Reuso:** step-up 1.12, `AbilityCache` 1.6, `definirContextoOrg` 2.6/2.7/3.4, padrão `MovementEvent` 2.16,
  `pipe-authz`/`database-authz` para autoridade fina. Nenhuma stack nova.

## Riscos e mitigação
- Concorrência do último Admin → `SELECT … FOR UPDATE` na `Organization` + reléitura in-tx + teste concorrente.
- TOCTOU do alvo/step-up → revalidação DENTRO da tx.
- Vazamento cross-tenant → RLS FORCE + WITH CHECK; nenhuma query fora de `withTenantContext`/tx com contexto.

Prossegue para `safe-implementation`.
