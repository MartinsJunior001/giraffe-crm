# Tasks — Story 8.5 (dependency-ordered)

- [ ] T01 — schema: `MembershipEventType += SUSPENDED, REACTIVATED` (+ doc do enum).
- [ ] T02 — migration `20260724120000_membership_state_events` (`ALTER TYPE ADD VALUE` x2). Drill+rollback.
- [ ] T03 — núcleo puro `membership-state.core.ts` (`planejarTransicaoEstado`, tipos, `derivarEventId` reusado da 8.4 core).
- [ ] T04 — testes de unidade do núcleo `membership-state-core.test.ts` (todas as ramificações fail-closed).
- [ ] T05 — serviço `membership-state.service.ts` (suspender/reativar; tx interativa; preflight; evento; invalidação; limpeza de sessão).
- [ ] T06 — controller: rotas `POST :id/suspend` e `POST :id/reactivate`.
- [ ] T07 — módulo: registra `MembershipStateService`.
- [ ] T08 — teste HTTP integração `membership-state-http.test.ts` (AC1–AC4 + autz/isolamento/validação + concorrência do último Admin + deny-by-default próxima requisição + activeOrganizationId limpo + CardGrant/CardResponsavel revogados e não restaurados).
- [ ] T09 — red-phase provada (FOR UPDATE; guarda otimista) → `gates/8-5/red-phase.md`.
- [ ] T10 — gates: pre-implementation-check, security-check, observability-check, migration-check, lgpd-check → `gates/8-5/`.
- [ ] T11 — lint/typecheck/test(API)/build; commit-check; commits atômicos; PR.

## Analyze (consistência cruzada)

- spec ↔ plan ↔ tasks coerentes: eixo estado, não papel; reusa 8.4; migration mínima.
- Sem ambiguidade material que exija `clarify` (D-1..D-4 fixadas; único ponto aberto — escopo
  Pipe/Database — resolvido por AUTONOMOUS_DECISION + DEB registrado).
- Invariantes preservados: isolamento por RLS; `Card ≠ Registro`; append-only do evento; deny-by-default.
