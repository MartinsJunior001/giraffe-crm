import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirLerCard, exigirOperarCard } from '../../../pipes/pipe-authz';
import { exigirLerDatabase, exigirOperarDatabase } from '../../database-authz';

type Db = ReturnType<typeof withTenantContext>;

/** Um vínculo Card↔Registro pela fronteira interna. `orgId`/`correlationId` internos ficam fora. */
export interface VinculoVisao {
  id: string;
  cardId: string;
  recordId: string;
  state: string;
  createdAt: Date;
}

/** Projeção fixa do vínculo. `orgId`/`correlationId`/`createdBy` nunca saem pela fronteira. */
const SELECT_LINK = {
  id: true,
  cardId: true,
  recordId: true,
  state: true,
  createdAt: true,
} as const;

/**
 * Conflito de concorrência (→ idempotente/409, nunca 500): P2002 (índice único parcial do par ativo) ou P2028
 * (timeout da tx interativa sob contenção no mesmo índice). Mesmo tratamento de 2.7/3.4.
 */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Vínculo explícito **N–N** entre Card e Registro (Story 3.9). Um Card tem vários Registros e vice-versa. O
 * vínculo **NUNCA** concede acesso: criar/remover exige operar **os dois** recursos (Card por `pipe-authz` +
 * Database do Registro por `database-authz`); listar exige **ler** o recurso da rota, e cada linha expõe só a
 * REFERÊNCIA do outro lado (nunca conteúdo). `Card ≠ Registro`: entidade distinta, não reusa entidades de Card.
 *
 * **Atomicidade (AD-13):** vincular/desvincular gravam o vínculo **e** os eventos `LINKED`/`UNLINKED` no
 * `CardHistory` **e** no `RecordHistory` na MESMA transação interativa (client raiz, `definirContextoOrg`), os
 * dois eventos com o mesmo `correlationId`. Falha em qualquer escrita ⇒ rollback integral. **Idempotência:** o
 * índice único parcial `(orgId, cardId, recordId) WHERE state='ACTIVE'` impede 2º vínculo ativo (P2002 →
 * devolve o existente); desvincular é `updateMany where state=ACTIVE` (count=0 ⇒ já removido, idempotente, sem
 * evento). **Sem exclusão** — desvincular é `state=REMOVED`.
 */
@Injectable()
export class CardRecordLinkService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Resolve o `databaseId` do Registro sob RLS. Registro inexistente/de outra Org ⇒ 404 não-enumerante (o mesmo
   * 404 de "sem acesso" — não confirma existência cross-tenant).
   */
  private async databaseIdDoRegistro(db: Db, recordId: string): Promise<string> {
    const record = await db.record.findUnique({
      where: { id: recordId },
      select: { databaseId: true },
    });
    if (!record) throw new NotFoundException();
    return record.databaseId;
  }

  /** Autorização de MUTAÇÃO do vínculo: operar o Card **E** operar o Database do Registro. Ordem: Card primeiro. */
  private async exigirOperarOsDois(
    db: Db,
    contexto: ContextoOrganizacional,
    cardId: string,
    recordId: string,
  ): Promise<string> {
    await exigirOperarCard(db, contexto, cardId); // 404 sem acesso ao Card; 403 só-lê
    const databaseId = await this.databaseIdDoRegistro(db, recordId);
    await exigirOperarDatabase(db, contexto, databaseId); // 404 sem acesso ao Database; 403 VIEWER
    return databaseId;
  }

  /**
   * Cria o vínculo (idempotente). 404 sem acesso a um dos lados / Card ou Registro inexistente; 409 conflito de
   * concorrência não resolvível como idempotente. Re-vincular par já ativo devolve o vínculo existente (sem novo
   * evento).
   */
  async vincular(cardId: string, recordId: string): Promise<VinculoVisao> {
    const { contexto, db } = this.db();
    await this.exigirOperarOsDois(db, contexto, cardId, recordId);

    const correlationId = randomUUID();
    try {
      const link = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        const novo = await tx.cardRecordLink.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            recordId,
            correlationId,
            createdBy: contexto.accountId ?? null,
          },
          select: SELECT_LINK,
        });

        // Eventos correlacionados nos DOIS históricos, mesma tx, mesmo correlationId (AD-13). Sem PII (só refs).
        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: 'LINKED',
            summary: `Registro vinculado (${recordId})`,
            actorId: contexto.accountId ?? null,
            correlationId,
          },
        });
        await tx.recordHistory.create({
          data: {
            orgId: contexto.orgId,
            recordId,
            type: 'LINKED',
            summary: `Card vinculado (${cardId})`,
            actorId: contexto.accountId ?? null,
            correlationId,
          },
        });
        return novo;
      });

      this.auditar(contexto, 'create', 'CardRecordLink');
      this.auditar(contexto, 'create', 'CardHistory');
      this.auditar(contexto, 'create', 'RecordHistory');
      return link;
    } catch (err) {
      if (isConflito(err)) {
        // Par já vinculado (índice único parcial ativo) ⇒ idempotente: devolve o vínculo ATIVO existente.
        const existente = await db.cardRecordLink.findFirst({
          where: { cardId, recordId, state: 'ACTIVE' },
          select: SELECT_LINK,
        });
        if (existente) return existente;
        throw new ConflictException('vínculo concorrente em andamento; repita a requisição');
      }
      throw err;
    }
  }

  /**
   * Remove o vínculo (idempotente). 404 sem acesso a um dos lados / Registro inexistente. Desvincular par não
   * ativo (já removido ou inexistente) é no-op determinístico (200, sem evento). Sem exclusão física.
   */
  async desvincular(cardId: string, recordId: string): Promise<{ removido: boolean }> {
    const { contexto, db } = this.db();
    await this.exigirOperarOsDois(db, contexto, cardId, recordId);

    const correlationId = randomUUID();
    try {
      const removido = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Guarda otimista: só desvincula o par ATIVO. count=0 ⇒ já removido/nunca vinculado ⇒ idempotente,
        // SEM evento (não falseia a trilha com um UNLINKED de algo que não estava vinculado).
        const { count } = await tx.cardRecordLink.updateMany({
          where: { cardId, recordId, state: 'ACTIVE' },
          data: { state: 'REMOVED', removedAt: new Date() },
        });
        if (count === 0) return false;

        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: 'UNLINKED',
            summary: `Registro desvinculado (${recordId})`,
            actorId: contexto.accountId ?? null,
            correlationId,
          },
        });
        await tx.recordHistory.create({
          data: {
            orgId: contexto.orgId,
            recordId,
            type: 'UNLINKED',
            summary: `Card desvinculado (${cardId})`,
            actorId: contexto.accountId ?? null,
            correlationId,
          },
        });
        return true;
      });

      if (removido) {
        this.auditar(contexto, 'update', 'CardRecordLink');
        this.auditar(contexto, 'create', 'CardHistory');
        this.auditar(contexto, 'create', 'RecordHistory');
      }
      return { removido };
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('desvínculo concorrente em andamento; repita a requisição');
      }
      throw err;
    }
  }

  /** Lista os Registros vinculados (ATIVOS) a um Card. Exige LER o Card; expõe só `recordId` (referência). */
  async listarPorCard(cardId: string): Promise<VinculoVisao[]> {
    const { contexto, db } = this.db();
    await exigirLerCard(db, contexto, cardId); // 404 sem acesso ao Card
    const links = await db.cardRecordLink.findMany({
      where: { cardId, state: 'ACTIVE' },
      select: SELECT_LINK,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return links;
  }

  /** Lista os Cards vinculados (ATIVOS) a um Registro. Exige LER o Database dono; expõe só `cardId`. */
  async listarPorRegistro(databaseId: string, recordId: string): Promise<VinculoVisao[]> {
    const { contexto, db } = this.db();
    await exigirLerDatabase(db, contexto, databaseId); // 404 sem acesso ao Database
    // O Registro pertence a ESTE Database? (404 não-enumerante — não vaza Registro de outro Database.)
    const record = await db.record.findFirst({
      where: { id: recordId, databaseId },
      select: { id: true },
    });
    if (!record) throw new NotFoundException();
    const links = await db.cardRecordLink.findMany({
      where: { recordId, state: 'ACTIVE' },
      select: SELECT_LINK,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return links;
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca PII. */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId ?? null,
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
