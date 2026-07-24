import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../kernel/db/prisma.service';
import { type TenantContext, withTenantContext } from '../../kernel/db/tenant-context';
import {
  resolverAcessoDaMembership,
  resolverPoderDaMembershipNoPipe,
} from '../../pipes/pipe-authz';
import { exigirTipoImplementado, type TipoNotificacao } from '../notification-catalog';
import { resolverPreferenciaEfetiva } from '../read/notification-type-registry';
import { NotificationsService } from '../notifications.service';
import type { EventoNotificavel } from '../notifications.dto';
import {
  aplicarCap,
  aplicarRegraAtor,
  type CandidatoDestinatario,
  colapsarPorMembership,
  type ResultadoDistribuicao,
} from './notification-distribution.core';

type Db = ReturnType<typeof withTenantContext>;

/** Contexto mínimo de uma distribuição: a Org (isolamento) e o ATOR do evento (`null` = sistema/automação). */
export interface ContextoDistribuicao {
  orgId: string;
  actorId: string | null;
}

/**
 * A entrada de UMA distribuição. O produtor descreve o evento por REFERÊNCIA (ids); a estratégia de resolução de
 * destinatários vem do catálogo (não do produtor). `alvosDiretos` só é lido pela estratégia `ALVO_DIRETO`.
 */
export interface EntradaDistribuicao {
  type: string;
  /** Recurso referenciado — Card/Tarefa/Solicitação por id (a Notificação NUNCA concede acesso). */
  resourceId: string;
  /** Idempotência determinística (ver `decision-oq-33.md`): estável por ocorrência OU novo por atribuição. */
  sourceEventId: string;
  /** Parâmetros de renderização BRUTOS — a fonte 5.3 sanitiza (allowlist estrutural). */
  params?: Record<string, string | number | boolean>;
  /** Memberships-alvo do evento (só para `ALVO_DIRETO`, ex.: o novo Responsável). */
  alvosDiretos?: readonly string[];
}

/**
 * Distribuição de Notificações (Story 5.6) — o PRODUTOR que resolve destinatários por evento e chama a **fonte
 * única** (5.3), sem mecanismo paralelo. Fecha o gate OQ-33 (ver `specs/5-6-catalogo-distribuicao/decision-oq-33.md`):
 *
 *  (a) **resolução por tipo** — a estratégia vem do `notification-catalog` (ALVO_DIRETO / RESPONSAVEL_TAREFA_ATUAL
 *      / PARTES_DO_CARD), sob RLS (`withTenantContext`), nunca com `where orgId` manual;
 *  (b) **dedup** — colapso por `membershipId` (múltiplos papéis → 1) + garantia final da `dedupeKey` da fonte;
 *  (c) **momento** — na ocorrência do evento (o chamador invoca após persistir), best-effort;
 *  (d) **acesso atual** — revalida com a MESMA lógica da 5.4 (`resolverAcessoDaMembership` p/ Card;
 *      `resolverPoderDaMembershipNoPipe` p/ Tarefa/Solicitação) — quem perdeu acesso é excluído (fail-closed);
 *  (e) **preferências ANTES da entrega** — `resolverPreferenciaEfetiva` (obrigatório › override › padrão);
 *  (f) **fan-out** — colapsado + CAP (`aplicarCap`).
 *
 * Sempre devolve um **resultado explícito** (`entregue` / `sem_destinatario`) — nunca falha silenciosa (§1634/
 * §1636). Só Memberships **ATIVAS** com **acesso atual** recebem; ninguém fora da Organização (RLS). A
 * Notificação **NUNCA concede acesso** (RN-084). C3 (guard/`ability.ts`) intocado — autoridade fina é função pura.
 */
@Injectable()
export class NotificationDistributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly notifications: NotificationsService,
  ) {}

  private db(orgId: string, actorId: string | null): Db {
    const ctx: TenantContext = { orgId, accountId: actorId ?? undefined };
    return withTenantContext(this.prisma, ctx, this.logger);
  }

  /**
   * Distribui UMA Notificação de um tipo do catálogo. Fail-closed: tipo desconhecido/SLOT → lança (erro de
   * programação do produtor, não entrega silenciosa). O caminho normal nunca lança por "sem destinatário" —
   * devolve `sem_destinatario` explícito.
   */
  async distribuir(
    ctx: ContextoDistribuicao,
    entrada: EntradaDistribuicao,
  ): Promise<ResultadoDistribuicao> {
    const meta = exigirTipoImplementado(entrada.type); // desconhecido/SLOT → lança
    const db = this.db(ctx.orgId, ctx.actorId);

    // 1) Resolver candidatos por estratégia (sob RLS).
    const brutos = await this.resolverCandidatos(db, meta, entrada);
    if (brutos.length === 0) {
      return this.semDestinatario(entrada, 'nenhum_candidato_resolvido');
    }

    // 2) Regra do ator + dedup por Membership (OQ-33 a/b).
    const semAtor = aplicarRegraAtor(brutos, ctx.actorId, meta.incluirAtor);
    const colapsados = colapsarPorMembership(semAtor);
    if (colapsados.length === 0) {
      return this.semDestinatario(entrada, 'nenhum_candidato_resolvido');
    }

    // 3) Revalidar ACESSO ATUAL ao recurso (OQ-33.d) — reusa a lógica da 5.4/2.10 (fail-closed).
    const comAcesso = await this.filtrarPorAcessoAtual(db, meta, entrada.resourceId, colapsados);
    if (comAcesso.length === 0) {
      return this.semDestinatario(entrada, 'nenhum_com_acesso_atual');
    }

    // 4) Aplicar PREFERÊNCIAS antes da entrega (OQ-33.e) — obrigatório › override › padrão.
    const querem = await this.filtrarPorPreferencia(db, entrada.type, comAcesso);
    if (querem.length === 0) {
      return this.semDestinatario(entrada, 'todos_silenciados');
    }

    // 5) CAP de fan-out (OQ-33.f) — determinístico; excedente logado.
    const { destinatarios, truncados } = aplicarCap(querem);
    if (truncados > 0) {
      this.logger.warn(
        {
          event: 'notification.distribution.capped',
          type: entrada.type,
          orgId: ctx.orgId,
          truncados,
        },
        'distribuição truncada pelo CAP de fan-out',
      );
    }

    // 6) Entregar pela FONTE ÚNICA (context-explícito — suporta produtor de sistema).
    const evento: EventoNotificavel = {
      type: entrada.type,
      sourceEventId: entrada.sourceEventId,
      resourceType: meta.resourceType,
      resourceId: entrada.resourceId,
      actorId: ctx.actorId,
      params: entrada.params ?? {},
      recipients: destinatarios.map((d) => ({ membershipId: d.membershipId, userId: d.userId })),
    };
    const registrada = await this.notifications.registrarNotificacaoNoContexto(
      { orgId: ctx.orgId, accountId: ctx.actorId ?? undefined },
      evento,
    );
    return {
      tipo: 'entregue',
      type: entrada.type,
      sourceEventId: entrada.sourceEventId,
      notificationId: registrada.notificacao.id,
      destinatariosCriados: registrada.destinatariosCriados,
    };
  }

  // ─────────────────────────────────────────────────────── resolução de candidatos ──

  private async resolverCandidatos(
    db: Db,
    meta: TipoNotificacao,
    entrada: EntradaDistribuicao,
  ): Promise<CandidatoDestinatario[]> {
    switch (meta.estrategia) {
      case 'ALVO_DIRETO':
        return this.carregarMembershipsAtivas(db, entrada.alvosDiretos ?? []);
      case 'RESPONSAVEL_TAREFA_ATUAL': {
        const tarefa = await db.task.findUnique({
          where: { id: entrada.resourceId },
          select: { responsavelMembershipId: true },
        });
        const alvo = tarefa?.responsavelMembershipId;
        return alvo ? this.carregarMembershipsAtivas(db, [alvo]) : [];
      }
      case 'PARTES_DO_CARD': {
        const [responsavel, concessoes] = await Promise.all([
          db.cardResponsavel.findFirst({
            where: { cardId: entrada.resourceId, state: 'ACTIVE' },
            select: { membershipId: true },
          }),
          db.cardGrant.findMany({
            where: { cardId: entrada.resourceId, state: 'ACTIVE', podeLer: true },
            select: { membershipId: true },
          }),
        ]);
        const ids = new Set<string>();
        if (responsavel) ids.add(responsavel.membershipId);
        for (const c of concessoes) ids.add(c.membershipId);
        return this.carregarMembershipsAtivas(db, [...ids]);
      }
      default:
        // SLOT nunca chega aqui (exigirTipoImplementado já lançou). Fail-closed.
        return [];
    }
  }

  /**
   * Carrega, sob RLS, as Memberships ATIVAS dos ids dados e as devolve como candidatos `{membershipId, userId}`
   * (`userId` = `Account` global). Memberships inexistentes/não-ACTIVE (ou de outra Org — invisíveis por RLS)
   * são simplesmente omitidas (fail-closed: só Membership ativa recebe — §1631).
   */
  private async carregarMembershipsAtivas(
    db: Db,
    membershipIds: readonly string[],
  ): Promise<CandidatoDestinatario[]> {
    if (membershipIds.length === 0) return [];
    const memberships = await db.membership.findMany({
      where: { id: { in: [...new Set(membershipIds)] }, state: 'ACTIVE' },
      select: { id: true, accountId: true },
    });
    return memberships.map((m) => ({ membershipId: m.id, userId: m.accountId }));
  }

  // ─────────────────────────────────────────────────────────── acesso + preferência ──

  /**
   * Filtra os candidatos aos que têm ACESSO ATUAL ao recurso, reusando a MESMA lógica da 5.4/2.10 (DBT-AUTHZ-01):
   * Card por `resolverAcessoDaMembership` (podeLer é o piso); Tarefa/Solicitação por `resolverPoderDaMembershipNoPipe`
   * sobre o Pipe dono. Recurso inexistente/cross-tenant (RLS) ⇒ ninguém tem acesso (fail-closed).
   */
  private async filtrarPorAcessoAtual(
    db: Db,
    meta: TipoNotificacao,
    resourceId: string,
    candidatos: readonly CandidatoDestinatario[],
  ): Promise<CandidatoDestinatario[]> {
    if (meta.resourceType === 'CARD') {
      const permitidos = await Promise.all(
        candidatos.map(async (c) => ({
          c,
          ok: (await resolverAcessoDaMembership(db, c.membershipId, resourceId)) !== null,
        })),
      );
      return permitidos.filter((p) => p.ok).map((p) => p.c);
    }
    if (meta.resourceType === 'TASK' || meta.resourceType === 'SOLICITACAO') {
      const pipeId = await this.pipeDoRecurso(db, meta.resourceType, resourceId);
      if (!pipeId) return []; // recurso invisível/inexistente → ninguém tem acesso
      const permitidos = await Promise.all(
        candidatos.map(async (c) => ({
          c,
          ok: (await resolverPoderDaMembershipNoPipe(db, c.membershipId, pipeId)) !== null,
        })),
      );
      return permitidos.filter((p) => p.ok).map((p) => p.c);
    }
    // resourceType sem revalidação definida na Fase 1 (ex.: ORGANIZACAO dos slots) — fail-closed.
    return [];
  }

  /** Pipe dono de uma Tarefa/Solicitação (sob RLS), ou `null` se invisível/inexistente. */
  private async pipeDoRecurso(
    db: Db,
    resourceType: 'TASK' | 'SOLICITACAO',
    resourceId: string,
  ): Promise<string | null> {
    if (resourceType === 'TASK') {
      const t = await db.task.findUnique({ where: { id: resourceId }, select: { pipeId: true } });
      return t?.pipeId ?? null;
    }
    const s = await db.solicitacao.findUnique({
      where: { id: resourceId },
      select: { pipeId: true },
    });
    return s?.pipeId ?? null;
  }

  /**
   * Filtra os candidatos aos que QUEREM o tipo (preferência efetiva `true`) — ANTES de criar a entrega (§1633).
   * Carrega os overrides de `(membership, type)` num único `findMany` (sem N+1); a precedência efetiva
   * (obrigatório › override › padrão) é a fonte única `resolverPreferenciaEfetiva`.
   */
  private async filtrarPorPreferencia(
    db: Db,
    type: string,
    candidatos: readonly CandidatoDestinatario[],
  ): Promise<CandidatoDestinatario[]> {
    const overrides = await db.notificationPreference.findMany({
      where: { type, membershipId: { in: candidatos.map((c) => c.membershipId) } },
      select: { membershipId: true, enabled: true },
    });
    const porMembership = new Map(overrides.map((o) => [o.membershipId, o.enabled]));
    return candidatos.filter((c) =>
      resolverPreferenciaEfetiva(type, porMembership.get(c.membershipId)),
    );
  }

  /** Resultado explícito de ausência de destinatário — logado e auditável (nunca falha silenciosa). */
  private semDestinatario(
    entrada: EntradaDistribuicao,
    motivo: 'nenhum_candidato_resolvido' | 'nenhum_com_acesso_atual' | 'todos_silenciados',
  ): ResultadoDistribuicao {
    this.logger.info(
      {
        event: 'notification.distribution.sem_destinatario',
        type: entrada.type,
        sourceEventId: entrada.sourceEventId,
        motivo,
      },
      'distribuição sem destinatário válido',
    );
    return {
      tipo: 'sem_destinatario',
      type: entrada.type,
      sourceEventId: entrada.sourceEventId,
      motivo,
    };
  }
}
