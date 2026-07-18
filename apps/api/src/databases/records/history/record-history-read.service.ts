import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirLerDatabase } from '../../database-authz';

type Db = ReturnType<typeof withTenantContext>;

/** Teto rígido da página da timeline (NFR-3/4): nunca devolver a trilha inteira sem limite. */
const LIMITE_MAX = 100;

/**
 * Um evento da timeline, na PROJEÇÃO allowlist que sai pela API interna. SÓ estes campos do `RecordHistory`:
 * `orgId`/`recordId` internos ficam **fora da fronteira**, e nada de binário, chave de objeto de storage ou URL
 * temporária (não existem hoje; a allowlist blinda as colunas de arquivo que 3.8 vier a adicionar — ajuste 5/AD-30).
 */
export interface EventoTimelineVisao {
  id: string;
  /** Tipo do evento (CREATED, VALUES_UPDATED, ARCHIVED, RESTORED, …). Vocabulário 3.4; cresce em 3.8/3.9. */
  type: string;
  /** Resumo legível, escrito SEM PII desnecessária pelo write-side (3.4). */
  summary: string;
  /** Ator/iniciador que originou o evento (quando disponível). Referência, não PII sensível. */
  actorId: string | null;
  /** Data-hora do evento. */
  occurredAt: Date;
}

/** Uma página da timeline, com o cursor para a próxima. */
export interface PaginaHistorico {
  eventos: EventoTimelineVisao[];
  proximoCursor: string | null;
}

/** Projeção allowlist: SÓ estes campos entram na leitura (nada de `orgId`/`recordId`/payloads). */
const SELECT_EVENTO = {
  id: true,
  type: true,
  summary: true,
  actorId: true,
  createdAt: true,
} as const;

/**
 * Leitura do **Histórico do Registro** (Story 3.6) — read-side puro sobre `RecordHistory` (append-only e IMUTÁVEL,
 * escrito por 3.4). **Sem schema, migration ou GRANT novo**: `RecordHistory` já tem GRANT SELECT/INSERT (sem
 * UPDATE/DELETE — a trilha é read-only por construção). **Espelho exato** do Histórico do Card (2.17) no domínio
 * DISTINTO de Registro (`Card ≠ Registro`) — sem reusar as entidades de Card.
 *
 * **Autorização = acesso ATUAL ao Registro**, resolvido como poder de **ler o Database dono** (`exigirLerDatabase`,
 * 3.2): quem perdeu o acesso não consulta mais o Histórico, mesmo tendo sido ator/iniciador antes — o histórico
 * **nunca** concede acesso (análogo a SC-2105 da 2.10/2.17). Sem acesso → **404 não-enumerante**; Registro
 * inexistente, de outro Database ou de outra Organização (RLS) → **404** idêntico.
 *
 * **Projeção allowlist + AD-15/AD-30:** só `id`/`type`/`summary`/`actorId`/data-hora. `orgId`/`recordId` ficam fora
 * da fronteira; nenhum binário/chave de objeto/URL temporária. **Correção é novo evento** (imutabilidade de 3.4): a
 * timeline exibe o original e a correção, ambos append-only, em ordem.
 */
@Injectable()
export class RecordHistoryReadService {
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
   * Uma página da timeline de um Registro. Paginação por **cursor determinístico**: ordena por `[createdAt, id]` (o
   * `id` único desempata → ordem estável) e o cursor é o `id` do último evento da página. Exige **acesso atual** ao
   * Database dono e que o Registro pertença a ele (404 não-enumerante nos dois casos).
   */
  async verHistorico(
    databaseId: string,
    recordId: string,
    cursor: string | null,
    limite: number,
  ): Promise<PaginaHistorico> {
    const { contexto, db } = this.ctx();
    await exigirLerDatabase(db, contexto, databaseId); // 404 sem acesso ATUAL ao Database dono (ler é o piso)

    // Reconfere que o Registro pertence a ESTE Database (sob RLS, já escopado à Org). 404 não-enumerante se não.
    const registro = await db.record.findFirst({
      where: { id: recordId, databaseId },
      select: { id: true },
    });
    if (!registro) throw new NotFoundException();

    const take = Math.min(Math.max(limite, 1), LIMITE_MAX) + 1; // +1 para saber se há próxima página
    const eventos = await db.recordHistory.findMany({
      where: { recordId },
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
