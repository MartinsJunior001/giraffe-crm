# Tasks — Story 5.3

- [ ] T01 — schema.prisma: `enum NotificationAvailability` + `model Notification` + `model
  NotificationRecipient` + relações em `Organization`.
- [ ] T02 — Migration `20260801120000_notifications/migration.sql` (enum, tabelas, índices, FK, RLS+FORCE,
  policies, GRANT column-scoped, sem DELETE).
- [ ] T03 — Rollback `20260801120000_notifications.down.sql`.
- [ ] T04 — `notification-content.core.ts` (sanitização pura + `estaLida` + validadores).
- [ ] T05 — `notification-content.core.test.ts` (injeção `<script>`, allowlist/prototype-pollution, derivado).
- [ ] T06 — `notifications.dto.ts` (tipos de entrada + views; `orgId`/`dedupeKey` fora).
- [ ] T07 — `notifications.service.ts` (`registrarNotificacao` idempotente + sanitizado; `marcarComoLida`).
- [ ] T08 — `notifications.module.ts` (provê+exporta serviço).
- [ ] T09 — Wiring: `MODELOS_AUDITADOS` (2 entidades) + `AppModule` importa `NotificationsModule`.
- [ ] T10 — `db:migrate` no banco de teste (5439) + rollback drill.
- [ ] T11 — `notifications-rls.test.ts` (isolamento/GRANT/fase vermelha).
- [ ] T12 — `notifications-write.test.ts` (AC1/AC2/AC4 + readAt + isolamento).
- [ ] T13 — Gates: prettier/lint/typecheck/build + `pnpm --filter @giraffe/api test` verde.
- [ ] T14 — commit-check → commit → push → PR.
