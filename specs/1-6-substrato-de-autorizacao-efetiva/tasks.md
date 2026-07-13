# Tasks — Story 1.6: Substrato de autorização efetiva

> Derivado de `plan.md` (P1–P6) e `spec.md` (FR/SC). Ordem = sequência red-green do plan.
> `[ ]` pendente · `[x]` concluído com evidência real (Constitution X).

## Fase 0 — Gates pré-código (bloqueiam implementação)

- [x] T001 — `pre-implementation-check`: gate de Arquitetura RESOLVIDO; `@casl/ability` 7.0.1 fixada;
  relatório em `gates/1-6/pre-implementation-check.md` (APROVADO).
- [x] T002 — `context7-check` do CASL 7.0.1; `gates/1-6/context7-check.md` (APROVADO).

## Fase 1 — Contrato e principal (P1, P2)

- [x] T003 — `kernel/authz/ability.ts`: tipos `AcaoAutorizada`, `SujeitoAutorizado`, `Organizacao`,
  `AppAbility`. (FR-601)
- [x] T004 — `ContextoOrganizacional` e `OrgContextResolver` expõem o `papel` (`MembershipRole`) da
  Membership ativa resolvida — lido do banco no contexto da 1.3, sem token. (FR-602, FR-606)

## Fase 2 — Factory de abilities (P3)

- [x] T005 — `ability.factory.ts`: `(papel, orgId) → AppAbility`; conditions `{ id: orgId }`. (FR-601, FR-602)
- [x] T006 — Membership não-ativa negada no resolvedor (org-context.test.ts, PostgreSQL real); factory
  só recebe papel ativo. (FR-603)
- [x] T007 — Nenhum ramo concede abilities de Org a papel de Plataforma (garantido por tipo + teste). (FR-604)
- [x] T008 — Teste SC-601 deny-by-default: subject sem regra ⇒ negado; fase vermelha em mutation-evidence. (FR-601)

## Fase 3 — Ponto de aplicação (P4)

- [x] T009 — `authz.guard.ts` (`CanActivate`, APP_GUARD) + `@Requer(acao, sujeito)`; 403 sem ability;
  assume contexto de Org resolvido. Rota real `/organizations/current` protegida por `@Requer('ler',...)`. (FR-605)
- [x] T010 — Teste SC-605 (authz.test.ts): 403 em ação sem ability; permissão em ação com ability. (FR-605)
- [x] T011 — SC-602: ADMIN na Org C não alcança a Org A (sem herança). (FR-602)

## Fase 4 — Cache e invalidação (P5)

- [x] T012 — `ability.cache.ts`: cache por `(accountId, orgId)` + porta `invalidar` (contrato do Épico 8). (FR-607)
- [x] T013 — Teste SC-606: após invalidação, a próxima checagem reflete o novo papel. (FR-607, AC4)
- [x] T014 — Mutação da invalidação embutida no teste + `gates/1-6/mutation-evidence.md`. (FR-607)

## Fase 5 — Observabilidade e SC restantes (P6)

- [x] T015 — Log `authz.denied` (Pino) sem recurso/PII. Teste SC-608. (FR-608)
- [x] T016 — Teste SC-607: ability é função pura de (papel, orgId); permissão derivada, não em token. (FR-606)

## Fase 6 — Conclusão

- [x] T017 — `security-check` e `observability-check` — `gates/1-6/` (ambos APROVADOS).
- [x] T018 — Gates de qualidade reexecutados: typecheck ✅, format ✅, lint ✅, API 218/218, Web 33/33, build ✅.
- [ ] T019 — Atualizar Dev Agent Record, File List e Change Log da Story; `commit-check` → commit.
