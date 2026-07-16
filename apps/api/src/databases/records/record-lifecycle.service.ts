import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { exigirOperarDatabase } from '../database-authz';
import {
  type AcaoCiclo,
  type EstadoCiclo,
  planejarTransicao,
} from './record-lifecycle.transitions';

type Db = ReturnType<typeof withTenantContext>;

/** O ciclo de vida de um Registro, do jeito que sai pela API interna (`orgId` fora da fronteira). */
export interface CicloVidaRegistroVisao {
  id: string;
  lifecycleState: string;
}

const SELECT_CICLO = { id: true, lifecycleState: true } as const;

/** Conflito de concorrência (→ 409): P2002/P2028 da transação interativa sob contenção. */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Ciclo de vida do Registro (Story 3.4): arquivar/restaurar. Dois estados (ATIVO/ARQUIVADO); a decisão de QUAL
 * transição é pura (`planejarTransicao`); este serviço a APLICA de forma atômica e idempotente.
 *
 * **Autorização:** OPERAR o Database (`exigirOperarDatabase`) — VIEWER → 403; sem acesso → 404 não-enumerante.
 * **Database arquivado = somente-leitura integral** (3.1): arquivar/restaurar sob Database ARCHIVED → 409.
 * **Atomicidade:** a mudança de estado e o evento `RecordHistory` vivem na MESMA transação interativa no client
 * raiz (`definirContextoOrg`) — auditoria manual (FR-214).
 * **Concorrência:** guarda otimista — `updateMany` só transiciona se o estado AINDA é o lido; `count = 0` →
 * reconsulta e decide idempotente (mesmo alvo) ou 409. Nunca 500, nunca lost update.
 * **Fronteira de banco:** a transição só toca `lifecycleState` (+`updatedAt`) — colunas com GRANT column-scoped.
 * `databaseId`/`formVersionId`/`valores`/`orgId` seguem no seu escopo (valores só por edição; os demais sem UPDATE).
 */
@Injectable()
export class RecordLifecycleService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  arquivar(databaseId: string, recordId: string): Promise<CicloVidaRegistroVisao> {
    return this.transicionar(databaseId, recordId, 'arquivar');
  }
  restaurar(databaseId: string, recordId: string): Promise<CicloVidaRegistroVisao> {
    return this.transicionar(databaseId, recordId, 'restaurar');
  }

  /**
   * Aplica uma transição. 404 se o Registro não existe/sem acesso; 403 se só lê; 409 se o Database está arquivado
   * ou uma transição concorrente venceu a corrida. Idempotente: pedir o estado em que já se está devolve o
   * Registro sem novo evento (e sem emitir `updateMany` — não polui a auditoria com falso `denied`).
   */
  private async transicionar(
    databaseId: string,
    recordId: string,
    acao: AcaoCiclo,
  ): Promise<CicloVidaRegistroVisao> {
    const { contexto, db } = this.db();
    await exigirOperarDatabase(db, contexto, databaseId); // 404 sem acesso; 403 VIEWER

    // Database arquivado = somente-leitura integral (3.1): nem arquivar/restaurar Registro.
    const database = await db.database.findUnique({
      where: { id: databaseId },
      select: { state: true },
    });
    if (database?.state === 'ARCHIVED')
      throw new ConflictException({ motivo: 'DATABASE_ARQUIVADO' });

    const record = await db.record.findFirst({
      where: { id: recordId, databaseId },
      select: SELECT_CICLO,
    });
    if (!record) throw new NotFoundException();

    const plano = planejarTransicao(acao, record.lifecycleState as EstadoCiclo);
    if (plano.tipo === 'idempotente') return record;

    const { transicao } = plano;
    let atualizado: CicloVidaRegistroVisao | null;
    try {
      atualizado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        const { count } = await tx.record.updateMany({
          where: { id: recordId, lifecycleState: record.lifecycleState },
          data: { lifecycleState: transicao.target },
        });
        if (count === 0) return null; // perdeu a corrida — decidido fora da tx

        await tx.recordHistory.create({
          data: {
            orgId: contexto.orgId,
            recordId,
            type: transicao.evento,
            summary: transicao.resumo,
            actorId: contexto.accountId ?? null,
          },
        });

        return tx.record.findUniqueOrThrow({ where: { id: recordId }, select: SELECT_CICLO });
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('transição concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    if (!atualizado) {
      const agora = await db.record.findUnique({ where: { id: recordId }, select: SELECT_CICLO });
      if (agora && agora.lifecycleState === transicao.target) return agora;
      throw new ConflictException(
        'o estado do Registro mudou concorrentemente; reconsulte e repita',
      );
    }

    this.auditar(contexto, 'update', 'Record');
    this.auditar(contexto, 'create', 'RecordHistory');
    return atualizado;
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca `valores`. */
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
