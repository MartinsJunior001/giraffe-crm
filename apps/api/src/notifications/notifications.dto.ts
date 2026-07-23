import type { NotificationAvailability } from '../../generated/prisma';

/**
 * Contratos de entrada/saída da fonte única de Notificações (Story 5.3). `orgId`/`organizationId` e a
 * `dedupeKey` (interna) ficam SEMPRE fora da fronteira de saída; o `orgId` nunca vem do cliente (é do
 * contexto). Ver `notifications.service.ts`.
 */

/** Um destinatário JÁ RESOLVIDO pelo produtor (a resolução de papéis→pessoas é do produtor, 5.6/5.7/E8). */
export interface DestinatarioResolvido {
  /** A pessoa NA Org (Membership). É a identidade que colapsa múltiplos papéis (dedupe). */
  membershipId: string;
  /** A `Account` global da pessoa (referência-por-id). */
  userId: string;
}

/**
 * O "evento notificável" — a entrada da fonte única. O produtor (contrato-futuro 5.6/5.7/E8) descreve O QUE
 * aconteceu por REFERÊNCIA (ids), não por conteúdo: `sourceEventId` (Evento de origem, idempotência),
 * `resourceType`/`resourceId` (recurso — a Notificação NUNCA concede acesso), `actorId` (iniciador) e
 * `params` (bruto — o serviço SANITIZA). `type`/`typeVersion` identificam o tipo (catálogo = 5.6).
 */
export interface EventoNotificavel {
  type: string;
  typeVersion?: number;
  sourceEventId: string;
  resourceType: string;
  resourceId?: string | null;
  actorId?: string | null;
  occurredAt?: Date;
  /** Parâmetros de renderização BRUTOS — sanitizados (allowlist estrutural) antes de persistir. */
  params?: unknown;
  /** Destinatários já resolvidos. Colapsados por `membershipId` (múltiplos papéis -> 1 pessoa). */
  recipients: DestinatarioResolvido[];
}

/** A Notificação (conteúdo/evento canônico) como sai pela API interna. `orgId` FORA da fronteira. */
export interface NotificationView {
  id: string;
  type: string;
  typeVersion: number;
  sourceEventId: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string | null;
  occurredAt: Date;
  params: unknown;
}

/** O estado de leitura de UM destinatário. `orgId`/`dedupeKey` FORA da fronteira; `lida` é DERIVADO. */
export interface NotificationRecipientView {
  id: string;
  notificationId: string;
  recipientMembershipId: string;
  recipientUserId: string;
  readAt: Date | null;
  /** DERIVADO de `readAt` (não é coluna). */
  lida: boolean;
  deliveredAt: Date;
  availabilityState: NotificationAvailability;
}

/** Resultado de `registrarNotificacao`: a Notificação + quantos destinatários foram materializados. */
export interface NotificacaoRegistrada {
  notificacao: NotificationView;
  /** Nº de `NotificationRecipient` efetivamente inseridos nesta chamada (0 no reprocesso idempotente). */
  destinatariosCriados: number;
}
