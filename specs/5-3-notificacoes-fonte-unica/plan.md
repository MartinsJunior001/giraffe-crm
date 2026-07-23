# Plan — Story 5.3

## Stack / documental (context7)
Prisma 6.19.3, NestJS 11, PostgreSQL 16 — idêntico a 5.1/5.2. Primitivos **já validados** e reusados:
índice único (composto/simples), RLS/GRANT/FORCE por raw SQL na migration, tx interativa no client raiz com
`definirContextoOrg`, `createMany({ skipDuplicates })` (`ON CONFLICT DO NOTHING`), guarda otimista via
`updateMany`. **Nenhuma API nova de biblioteca** — nada a reconferir além do baseline.

## Artefatos de código
1. **schema.prisma:** `enum NotificationAvailability`; `model Notification`; `model NotificationRecipient`;
   relações em `Organization` (`notifications`, `notificationRecipients`).
2. **Migration** `20260801120000_notifications/migration.sql` (slot livre; última é `..._solicitacoes`):
   enum + 2 tabelas + índices (`@@unique([orgId,id])`, `@@unique([orgId,sourceEventId,type])`,
   `@@unique([orgId,dedupeKey])`, 2 índices de recipient) + FK (Organization Cascade; FK composta
   `(orgId,notificationId)→Notification`) + RLS ENABLE/FORCE + policies + GRANT (Notification SELECT/INSERT;
   Recipient SELECT/INSERT + UPDATE column-scoped; sem DELETE em nenhuma).
3. **Rollback** `prisma/rollback/20260801120000_notifications.down.sql` (DROP filho→pai→enum).
4. **`src/notifications/notification-content.core.ts`** — núcleo puro (sanitização + `estaLida`).
5. **`src/notifications/notifications.dto.ts`** — `EventoNotificavel`, `DestinatarioResolvido`,
   `NotificationView`, `NotificationRecipientView`, `NotificacaoRegistrada`.
6. **`src/notifications/notifications.service.ts`** — `registrarNotificacao` + `marcarComoLida`.
7. **`src/notifications/notifications.module.ts`** — provê e **exporta** `NotificationsService`.
8. **tenant-context.ts** — `Notification`, `NotificationRecipient` em `MODELOS_AUDITADOS`.
9. **app.module.ts** — registrar `NotificationsModule`.

## Testes (PG real)
- `notification-content.core.test.ts` (unidade pura): escape HTML/`<script>`; allowlist estrutural
  (prototype-pollution, escalares, tetos); `estaLida` derivado; validadores.
- `notifications-rls.test.ts` (RLS/GRANT, fase vermelha): isolamento por Org; WITH CHECK INSERT; FK composta;
  `Notification` append-only (sem UPDATE/DELETE); `NotificationRecipient` UPDATE column-scoped
  (readAt/availabilityState OK; notificationId/recipient*/orgId/dedupeKey → permission denied; sem DELETE).
- `notifications-write.test.ts` (serviço E2E): AC1 (grava 1 conteúdo + N recipients, readAt derivado);
  AC2 (reprocesso + multi-papel → sem duplicidade); AC4 (params `<script>` persistido escapado; sem
  token/URL); `marcarComoLida` idempotente + `readAt`; isolamento (contexto Org C).

## Gates
prettier/lint/typecheck/build; `db:migrate` + rollback drill; `pnpm --filter @giraffe/api test` verde
(incl. regressão da base). Corrigir todo BLOCKER/HIGH antes do PR.

## Ordem
schema → migration+rollback → `db:migrate` → core+testes core → service/dto/module → wiring
(tenant-context/app.module) → testes rls+write → gates → commit → PR.
