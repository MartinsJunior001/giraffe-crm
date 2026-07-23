import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../kernel/db/tenant-context';
import {
  chaveDeduplicacao,
  estaLida,
  resourceTypeValido,
  sanitizarParametros,
  tipoValido,
  uuidValido,
} from './notification-content.core';
import type {
  EventoNotificavel,
  NotificacaoRegistrada,
  NotificationRecipientView,
  NotificationView,
} from './notifications.dto';

type Db = ReturnType<typeof withTenantContext>;

const SELECT_NOTIFICATION = {
  id: true,
  type: true,
  typeVersion: true,
  sourceEventId: true,
  resourceType: true,
  resourceId: true,
  actorId: true,
  occurredAt: true,
  params: true,
} as const;

const SELECT_RECIPIENT = {
  id: true,
  notificationId: true,
  recipientMembershipId: true,
  recipientUserId: true,
  readAt: true,
  deliveredAt: true,
  availabilityState: true,
} as const;

/** Conflito de concorrência (-> 409): P2002/P2028 da tx interativa sob contenção. */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Fonte ÚNICA de escrita de Notificações (Story 5.3) — o único ponto que grava `Notification` (conteúdo/
 * evento canônico, APPEND-ONLY) e `NotificationRecipient` (estado de leitura por destinatário, MUTÁVEL). Base
 * do INV-NOTIF-01. Não há rota HTTP de CRIAÇÃO (criar é ato de PRODUTOR de sistema — 5.6/5.7/E8, contrato-
 * futuro AD-11); a LEITURA/superfícies/contagem/"marcar todas"/revalidação-de-acesso são a 5.4.
 *
 * Toda query passa por `withTenantContext`/`definirContextoOrg` — nenhum `where orgId` manual; `orgId` nunca
 * vem do cliente. Padrões reusados da base: tx interativa no client raiz (o `withTenantContext` recusa
 * `$transaction`), sanitização fail-closed (núcleo puro), idempotência por índice único, auditoria manual
 * (FR-214). Guard/`ability.ts` (C3) intocado.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  // ─────────────────────────────────────────────────── REGISTRAR (write) ──

  /**
   * Grava, de forma IDEMPOTENTE e SANITIZADA, o conteúdo canônico (uma vez, imutável) + N registros de
   * destinatário na MESMA transação. Reprocessar o mesmo Evento -> no-op (conteúdo congelado, sem
   * duplicidade); múltiplos papéis -> mesma pessoa colapsam pela `dedupeKey`. Nunca 500 em conflito.
   */
  async registrarNotificacao(evento: EventoNotificavel): Promise<NotificacaoRegistrada> {
    const { contexto } = this.db();

    // 1) Validação/sanitização fail-closed (contrato do produtor).
    if (!tipoValido(evento.type)) throw new BadRequestException('tipo de Notificação inválido');
    if (!resourceTypeValido(evento.resourceType)) {
      throw new BadRequestException('resourceType inválido');
    }
    if (!uuidValido(evento.sourceEventId)) throw new BadRequestException('sourceEventId inválido');
    if (evento.resourceId != null && !uuidValido(evento.resourceId)) {
      throw new BadRequestException('resourceId inválido');
    }
    if (evento.actorId != null && !uuidValido(evento.actorId)) {
      throw new BadRequestException('actorId inválido');
    }
    if (!Array.isArray(evento.recipients) || evento.recipients.length === 0) {
      throw new BadRequestException('a Notificação exige ao menos um destinatário');
    }
    const typeVersion = evento.typeVersion ?? 1;
    if (!Number.isInteger(typeVersion) || typeVersion < 1) {
      throw new BadRequestException('typeVersion inválido');
    }
    const params = sanitizarParametros(evento.params);

    // 2) Colapsa destinatários por Membership (múltiplos papéis -> 1 pessoa) e computa a dedupeKey.
    const porMembership = new Map<
      string,
      { membershipId: string; userId: string; dedupeKey: string }
    >();
    for (const r of evento.recipients) {
      if (!uuidValido(r.membershipId) || !uuidValido(r.userId)) {
        throw new BadRequestException('destinatário inválido');
      }
      if (!porMembership.has(r.membershipId)) {
        porMembership.set(r.membershipId, {
          membershipId: r.membershipId,
          userId: r.userId,
          dedupeKey: chaveDeduplicacao(evento.sourceEventId, evento.type, r.membershipId),
        });
      }
    }
    const destinatarios = [...porMembership.values()];

    const novoId = randomUUID();
    let resultado: NotificacaoRegistrada;
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Conteúdo idempotente: reprocesso/concorrência -> no-op (ON CONFLICT DO NOTHING); NUNCA sobrescreve
        // o congelado. Não usa RETURNING (createMany), então relemos o id canônico logo abaixo.
        await tx.notification.createMany({
          data: [
            {
              id: novoId,
              orgId: contexto.orgId,
              type: evento.type,
              typeVersion,
              sourceEventId: evento.sourceEventId,
              resourceType: evento.resourceType,
              resourceId: evento.resourceId ?? null,
              actorId: evento.actorId ?? null,
              ...(evento.occurredAt ? { occurredAt: evento.occurredAt } : {}),
              params: params as Prisma.InputJsonValue,
            },
          ],
          skipDuplicates: true,
        });

        // Id CANÔNICO por (orgId, sourceEventId, type) — resolve a corrida (quem ganhou o INSERT).
        const canonica = await tx.notification.findFirstOrThrow({
          where: { sourceEventId: evento.sourceEventId, type: evento.type },
          select: SELECT_NOTIFICATION,
        });

        // Destinatários idempotentes: a `dedupeKey` única colapsa reprocesso e múltiplos papéis.
        const { count } = await tx.notificationRecipient.createMany({
          data: destinatarios.map((d) => ({
            orgId: contexto.orgId,
            notificationId: canonica.id,
            recipientMembershipId: d.membershipId,
            recipientUserId: d.userId,
            dedupeKey: d.dedupeKey,
          })),
          skipDuplicates: true,
        });

        return { notificacao: this.mapNotification(canonica), destinatariosCriados: count };
      });
    } catch (err) {
      if (isConflito(err)) {
        // Idempotente sob corrida remanescente: releia e devolva (nunca 500).
        return this.relerRegistrada(evento.sourceEventId, evento.type);
      }
      throw err;
    }

    if (resultado.destinatariosCriados > 0) {
      this.auditar(contexto, 'create', 'NotificationRecipient');
    }
    this.auditar(contexto, 'create', 'Notification');
    return resultado;
  }

  /** Releitura idempotente do conteúdo já gravado (caminho de conflito remanescente). */
  private async relerRegistrada(
    sourceEventId: string,
    type: string,
  ): Promise<NotificacaoRegistrada> {
    const { db } = this.db();
    const n = await db.notification.findFirst({
      where: { sourceEventId, type },
      select: SELECT_NOTIFICATION,
    });
    if (!n) throw new ConflictException('conflito ao registrar a Notificação; repita');
    return { notificacao: this.mapNotification(n), destinatariosCriados: 0 };
  }

  // ────────────────────────────────────────────────────── MARCAR COMO LIDA ──

  /**
   * Marca o registro do destinatário como LIDO (persiste `readAt`), idempotente e auditável. É write-side de
   * SERVIÇO — a ROTA HTTP + contagem-no-servidor + "marcar todas" (cursor) são a 5.4. O chamador (rota 5.4)
   * é responsável por passar o `recipientMembershipId` do PRINCIPAL autenticado (a pessoa marca a PRÓPRIA
   * Notificação); a query mira exatamente `(notificationId, recipientMembershipId)` sob RLS.
   */
  async marcarComoLida(
    notificationId: string,
    recipientMembershipId: string,
  ): Promise<NotificationRecipientView> {
    const { contexto, db } = this.db();

    const atual = await db.notificationRecipient.findFirst({
      where: { notificationId, recipientMembershipId },
      select: SELECT_RECIPIENT,
    });
    if (!atual) throw new NotFoundException(); // inexistente/cross-tenant -> 404 não-enumerante

    // Idempotente: já lido -> sem escrita (evita falso `denied` na auditoria).
    if (atual.readAt !== null) return this.mapRecipient(atual);

    let atualizado: NotificationRecipientView | null;
    try {
      atualizado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        // Guarda otimista: só marca se ainda está NÃO-LIDO (UPDATE column-scoped em `readAt`).
        const { count } = await tx.notificationRecipient.updateMany({
          where: { id: atual.id, readAt: null },
          data: { readAt: new Date() },
        });
        if (count === 0) return null;
        const lido = await tx.notificationRecipient.findUniqueOrThrow({
          where: { id: atual.id },
          select: SELECT_RECIPIENT,
        });
        return this.mapRecipient(lido);
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('marcação concorrente; reconsulte e repita');
      throw err;
    }

    // Perdeu a corrida (outro marcou primeiro) -> reconsulta idempotente.
    if (!atualizado) {
      const agora = await db.notificationRecipient.findUnique({
        where: { id: atual.id },
        select: SELECT_RECIPIENT,
      });
      if (agora) return this.mapRecipient(agora);
      throw new ConflictException('o estado da Notificação mudou concorrentemente; repita');
    }
    this.auditar(contexto, 'update', 'NotificationRecipient');
    return atualizado;
  }

  // ─────────────────────────────────────────────────────────────── HELPERS ──

  private mapNotification(n: {
    id: string;
    type: string;
    typeVersion: number;
    sourceEventId: string;
    resourceType: string;
    resourceId: string | null;
    actorId: string | null;
    occurredAt: Date;
    params: unknown;
  }): NotificationView {
    return {
      id: n.id,
      type: n.type,
      typeVersion: n.typeVersion,
      sourceEventId: n.sourceEventId,
      resourceType: n.resourceType,
      resourceId: n.resourceId,
      actorId: n.actorId,
      occurredAt: n.occurredAt,
      params: n.params,
    };
  }

  private mapRecipient(r: {
    id: string;
    notificationId: string;
    recipientMembershipId: string;
    recipientUserId: string;
    readAt: Date | null;
    deliveredAt: Date;
    availabilityState: NotificationRecipientView['availabilityState'];
  }): NotificationRecipientView {
    return {
      id: r.id,
      notificationId: r.notificationId,
      recipientMembershipId: r.recipientMembershipId,
      recipientUserId: r.recipientUserId,
      readAt: r.readAt,
      lida: estaLida(r.readAt),
      deliveredAt: r.deliveredAt,
      availabilityState: r.availabilityState,
    };
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca PII/params. */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId,
        orgId: contexto.orgId,
        action,
        resource,
        result: 'allowed',
        at: new Date().toISOString(),
      },
      'auditoria',
    );
  }
}
