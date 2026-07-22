import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { ConviteAceitoEvento, InviteAcceptedNotificationPort } from './notification.port';

/**
 * Adapter de LOG da porta de Notificação "convite aceito" (Story 8.3), enquanto o write-side de E5/5.6
 * não existe. Ele **registra o contrato emitido** de forma estruturada e observável — e é honesto: NÃO
 * afirma entrega, apenas que o evento foi registrado para a fonte única resolver quando existir. Sem
 * token, sem e-mail completo, sem dados sensíveis. Débito de planejamento: `DEB-8-3-NOTIF-WRITE-SIDE`.
 *
 * NÃO é um fallback silencioso: o `event` deixa claro que a entrega é diferida a E5. Trocar por um
 * adapter real de 5.6 (mesma porta) é aditivo e não toca o aceite.
 */
@Injectable()
export class LogInviteAcceptedNotificationAdapter implements InviteAcceptedNotificationPort {
  constructor(private readonly logger: PinoLogger) {}

  registrarConviteAceito(evento: ConviteAceitoEvento): Promise<void> {
    this.logger.info(
      {
        event: 'notification.convite_aceito.registrada',
        // Só identificadores — a fonte única (E5/5.6) resolve destinatários/preferências.
        orgId: evento.orgId,
        inviteId: evento.inviteId,
        membershipId: evento.membershipId,
        destinatarioAccountId: evento.destinatarioAccountId,
        role: evento.role,
        entrega: 'diferida-a-e5-5.6', // contrato registrado; entrega NÃO acontece aqui.
      },
      'notificação "convite aceito" registrada pelo contrato (entrega diferida a E5/5.6)',
    );
    return Promise.resolve();
  }
}
