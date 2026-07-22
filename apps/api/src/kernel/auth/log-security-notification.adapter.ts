import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { SecurityNotificationPort, SenhaAlteradaEvento } from './security-notification.port';

/**
 * Adapter de LOG da notificação de segurança (Story 1.12).
 *
 * Enquanto o write-side de Notificações do titular (E5/1.13) não existe, este adapter registra o
 * evento de forma OBSERVÁVEL — ele não simula um e-mail enviado (isso seria evidência falsa). Um
 * operador vê no log que a notificação foi emitida; a entrega real chega quando E5 substituir este
 * provider (aditivo).
 *
 * Sanitizado por construção: só o `accountId` e o instante entram no log — nunca senha, hash, token
 * ou e-mail.
 */
@Injectable()
export class LogSecurityNotificationAdapter implements SecurityNotificationPort {
  constructor(private readonly logger: PinoLogger) {}

  notificarSeguranca(evento: SenhaAlteradaEvento): Promise<void> {
    this.logger.info(
      {
        event: 'security.notification',
        tipo: evento.tipo,
        accountId: evento.accountId,
        em: evento.em,
      },
      'notificação de segurança emitida',
    );
    return Promise.resolve();
  }
}
