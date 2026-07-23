import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { withTenantContext } from '../../../kernel/db/tenant-context';
import { resolverPoderNoPipe } from '../../pipe-authz';
import type { FiltrosExecucoes } from './executions.dto';
import {
  type EventoBruto,
  type ExecucaoBruta,
  type ExecucaoDetalheVisao,
  type ExecucaoResumoVisao,
  projetarCadeia,
  projetarExecucao,
  projetarResultadoAcao,
} from './execution-view';

type Db = ReturnType<typeof withTenantContext>;

/** Teto rígido da página (NFR-3/4): nunca devolver a trilha inteira sem limite. */
const LIMITE_MAX = 100;

/** Allowlist de LEITURA das colunas de `AutomationExecution` que a projeção consome (nada além disto). */
const SELECT_EXEC = {
  id: true,
  eventId: true,
  automationId: true,
  automationVersionId: true,
  configSnapshotRevision: true,
  state: true,
  attempt: true,
  startedAt: true,
  finishedAt: true,
  initiatorType: true,
  initiatorAccountId: true,
  initiatorAutomationId: true,
  correlationId: true,
  executionChainId: true,
  chainDepth: true,
  lastErrorCode: true,
  createdAt: true,
} as const;

/**
 * Escopo de visibilidade do principal sobre a trilha do Pipe (Story 4.8, D1):
 *   • `GERENCIAR` — Admin da Org / Admin do Pipe: vê TODAS as Execuções do Pipe, alvos crus.
 *   • `MEMBRO_TODAS` — Membro NÃO restrito: vê TODAS (acessa todos os Cards do Pipe); alvos crus se in-Pipe.
 *   • `MEMBRO_RESTRITO` — Membro `restritoAoProprio`: vê só Execuções cujo recurso principal ele acessa
 *     (`cardIds`), e mascara alvos fora desse conjunto.
 */
type Escopo =
  | { tipo: 'GERENCIAR' }
  | { tipo: 'MEMBRO_TODAS' }
  | { tipo: 'MEMBRO_RESTRITO'; cardIds: Set<string>; eventIds: Set<string> };

/** Uma página da trilha, com o cursor para a próxima. */
export interface PaginaExecucoes {
  execucoes: ExecucaoResumoVisao[];
  proximoCursor: string | null;
}

/**
 * Leitura da **Trilha de Execuções** (Story 4.8) — read-side PURO sobre `AutomationExecution` (4.6) +
 * `AutomationActionResult` + metadados de `DomainEvent`/cadeia (4.7). **Sem migration/GRANT** (o runtime já lê via
 * `SELECT`). Espelha o rigor do Histórico do Registro (3.6): projeção allowlist (`execution-view.ts`), autz por
 * acesso ATUAL, `orgId` fora da fronteira, 404 não-enumerante. Toda query por `withTenantContext`.
 *
 * **Autorização (D1):** piso = OPERAR o Pipe (`exigirOperarPipe` via `resolverPoderNoPipe`) — Admin da Org / Admin
 * do Pipe / Membro; Somente-leitura e Convidado → 403; sem acesso → 404. O Membro `restritoAoProprio` vê só as
 * Execuções dos Cards que acessa (Responsável ativo ∪ `CardGrant` ativo) — filtro no `where`, ANTES da paginação.
 *
 * **4.6/4.7 intocados.** Guard C3 congelado (autz fina no serviço).
 */
@Injectable()
export class ExecutionsReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Resolve o escopo de visibilidade, ou lança: 404 (sem acesso ao Pipe — não-enumerante), 403 (só lê —
   * Viewer/Convidado). Piso = operar o Pipe. O Membro restrito ganha os conjuntos `cardIds`/`eventIds` acessíveis.
   */
  private async resolverEscopo(
    db: Db,
    contexto: ContextoOrganizacional,
    pipeId: string,
  ): Promise<Escopo> {
    const principal = { accountId: contexto.accountId, papel: contexto.papel };
    const poder = await resolverPoderNoPipe(db, principal, pipeId); // 404 se sem acesso
    if (poder === 'ler') throw new ForbiddenException(); // Viewer/Convidado não acessam a trilha
    if (poder === 'gerenciar') return { tipo: 'GERENCIAR' };

    // poder === 'operar' (Membro do Pipe). Verifica o modificador `restritoAoProprio`.
    const membership = await db.membership.findFirst({
      where: { accountId: principal.accountId },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException(); // defensivo (resolverPoder já validou)
    const grant = await db.pipeGrant.findFirst({
      where: { pipeId, membershipId: membership.id, state: 'ACTIVE' },
      select: { restritoAoProprio: true },
    });
    if (!grant || !grant.restritoAoProprio) return { tipo: 'MEMBRO_TODAS' };

    // Restrito: acessa só os Cards deste Pipe onde é Responsável ATIVO ou tem concessão direta ativa.
    const [resp, grants] = await Promise.all([
      db.cardResponsavel.findMany({
        where: { membershipId: membership.id, state: 'ACTIVE', card: { pipeId } },
        select: { cardId: true },
      }),
      db.cardGrant.findMany({
        where: { membershipId: membership.id, state: 'ACTIVE', card: { pipeId } },
        select: { cardId: true },
      }),
    ]);
    const cardIds = new Set<string>([...resp.map((r) => r.cardId), ...grants.map((g) => g.cardId)]);
    const eventIds = await this.eventIdsDosCards(db, pipeId, cardIds);
    return { tipo: 'MEMBRO_RESTRITO', cardIds, eventIds };
  }

  /** `eventId`s do Pipe cujo recurso principal (Card) está no conjunto acessível. Vazio ⇒ conjunto vazio. */
  private async eventIdsDosCards(
    db: Db,
    pipeId: string,
    cardIds: Set<string>,
  ): Promise<Set<string>> {
    if (cardIds.size === 0) return new Set();
    const eventos = await db.domainEvent.findMany({
      where: { pipeId, resourceType: 'CARD', resourceId: { in: [...cardIds] } },
      select: { eventId: true },
    });
    return new Set(eventos.map((e) => e.eventId));
  }

  /**
   * Uma página da trilha do Pipe. Filtros (período/estado/Evento) validados no DTO (fail-closed → 400). Paginação
   * por cursor determinístico `[createdAt, id]` (teto 100). O filtro por Evento (`eventType`) e o escopo restrito
   * viram um conjunto de `eventId` no `where`, ANTES da paginação — nunca "esconde depois de contar".
   */
  async listar(
    pipeId: string,
    filtros: FiltrosExecucoes,
    cursor: string | null,
    limite: number,
  ): Promise<PaginaExecucoes> {
    const { contexto, db } = this.ctx();
    const escopo = await this.resolverEscopo(db, contexto, pipeId);

    // Conjuntos de eventId a interseccionar: escopo restrito e/ou filtro por eventType.
    const conjuntos: Set<string>[] = [];
    if (escopo.tipo === 'MEMBRO_RESTRITO') conjuntos.push(escopo.eventIds);
    if (filtros.eventType) {
      const evs = await db.domainEvent.findMany({
        where: { pipeId, eventType: filtros.eventType },
        select: { eventId: true },
      });
      conjuntos.push(new Set(evs.map((e) => e.eventId)));
    }
    let eventIdIn: string[] | null = null;
    if (conjuntos.length > 0) {
      const intersecao = conjuntos.reduce((acc, s) =>
        acc === s ? acc : new Set([...acc].filter((id) => s.has(id))),
      );
      if (intersecao.size === 0) return { execucoes: [], proximoCursor: null }; // nada visível/casando
      eventIdIn = [...intersecao];
    }

    const createdAt =
      filtros.de || filtros.ate
        ? {
            ...(filtros.de ? { gte: filtros.de } : {}),
            ...(filtros.ate ? { lte: filtros.ate } : {}),
          }
        : undefined;

    const where = {
      pipeId,
      ...(filtros.estado ? { state: filtros.estado } : {}),
      ...(createdAt ? { createdAt } : {}),
      ...(eventIdIn ? { eventId: { in: eventIdIn } } : {}),
    };

    const take = Math.min(Math.max(limite, 1), LIMITE_MAX) + 1; // +1 para saber se há próxima página
    const rows = await db.automationExecution.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SELECT_EXEC,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const temMais = rows.length === take;
    const pagina = temMais ? rows.slice(0, take - 1) : rows;
    const proximoCursor = temMais ? (pagina[pagina.length - 1]?.id ?? null) : null;

    const eventosPorId = await this.carregarEventos(
      db,
      pagina.map((r) => r.eventId),
    );
    const nomesPorAutomacao = await this.carregarNomes(
      db,
      pagina.map((r) => r.automationId),
    );

    return {
      execucoes: pagina.map((r) =>
        projetarExecucao(
          r as ExecucaoBruta,
          eventosPorId.get(r.eventId) ?? null,
          nomesPorAutomacao.get(r.automationId) ?? null,
        ),
      ),
      proximoCursor,
    };
  }

  /**
   * Detalhe de uma Execução: resumo + Ações na ordem configurada + metadados de cadeia. 404 não-enumerante se a
   * Execução não existe, é de outro Pipe/Org (RLS), ou — no escopo restrito — se o recurso principal não é
   * acessível. `targetResourceId` das Ações é mascarado conforme o escopo (§1447).
   */
  async obter(pipeId: string, executionId: string): Promise<ExecucaoDetalheVisao> {
    const { contexto, db } = this.ctx();
    const escopo = await this.resolverEscopo(db, contexto, pipeId);

    const exec = await db.automationExecution.findFirst({
      where: { id: executionId, pipeId },
      select: SELECT_EXEC,
    });
    if (!exec) throw new NotFoundException();

    // Escopo restrito: a Execução só é visível se seu recurso principal (via eventId) é acessível. 404 senão.
    if (escopo.tipo === 'MEMBRO_RESTRITO' && !escopo.eventIds.has(exec.eventId)) {
      throw new NotFoundException();
    }

    const [eventosPorId, nomesPorAutomacao, acoes] = await Promise.all([
      this.carregarEventos(db, [exec.eventId]),
      this.carregarNomes(db, [exec.automationId]),
      db.automationActionResult.findMany({
        where: { executionId },
        orderBy: { actionIndex: 'asc' },
        select: {
          actionIndex: true,
          actionType: true,
          state: true,
          errorCode: true,
          targetResourceId: true,
        },
      }),
    ]);

    const podeVerAlvo = await this.predicadoDeAlvo(db, pipeId, escopo, acoes);

    const resumo = projetarExecucao(
      exec as ExecucaoBruta,
      eventosPorId.get(exec.eventId) ?? null,
      nomesPorAutomacao.get(exec.automationId) ?? null,
    );
    return {
      ...resumo,
      acoes: acoes.map((a) =>
        projetarResultadoAcao(
          {
            actionIndex: a.actionIndex,
            actionType: a.actionType,
            state: a.state,
            errorCode: a.errorCode,
            targetResourceId: a.targetResourceId,
          },
          podeVerAlvo,
        ),
      ),
      cadeia: projetarCadeia(exec as ExecucaoBruta),
    };
  }

  /**
   * Predicado de visibilidade de um `targetResourceId` (mascaramento §1447). GERENCIAR → sempre visível. Membro →
   * visível só se o alvo é um Card DESTE Pipe que ele acessa: MEMBRO_TODAS = qualquer Card in-Pipe (batch-load
   * único, sem N+1); MEMBRO_RESTRITO = interseção com o conjunto acessível. Alvos cross-domínio (Registro) ou de
   * outro Pipe são mascarados (fail-closed — `DEB-4-8-TARGET-CROSS-DOMAIN`).
   */
  private async predicadoDeAlvo(
    db: Db,
    pipeId: string,
    escopo: Escopo,
    acoes: { targetResourceId: string | null }[],
  ): Promise<(id: string) => boolean> {
    if (escopo.tipo === 'GERENCIAR') return () => true;

    const alvos = [
      ...new Set(acoes.map((a) => a.targetResourceId).filter((x): x is string => x !== null)),
    ];
    if (alvos.length === 0) return () => false;
    const cardsInPipe = await db.card.findMany({
      where: { id: { in: alvos }, pipeId },
      select: { id: true },
    });
    const inPipe = new Set(cardsInPipe.map((c) => c.id));
    if (escopo.tipo === 'MEMBRO_RESTRITO') {
      const acessiveis = escopo.cardIds;
      return (id: string) => inPipe.has(id) && acessiveis.has(id);
    }
    // MEMBRO_TODAS: acessa todos os Cards do Pipe.
    return (id: string) => inPipe.has(id);
  }

  /** Batch-load dos Eventos (por `eventId`) → metadados sanitizados (eventType/origin/recurso principal). */
  private async carregarEventos(db: Db, eventIds: string[]): Promise<Map<string, EventoBruto>> {
    const unicos = [...new Set(eventIds)];
    if (unicos.length === 0) return new Map();
    const eventos = await db.domainEvent.findMany({
      where: { eventId: { in: unicos } },
      select: {
        eventId: true,
        eventType: true,
        origin: true,
        resourceType: true,
        resourceId: true,
      },
    });
    return new Map(
      eventos.map((e) => [
        e.eventId,
        {
          eventType: e.eventType,
          origin: e.origin,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
        },
      ]),
    );
  }

  /** Batch-load dos nomes das Automações (por `id`). */
  private async carregarNomes(db: Db, automationIds: string[]): Promise<Map<string, string>> {
    const unicos = [...new Set(automationIds)];
    if (unicos.length === 0) return new Map();
    const automacoes = await db.automation.findMany({
      where: { id: { in: unicos } },
      select: { id: true, name: true },
    });
    return new Map(automacoes.map((a) => [a.id, a.name]));
  }
}
