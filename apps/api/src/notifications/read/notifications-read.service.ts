import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { estaLida } from '../notification-content.core';
import { NotificationsService } from '../notifications.service';
import type { NotificationRecipientView } from '../notifications.dto';
import {
  type ItemRevalidavel,
  type PrincipalAcesso,
  revalidarAcessos,
} from './notification-access.dispatcher';
import { tiposSilenciadosPara } from './notification-type-registry';
import type { ContagemVisao, NotificacaoVisao, PaginaNotificacoes } from './notifications-read.dto';

type Db = ReturnType<typeof withTenantContext>;

/** Teto rígido da página (NFR-3/4): nunca devolver a caixa inteira sem limite. */
const LIMITE_MAX = 100;
/** Tamanho do popover (subconjunto recente). */
const POPOVER_LIMITE = 10;
/** Teto da janela de contagem (D1): revalida no máximo CAP não-lidas; excedeu ⇒ `mais=true` (badge "99+"). */
const CAP_CONTAGEM = 100;

/** Allowlist de LEITURA — o registro do destinatário + o conteúdo canônico da Notificação (relação). */
const SELECT_ITEM = {
  id: true,
  readAt: true,
  deliveredAt: true,
  notification: {
    select: {
      id: true,
      type: true,
      typeVersion: true,
      resourceType: true,
      resourceId: true,
      actorId: true,
      occurredAt: true,
      params: true,
    },
  },
} as const;

type ItemBruto = {
  id: string;
  readAt: Date | null;
  deliveredAt: Date;
  notification: {
    id: string;
    type: string;
    typeVersion: number;
    resourceType: string;
    resourceId: string | null;
    actorId: string | null;
    occurredAt: Date;
    params: unknown;
  };
};

/**
 * Leitura das SUPERFÍCIES de Notificação (Story 5.4) — badge/popover/página derivados EXCLUSIVAMENTE da fonte
 * de 5.3 (INV-NOTIF-01). Read-side PURO (sem persistir, sem agendador; a revalidação e a contagem são derivadas
 * na leitura — coerente com Kanban 2.9 / trilha 4.8). **Sem GRANT novo** em `Notification`/`NotificationRecipient`
 * (reusa o `SELECT` da 5.3). Toda query por `withTenantContext`; `orgId` fora da fronteira.
 *
 * **Autorização:** a guarda GROSSA (`@Requer('ler','Organizacao')`) é o piso de qualquer Membership ativa; a
 * FINA é "são as MINHAS Notificações" — o `recipientMembershipId` é o da Membership do PRINCIPAL autenticado,
 * resolvido sob RLS a partir do `contexto.accountId` (NUNCA do cliente). Cada item exibido/contado passa pela
 * **revalidação de acesso ao recurso de origem** (`notification-access.dispatcher`): perdeu acesso ⇒ oculto e
 * fora da contagem — a Notificação NUNCA concede acesso.
 */
@Injectable()
export class NotificationsReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly write: NotificationsService,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** A Membership do principal na Org do contexto (sob RLS). É o `recipientMembershipId` — nunca do cliente. */
  private async membershipDoPrincipal(db: Db, contexto: ContextoOrganizacional): Promise<string> {
    const membership = await db.membership.findFirst({
      where: { accountId: contexto.accountId },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException(); // defensivo: guard já garante Membership ativa
    return membership.id;
  }

  private principal(contexto: ContextoOrganizacional): PrincipalAcesso {
    return { accountId: contexto.accountId, papel: contexto.papel };
  }

  /** Os tipos SILENCIADOS do usuário (preferência efetiva) — filtro `type NOT IN (...)` das superfícies/contagem. */
  private async tiposSilenciados(db: Db, membershipId: string): Promise<string[]> {
    const prefs = await db.notificationPreference.findMany({
      where: { membershipId },
      select: { type: true, enabled: true },
    });
    return tiposSilenciadosPara(new Map(prefs.map((p) => [p.type, p.enabled])));
  }

  private projetar(item: ItemBruto): NotificacaoVisao {
    const n = item.notification;
    return {
      id: n.id,
      type: n.type,
      typeVersion: n.typeVersion,
      resourceType: n.resourceType,
      resourceId: n.resourceId,
      actorId: n.actorId,
      occurredAt: n.occurredAt,
      params: n.params,
      readAt: item.readAt,
      lida: estaLida(item.readAt),
      deliveredAt: item.deliveredAt,
    };
  }

  /** Revalida a janela e devolve só os itens ACESSÍVEIS (inacessível é oculto — nunca placeholder). */
  private async filtrarAcessiveis(
    db: Db,
    contexto: ContextoOrganizacional,
    itens: ItemBruto[],
  ): Promise<ItemBruto[]> {
    if (itens.length === 0) return [];
    const revalidaveis: ItemRevalidavel[] = itens.map((it) => ({
      notificationId: it.notification.id,
      resourceType: it.notification.resourceType,
      resourceId: it.notification.resourceId,
    }));
    const acesso = await revalidarAcessos(db, this.principal(contexto), revalidaveis);
    return itens.filter((it) => acesso.get(it.notification.id) === true);
  }

  /** Filtro-base de tipos silenciados aplicável ao `where` (relação `notification.type`). */
  private filtroTipo(silenciados: string[]): object {
    return silenciados.length > 0 ? { notification: { type: { notIn: silenciados } } } : {};
  }

  /**
   * PÁGINA — o conjunto completo autorizado (§1594). Cursor determinístico `[createdAt, id]` DESC (mais recente
   * primeiro; teto 100). Revalida a janela FETCHADA e oculta inacessíveis; o `proximoCursor` avança pelo último
   * FETCHADO (não pelo último devolvido) — determinístico e sem pular linhas mesmo com ocultações (padrão 4.8).
   */
  async listar(
    cursor: string | null,
    limite: number,
    apenasNaoLidas: boolean,
  ): Promise<PaginaNotificacoes> {
    const { contexto, db } = this.ctx();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const silenciados = await this.tiposSilenciados(db, membershipId);

    const where = {
      recipientMembershipId: membershipId,
      availabilityState: 'AVAILABLE' as const,
      ...(apenasNaoLidas ? { readAt: null } : {}),
      ...this.filtroTipo(silenciados),
    };

    const take = Math.min(Math.max(limite, 1), LIMITE_MAX) + 1; // +1 para detectar próxima página
    const rows = (await db.notificationRecipient.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: SELECT_ITEM,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    })) as ItemBruto[];

    const temMais = rows.length === take;
    const janela = temMais ? rows.slice(0, take - 1) : rows;
    const proximoCursor = temMais ? (janela[janela.length - 1]?.id ?? null) : null;

    const acessiveis = await this.filtrarAcessiveis(db, contexto, janela);
    return { notificacoes: acessiveis.map((it) => this.projetar(it)), proximoCursor };
  }

  /** POPOVER — subconjunto recente (≤ 10), mesma fonte/revalidação/filtro. Sem cursor (é "recentes"). */
  async recentes(): Promise<NotificacaoVisao[]> {
    const { contexto, db } = this.ctx();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const silenciados = await this.tiposSilenciados(db, membershipId);

    const rows = (await db.notificationRecipient.findMany({
      where: {
        recipientMembershipId: membershipId,
        availabilityState: 'AVAILABLE' as const,
        ...this.filtroTipo(silenciados),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: SELECT_ITEM,
      take: POPOVER_LIMITE,
    })) as ItemBruto[];

    const acessiveis = await this.filtrarAcessiveis(db, contexto, rows);
    return acessiveis.map((it) => this.projetar(it));
  }

  /**
   * BADGE — contagem de NÃO-LIDAS acessíveis, calculada no SERVIDOR (§1593; D1). Bounded: revalida no máximo
   * `CAP` não-lidas; se o bruto exceder o teto, `mais=true` (badge "99+"). Zero legítimo → `{0,false}` (vazio
   * útil, não falha). Consumível pelo Dashboard (FR-5).
   */
  async contar(): Promise<ContagemVisao> {
    const { contexto, db } = this.ctx();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const silenciados = await this.tiposSilenciados(db, membershipId);

    const rows = (await db.notificationRecipient.findMany({
      where: {
        recipientMembershipId: membershipId,
        readAt: null,
        availabilityState: 'AVAILABLE' as const,
        ...this.filtroTipo(silenciados),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: SELECT_ITEM,
      take: CAP_CONTAGEM + 1, // +1 detecta bruto > CAP
    })) as ItemBruto[];

    const mais = rows.length > CAP_CONTAGEM;
    const janela = mais ? rows.slice(0, CAP_CONTAGEM) : rows;
    const acessiveis = await this.filtrarAcessiveis(db, contexto, janela);
    return { naoLidas: acessiveis.length, mais };
  }

  /**
   * MARCAR COMO LIDA (rota HTTP idempotente) — consome a fonte única (`NotificationsService.marcarComoLida`)
   * injetando o `recipientMembershipId` do PRINCIPAL autenticado (nunca do cliente; herdado da 5.3). Persiste
   * `readAt`; destinatário inexistente/alheio → 404 (não-enumerante). Devolve o registro + a contagem
   * RECOMPUTADA no servidor (a mesma invalidação — D2).
   */
  async marcarComoLida(
    notificationId: string,
  ): Promise<{ recipient: NotificationRecipientView; naoLidas: number }> {
    const { contexto, db } = this.ctx();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const recipient = await this.write.marcarComoLida(notificationId, membershipId);
    const { naoLidas } = await this.contar();
    return { recipient, naoLidas };
  }

  /**
   * MARCAR TODAS COMO LIDAS (rota HTTP idempotente) — corte do servidor (`now()`) fixado aqui e passado à fonte
   * única (D4): entregas materializadas após o corte NÃO são marcadas. Devolve quantas foram marcadas + a
   * contagem recomputada.
   */
  async marcarTodasComoLidas(): Promise<{ marcadas: number; naoLidas: number }> {
    const { contexto, db } = this.ctx();
    const membershipId = await this.membershipDoPrincipal(db, contexto);
    const { marcadas } = await this.write.marcarTodasComoLidas(membershipId, new Date());
    const { naoLidas } = await this.contar();
    return { marcadas, naoLidas };
  }
}
