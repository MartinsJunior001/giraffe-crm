import type { SinalInvalidacao } from './realtime-signal.core';

/**
 * Port do tempo real (Story 5.5) — a fronteira entre os PRODUTORES do sinal (a fonte única 5.3, os
 * serviços de Membership 8.5/8.6, a troca de Org 1.9) e o transporte concreto (Socket.IO). Existe
 * para que o write-side NÃO importe Socket.IO: quem emite/rev­oga fala com esta interface, o
 * `NotificationsGateway` a implementa, e ambos são desacoplados (testável, degradável, sem ciclo).
 *
 * Toda operação é **best-effort e fault-isolated**: o tempo real é otimização de latência sobre a
 * fonte canônica (banco). Uma falha aqui NUNCA pode derrubar a escrita da Notificação nem a transição
 * de Membership — a app funciona 100% sem o socket (degradação graciosa, AC4).
 */
export interface NotificationRealtimePort {
  /**
   * Emite o SINAL de invalidação (não o conteúdo) ao canal `(userId, orgId)` de cada destinatário.
   * Chamado APÓS o commit da Notificação (5.3). Coalescido por sala (backpressure). Nada sensível
   * trafega — só `SinalInvalidacao` (`id`+`at`).
   */
  notificarDestinatarios(orgId: string, userIds: readonly string[], sinal: SinalInvalidacao): void;

  /**
   * Revoga o canal `(userId, orgId)`: encerra as inscrições anteriores (desconecta os sockets da
   * sala). Chamado por suspensão/remoção de Membership (8.5/8.6) e troca de Organização ativa (1.9).
   */
  revogarCanal(orgId: string, userId: string): void;
}

/** Token de injeção do port (provido pelo `RealtimeModule`, global). */
export const NOTIFICATION_REALTIME = Symbol('NotificationRealtimePort');
