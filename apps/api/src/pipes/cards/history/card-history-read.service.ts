import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirLerCard } from '../../pipe-authz';

type Db = ReturnType<typeof withTenantContext>;

/** Teto rígido da página da timeline (NFR-3/4): nunca devolver a trilha inteira sem limite. */
const LIMITE_MAX = 100;

/**
 * Um evento da timeline, na PROJEÇÃO allowlist que sai pela API interna. SÓ estes campos do `CardHistory`:
 * `orgId`/`cardId` internos ficam fora da fronteira e o payload do `MovementEvent` (trilha de integração — AD-15)
 * NUNCA aparece aqui.
 */
export interface EventoTimelineVisao {
  id: string;
  /** Tipo do evento (CREATED, MOVED, FINALIZED, RESPONSAVEL_ASSIGNED, PHASE_VALUES_SAVED, …). Vocabulário 2.7+. */
  type: string;
  /** Resumo legível, escrito SEM PII pelo write-side (2.7+). */
  summary: string;
  /** Ator que originou o evento (quando disponível). Referência, não PII sensível. */
  actorId: string | null;
  /** Data-hora do evento. */
  occurredAt: Date;
}

/** Uma página da timeline, com o cursor para a próxima. */
export interface PaginaHistorico {
  eventos: EventoTimelineVisao[];
  proximoCursor: string | null;
}

/** Projeção allowlist: SÓ estes campos entram na leitura (nada de `orgId`/`cardId`/payloads). */
const SELECT_EVENTO = {
  id: true,
  type: true,
  summary: true,
  actorId: true,
  createdAt: true,
} as const;

/**
 * Leitura do **Histórico do Card** (Story 2.17) — read-side puro sobre `CardHistory` (append-only e IMUTÁVEL, escrito
 * por 2.7/2.10–2.16). **Sem schema, migration ou GRANT novo**: o `CardHistory` já tem GRANT SELECT/INSERT (sem
 * UPDATE/DELETE — a trilha é read-only por construção). Análogo ao Kanban (2.9), mas com autorização mais fina.
 *
 * **Autorização = acesso ATUAL ao Card** (`exigirLerCard`, 2.10): quem perdeu o acesso não consulta mais o Histórico,
 * mesmo tendo sido ator/Responsável/Observador antes — o histórico **nunca** concede acesso (SC-2105). Sem acesso →
 * **404 não-enumerante**. Diverge do Kanban (2.9, que autoriza por poder de Pipe): aqui o gate é o **Card**.
 *
 * **Projeção allowlist + AD-15:** só `id`/`type`/`summary`/`actorId`/data-hora do `CardHistory`. O `MovementEvent`
 * (2.16, trilha de integração) **não** aparece na timeline; `orgId` fica fora da fronteira; nenhum payload/`valores`.
 * **Agrupamento é só de apresentação:** devolve eventos individuais em ordem cronológica; a UI agrupa se quiser.
 */
@Injectable()
export class CardHistoryReadService {
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
   * Uma página da timeline de um Card. Paginação por **cursor determinístico**: ordena por `[createdAt, id]` (o `id`
   * único desempata → ordem estável) e o cursor é o `id` do último evento da página. Exige **acesso atual** ao Card.
   */
  async verHistorico(
    cardId: string,
    cursor: string | null,
    limite: number,
  ): Promise<PaginaHistorico> {
    const { contexto, db } = this.ctx();
    await exigirLerCard(db, contexto, cardId); // 404 sem acesso ATUAL ao Card (podeLer é o piso)

    const take = Math.min(Math.max(limite, 1), LIMITE_MAX) + 1; // +1 para saber se há próxima página
    const eventos = await db.cardHistory.findMany({
      where: { cardId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SELECT_EVENTO,
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const temMais = eventos.length === take;
    const pagina = temMais ? eventos.slice(0, take - 1) : eventos;
    const proximoCursor = temMais ? (pagina[pagina.length - 1]?.id ?? null) : null;
    return {
      eventos: pagina.map((e) => ({
        id: e.id,
        type: e.type,
        summary: e.summary,
        actorId: e.actorId,
        occurredAt: e.createdAt,
      })),
      proximoCursor,
    };
  }
}
