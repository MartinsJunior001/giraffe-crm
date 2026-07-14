import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { type Poder, resolverPoderNoPipe } from '../pipe-authz';

type Db = ReturnType<typeof withTenantContext>;

/** Teto rígido da página da coluna do Kanban (gate NFR-3/4): nunca devolver uma Fase inteira sem limite. */
const LIMITE_MAX = 100;

/** Capacidades EFETIVAS do principal sobre o Card, derivadas do `poder` — a UI mostra só o permitido. */
export interface Capacidades {
  ler: boolean;
  operar: boolean;
  gerenciar: boolean;
}

/** Coluna do Kanban (uma Fase ativa) — SEM os Cards (payload enxuto; os Cards paginam à parte). */
export interface ColunaVisao {
  id: string;
  name: string;
  totalCards: number;
}

/** O Kanban de um Pipe: o poder efetivo + as colunas (Fases ativas, já ordenadas por `position`). */
export interface KanbanVisao {
  poder: Poder;
  capacidades: Capacidades;
  fases: ColunaVisao[];
}

/** Card na LISTA do Kanban — enxuto, SEM `valores` (que só saem no detalhe). */
export interface CardListaVisao {
  id: string;
  phaseId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Uma página de Cards de uma coluna (Fase), com o cursor para a próxima. */
export interface PaginaCards {
  cards: CardListaVisao[];
  proximoCursor: string | null;
}

/** Detalhe do Card (espaço operacional): dados + Fase atual + capacidades. `orgId` fica fora da fronteira. */
export interface CardDetalheVisao {
  card: {
    id: string;
    phaseId: string;
    faseNome: string;
    valores: Prisma.JsonValue;
    formId: string;
    formVersionId: string;
    /** Estado de ciclo de vida (Story 2.11): ATIVO/FINALIZADO/ARQUIVADO. Eixo independente da Fase. */
    lifecycleState: string;
    createdAt: Date;
    updatedAt: Date;
  };
  poder: Poder;
  capacidades: Capacidades;
}

const SELECT_CARD_LISTA = {
  id: true,
  phaseId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Capacidades a partir do poder — só o do PRÓPRIO principal (nunca revela ação que ele não possui). */
function capacidadesDoPoder(poder: Poder): Capacidades {
  return {
    ler: true,
    operar: poder === 'gerenciar' || poder === 'operar',
    gerenciar: poder === 'gerenciar',
  };
}

/**
 * Leitura do **Kanban e do espaço operacional do Card** (Story 2.9) — superfície **somente leitura**. Não há
 * schema, migration nem GRANT novo: reusa `Card`/`Phase` já materializados (2.7/2.3) e o índice
 * `@@index([orgId, pipeId, phaseId])` criado na 2.7 justamente para esta leitura. **Nenhuma movimentação, mutação
 * ou mudança de Fase** — isso é a Story 2.14 (o runtime segue sem GRANT de UPDATE em `Card`).
 *
 * Toda query passa por `withTenantContext` (isolamento é do banco). A **autorização de leitura** reusa
 * `resolverPoderNoPipe` (pipe-authz): basta QUALQUER poder no Pipe (Admin da Org, ou concessão ACTIVE de
 * ADMIN/MEMBER/**VIEWER**); sem acesso → **404 não-enumerante**. `orgId` nunca cruza a fronteira; `valores`
 * (possível PII) só saem no detalhe, nunca na lista nem em log.
 */
@Injectable()
export class KanbanReadService {
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
   * O Kanban de um Pipe: as colunas (Fases ativas ordenadas por `position`) com a contagem de Cards de cada uma. Os
   * Cards em si paginam pela coluna (`verColunaCards`) — aqui só o esqueleto + totais, para a UI renderizar já e
   * carregar cada coluna sob demanda (sem trazer uma Fase inteira). Contagem por `groupBy` num único query (sem N+1).
   */
  async verKanban(pipeId: string): Promise<KanbanVisao> {
    const { contexto, db } = this.ctx();
    const poder = await resolverPoderNoPipe(db, contexto, pipeId); // 404 se sem acesso

    const fases = await db.phase.findMany({
      where: { pipeId, state: 'ACTIVE' },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true },
    });

    // Contagem de Cards por Fase num único agregado (sem um query por coluna — evita N+1).
    const contagens = await db.card.groupBy({
      by: ['phaseId'],
      where: { pipeId },
      _count: { _all: true },
    });
    const totalPorFase = new Map(contagens.map((c) => [c.phaseId, c._count._all]));

    return {
      poder,
      capacidades: capacidadesDoPoder(poder),
      fases: fases.map((f) => ({
        id: f.id,
        name: f.name,
        totalCards: totalPorFase.get(f.id) ?? 0,
      })),
    };
  }

  /**
   * Uma página de Cards de UMA coluna (Fase) do Pipe. Paginação por **cursor determinístico**: ordena por
   * `[createdAt, id]` (o `id` único desempata → ordem estável) e o cursor é o `id` do último Card da página. Sem
   * `valores` (payload enxuto — NFR-3/4). A Fase precisa ser do Pipe (senão 404 não-enumerante).
   */
  async verColunaCards(
    pipeId: string,
    phaseId: string,
    cursor: string | null,
    limite: number,
  ): Promise<PaginaCards> {
    const { contexto, db } = this.ctx();
    await resolverPoderNoPipe(db, contexto, pipeId); // 404 se sem acesso

    // A Fase tem de ser deste Pipe (na Org do contexto). Fora do Pipe/Org → 404 não-enumerante.
    const fase = await db.phase.findFirst({
      where: { id: phaseId, pipeId },
      select: { id: true },
    });
    if (!fase) throw new NotFoundException();

    const take = Math.min(Math.max(limite, 1), LIMITE_MAX) + 1; // +1 para saber se há próxima página
    const cards = await db.card.findMany({
      where: { pipeId, phaseId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SELECT_CARD_LISTA,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const temMais = cards.length === take;
    const pagina = temMais ? cards.slice(0, take - 1) : cards;
    const proximoCursor = temMais ? (pagina[pagina.length - 1]?.id ?? null) : null;
    return { cards: pagina, proximoCursor };
  }

  /**
   * Detalhe de um Card (espaço operacional de três painéis): `valores`, a Fase atual (nome) e a referência à versão
   * do Formulário. Devolve as **capacidades** derivadas do poder para a UI mostrar só o permitido. **Não** lê o
   * `CardHistory` (isso é a 2.17 — aqui o painel só é estruturado). Card fora do Pipe/Org → 404 não-enumerante.
   */
  async verCard(pipeId: string, cardId: string): Promise<CardDetalheVisao> {
    const { contexto, db } = this.ctx();
    const poder = await resolverPoderNoPipe(db, contexto, pipeId); // 404 se sem acesso

    const card = await db.card.findFirst({
      where: { id: cardId, pipeId },
      select: {
        id: true,
        phaseId: true,
        valores: true,
        formId: true,
        formVersionId: true,
        lifecycleState: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!card) throw new NotFoundException();

    const fase = await db.phase.findFirst({
      where: { id: card.phaseId },
      select: { name: true },
    });

    return {
      card: {
        id: card.id,
        phaseId: card.phaseId,
        faseNome: fase?.name ?? '',
        valores: card.valores,
        formId: card.formId,
        formVersionId: card.formVersionId,
        lifecycleState: card.lifecycleState,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
      },
      poder,
      capacidades: capacidadesDoPoder(poder),
    };
  }
}
