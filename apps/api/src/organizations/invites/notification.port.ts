import type { MembershipRole } from '../../../generated/prisma';

/**
 * Porta da Notificação "convite aceito" (Story 8.3) — CONTRATO consumido, não implementação.
 *
 * O epics manda registrar o tipo `convite aceito` pela **fonte única de Notificações de E5** (FR-29,
 * INV-NOTIF-01). O write-side completo de E5/5.6 (catálogo, destinatários, preferências, badge/popover)
 * está em BACKLOG. Para não criar dependência circular nem duplicar o mecanismo, a 8.3 depende **desta
 * porta**: o aceite emite o evento pela porta; QUEM entrega é E5 quando existir. O adapter atual é de
 * LOG (observável) — ele NÃO finge entrega. Trocar por um adapter real de 5.6 é aditivo.
 *
 * **Nunca** carrega token, e-mail completo nem dados sensíveis: só os identificadores necessários para
 * que a fonte única resolva destinatários/preferências (Membership/Org), idempotente por Convite.
 */
export const INVITE_ACCEPTED_NOTIFICATION_PORT = Symbol('INVITE_ACCEPTED_NOTIFICATION_PORT');

export interface ConviteAceitoEvento {
  readonly orgId: string;
  readonly inviteId: string;
  readonly membershipId: string;
  readonly destinatarioAccountId: string;
  readonly role: MembershipRole;
}

export interface InviteAcceptedNotificationPort {
  /**
   * Registra o evento `convite aceito` pela fonte única. Idempotente por Convite (o serviço só chama no
   * PRIMEIRO consumo). Falha aqui NÃO desfaz o aceite (já commitado) — é observável e recuperável.
   */
  registrarConviteAceito(evento: ConviteAceitoEvento): Promise<void>;
}
