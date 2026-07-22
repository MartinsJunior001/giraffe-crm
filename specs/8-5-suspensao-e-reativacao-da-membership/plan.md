# Plan — Story 8.5

## Risco: ALTO (autorização, multi-tenancy, concorrência, migration, invalidação de sessão)

Gates: testes da área crítica; integração real (PostgreSQL de verdade); regressão de segurança;
typecheck/lint/build; migration drill + rollback; QA cruzada; CI no SHA exato; validação pós-merge.

## Arquitetura da mudança (menor mudança correta, aditiva)

Reusa 100% do substrato da 8.4 — não reescreve o núcleo de papel.

| Camada | Arquivo | Ação |
| --- | --- | --- |
| enum | `apps/api/prisma/schema.prisma` | `MembershipEventType += SUSPENDED, REACTIVATED` |
| migration | `.../migrations/20260724120000_membership_state_events/migration.sql` | `ALTER TYPE ADD VALUE` x2 |
| núcleo puro | `apps/api/src/organizations/members/membership-state.core.ts` | `planejarTransicaoEstado` |
| serviço | `.../membership-state.service.ts` | tx interativa + FOR UPDATE + preflight + evento |
| dto | reusa `membership-role.dto.ts::exigirUuid` | rota sem corpo |
| controller | `.../members.controller.ts` | `POST :id/suspend`, `POST :id/reactivate` |
| módulo | `organizations.module.ts` | registra `MembershipStateService` |

## Fluxo — suspender (POST /organizations/members/:membershipId/suspend)

1. guard `administrar Organizacao` (403 se não-Admin).
2. serviço: contexto resolvido; `papel !== ADMIN` → 403 (defesa em profundidade).
3. lê alvo sob RLS → `null` → **404**.
4. resolve sessão + step-up (`StepUpService`).
5. pré-cheque puro `planejarTransicaoEstado` (recusa cedo: ESTADO_INVALIDO/NOOP/AUTOSSUSPENSAO/STEP_UP/ULTIMO_ADMIN).
6. lê `CardGrant` ativos + `CardResponsavel` ativos do alvo → preflight puro → plano `aoAlterarMembership`.
7. **tx interativa (client raiz)**: `definirContextoOrg` → `SELECT id FROM "Organization" … FOR UPDATE`
   → relê alvo + recontagem de Admins ativos → re-decide (anti-TOCTOU) → guarda otimista
   `updateMany where state=<lido>` (0 → CONFLITO) → revoga `CardGrant` (REVOKED) + remove
   `CardResponsavel` (REMOVED) → limpa `AuthSession.activeOrganizationId` do alvo p/ a Org →
   grava `MembershipEvent SUSPENDED`.
8. pós-commit: `AbilityCache.invalidar(alvoAccountId, orgId)` + auditoria manual.
9. P2002/P2028 → 409, nunca 500.

## Fluxo — reativar (POST /organizations/members/:membershipId/reactivate)

Igual, sem FOR UPDATE de invariante (reativar ADiciona Admin; não há trava) e **sem** restauração de
concessões (plano vazio). Guarda otimista `updateMany where state='SUSPENDED'`. `MembershipEvent
REACTIVATED`. `AbilityCache.invalidar`.

## Núcleo puro — decisão (fail-closed, ordem determinística)

```
planejarTransicaoEstado({ estadoAtual, transicao, ehProprio, adminsAtivos, papelAlvo, stepUpValido })
SUSPENDER:
  REMOVED           → ESTADO_INVALIDO (409)
  já SUSPENDED       → NOOP (200 idempotente, sem escrita/evento)
  ehProprio          → AUTOSSUSPENSAO (403)   # vedado antes de checar step-up
  !stepUpValido      → STEP_UP (403)
  ADMIN && admins<=1 → ULTIMO_ADMIN (409)
  else               → APLICAR
REATIVAR:
  REMOVED            → ESTADO_INVALIDO (409)  # encerramento não é reativação simples (8.6)
  já ACTIVE          → NOOP
  !stepUpValido      → STEP_UP (403)
  else               → APLICAR                # sem trava de último Admin, sem restauração
```

## AUTONOMOUS_DECISION — escopo de revogação na suspensão

```
AUTONOMOUS_DECISION
CONTEXT: a prosa do épico (§591/§913) cita "papéis de Pipe/Database" entre o que a
  suspensão revoga e a reativação não restaura; o contrato PURO materializado da 2.10
  (membership-contract.ts::aoAlterarMembership) escopa a revogação a CardGrant + CardResponsavel.
SELECTED: seguir o contrato materializado — revogar CardGrant + remover CardResponsavel; NÃO
  revogar fisicamente PipeGrant/DatabaseGrant.
RATIONALE: (1) o deny-by-default por releitura de Membership ACTIVE já torna Pipe/Database
  inalcançáveis enquanto suspenso — a autorização fina desses domínios só é avaliada APÓS a
  resolução de contexto, que falha para SUSPENDED; (2) AD-11 proíbe inventar regra sem
  consumidor concreto — o contrato puro é o SSOT e deliberadamente os exclui; (3) revogar
  Pipe/Database exigiria decidir semântica de reativação que a spec não fixa. Menor mudança correta.
SCOPE_IMPACT: NONE (dentro do MVP; não amplia contrato de dados)
REVERSIBILITY: HIGH (aditivo; revogar mais entidades depois é um novo plano)
NEXT_ACTION: implementar consumindo aoAlterarMembership; registrar DEB-8-5-PIPE-DB-GRANT-REVOKE.
```

## Riscos e mitigação

- **TOCTOU do último Admin** → `SELECT FOR UPDATE` + recontagem in-tx (prova concorrente).
- **`ALTER TYPE ADD VALUE`** não pode ser usado na mesma tx que o adiciona (PG); a migration só
  ADiciona (não usa) — seguro. Rollback = remover o `AND` no schema + `db:rollback` (drill).
- **Sessão viva** → invalidar cache + limpar `activeOrganizationId`; deny-by-default garante o resto.
- **PII** → payload só metadados; auditoria só nomes/ids.
