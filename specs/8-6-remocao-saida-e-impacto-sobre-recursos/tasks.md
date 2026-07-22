# Tasks — Story 8.6

- [x] T1 · context7-check (Prisma 6.19.3 migrations/enum/tx; Better Auth 1.6.23; NestJS 11) — gates/8-6/context7-check.md
- [x] T2 · pre-implementation-check — gates/8-6/pre-implementation-check.md
- [x] T3 · núcleo puro `membership-removal.core.ts` + `membership-removal-core.test.ts`
- [x] T4 · serviço `membership-removal.service.ts` (remover + sair → encerrar; lock+recount; revogações; evento; guarda otimista)
- [x] T5 · rotas `members.controller.ts` (`me/leave` 200; `:id/remove` 200) + registro no módulo
- [x] T6 · schema `MembershipEventType += REMOVED` + migration (ADD VALUE + REVOKE DELETE em Membership)
- [x] T7 · `membership-removal-rls.test.ts` — REVOKE DELETE (permission denied) + imutabilidade do evento REMOVED
- [x] T8 · `membership-removal-http.test.ts` — remoção, saída, step-up, último Admin (concorrência), deny-by-default, isolamento, idempotência, impacto sobre recursos
- [x] T9 · reconciliar `rls.test.ts` / `rls-observability.test.ts` ao novo invariante (faxina por migrator; DELETE cruzado = permission denied)
- [x] T10 · `prisma generate` + `db:migrate` + `db:seed` no banco descartável (porta 5442) — OK
- [x] T11 · gates: security-check, observability-check, migration-check (drill+rollback), lgpd-check, red-phase (fases vermelhas c/d EXECUTADAS: vermelho→verde)
- [x] T12 · lint (0) · typecheck (0) · test API serial (136 arquivos / 1247 testes / 100% verdes) · build API (0)
- [ ] T13 · commit-check → commit → push → PR (CI verde é o gate final no PR)
