import { Global, Module } from '@nestjs/common';
import { NOTIFICATION_REALTIME } from './notification-realtime.port';
import { NotificationsGateway } from './notifications.gateway';

/**
 * Módulo do tempo real (Story 5.5). `@Global` porque os PRODUTORES do sinal vivem em módulos distintos
 * — a fonte única (5.3, `NotificationsModule`), o ciclo de Membership (8.5/8.6,
 * `OrganizationsModule`) e a troca de Org (1.9, `ContextModule`) — e todos injetam a MESMA
 * `NotificationRealtimePort` por token, sem acoplar-se ao Socket.IO nem criar ciclo de módulo.
 *
 * `useExisting` liga o token ao MESMO singleton que o Nest registra como Gateway: uma só instância é o
 * transporte (gateway) e a implementação da port. O gateway depende só de providers globais
 * (`PRINCIPAL_PROVIDER`, `OrgContextResolver`, `PinoLogger`) — este módulo não importa nada.
 */
@Global()
@Module({
  providers: [
    NotificationsGateway,
    { provide: NOTIFICATION_REALTIME, useExisting: NotificationsGateway },
  ],
  exports: [NOTIFICATION_REALTIME, NotificationsGateway],
})
export class RealtimeModule {}
