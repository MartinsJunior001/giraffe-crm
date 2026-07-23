import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesService } from './read/notification-preferences.service';
import { NotificationsReadService } from './read/notifications-read.service';

/**
 * Módulo de Notificações (Épico 5). A 5.3 proveu `NotificationsService` — a ÚNICA fonte de escrita (write-side:
 * `registrarNotificacao`, `marcarComoLida`, e desde a 5.4 `marcarTodasComoLidas`), consumida pelos PRODUTORES de
 * sistema (contrato-futuro 5.6/5.7/E8).
 *
 * A 5.4 acrescenta as SUPERFÍCIES (leitura): `NotificationsController` (badge/popover/página + marcar-lido +
 * preferências), `NotificationsReadService` (superfícies + contagem no servidor + revalidação de acesso por
 * `resourceType`) e `NotificationPreferencesService` (preferências por tipo do próprio usuário). A revalidação
 * reusa as guardas finas PURAS de `pipe-authz`/`database-authz` (sem ciclo de módulo — são funções, não
 * providers) e o `ability.ts`/guard (C3) permanece congelado (a guarda GROSSA é `@Requer('ler','Organizacao')`,
 * o piso). Depende do contexto de Organização e do Prisma (globais via `ContextModule`/`DbModule`).
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsReadService, NotificationPreferencesService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
