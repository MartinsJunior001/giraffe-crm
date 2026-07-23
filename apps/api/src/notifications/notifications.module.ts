import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Módulo da fonte única de Notificações (Épico 5, Story 5.3). Provê e EXPORTA `NotificationsService` — o
 * ÚNICO ponto de escrita de Notificação (write-side), a ser consumido pelos PRODUTORES de sistema
 * (contrato-futuro 5.6/5.7/E8) e pela superfície de leitura (5.4). Entidade DISTINTA (não reusa Card/Task/
 * Solicitação). Não expõe controller: criar Notificação é ato de sistema (sem rota de cliente), e a
 * leitura/marcar-lido-via-HTTP/contagem são a 5.4. Depende do contexto de Organização e do Prisma (globais
 * via `ContextModule`/`DbModule`).
 *
 * O consumidor concreto que evita "módulo vazio" (Constitution — sem abstração especulativa) é o próprio
 * serviço de escrita, testado ponta-a-ponta (`notifications-write`): idempotência, sanitização, `readAt` e
 * isolamento provados contra PostgreSQL real.
 */
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
