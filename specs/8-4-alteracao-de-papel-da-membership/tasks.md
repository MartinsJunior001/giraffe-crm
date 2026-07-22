# Tarefas — Story 8.4 (ordem de dependência)

- [x] T1 Schema: enum `MembershipEventType` + model `MembershipEvent` (append-only) + relações Org/Membership.
- [x] T2 Migration `20260723120000_membership_events`: CREATE TYPE/TABLE + índices + FKs + RLS ENABLE/FORCE +
  policies select/insert/update/delete + `GRANT SELECT, INSERT` (sem UPDATE/DELETE).
- [x] T3 `MembershipEvent` em `MODELOS_AUDITADOS` (tenant-context).
- [x] T4 Núcleo puro `membership-role.core.ts`: `exigeStepUp`, `reduzQuantidadeDeAdmin`,
  `planejarAlteracaoPapel`, `planejarRevogacaoIncompativel`, `derivarEventId` (uuidv5).
- [x] T5 DTO `membership-role.dto.ts` (allowlist `role`, UUID de rota).
- [x] T6 Serviço `membership-role.service.ts`: autoridade fina + step-up + tx interativa (FOR UPDATE,
  reléitura, guarda otimista, revogação AD-9, evento, auditoria manual) + invalidação de ability.
- [x] T7 Controller `members.controller.ts` (`PATCH .../role`, guard `administrar Organizacao`).
- [x] T8 Wiring em `OrganizationsModule`.
- [x] T9 Testes: core (unidade), http (integração real, inclui **concorrência**), events-rls (GRANT/RLS append-only).
- [ ] T10 Gates: pre-implementation-check, context7-check, security-check, observability-check, migration-check.
- [ ] T11 lint + typecheck + test (API) + build verdes.
- [ ] T12 commit-check → commit → PR.
