import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirOperarCard } from '../../pipe-authz';
import { type AcaoCiclo, planejarTransicao } from './card-lifecycle.transitions';

type Db = ReturnType<typeof withTenantContext>;

/** O ciclo de vida de um Card, do jeito que sai pela API interna (`orgId` fora da fronteira). */
export interface CicloVidaVisao {
  id: string;
  lifecycleState: string;
  previousLifecycleState: string | null;
}

const SELECT_CICLO = {
  id: true,
  lifecycleState: true,
  previousLifecycleState: true,
} as const;

/**
 * Conflito de concorrência (→ 409): P2002/P2028 da transação interativa sob contenção. A **guarda otimista** (o
 * `updateMany` filtrado pelo estado lido) é o mecanismo primário; este trata só o timeout/erro da tx.
 */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Ciclo de vida do Card (Story 2.11): finalizar/reabrir/arquivar/restaurar. Eixo INDEPENDENTE da Fase
 * (`Fase ≠ Status do Card`) e da saúde temporal (2.13). A decisão de QUAL transição é pura (`planejarTransicao`);
 * este serviço a APLICA de forma atômica.
 *
 * **Autorização:** OPERAR o Card (`exigirOperarCard`, 2.10) — transição de estado é operação sobre o Card; sem
 * acesso → 404 não-enumerante, ler-sem-operar → 403.
 *
 * **Atomicidade:** a mudança de estado e o evento `CardHistory` da transição vivem na MESMA transação interativa
 * no client raiz com contexto transaction-local (`definirContextoOrg`), como 2.7/2.10 — auditoria manual (FR-214).
 *
 * **Concorrência:** guarda otimista — o `updateMany` só transiciona se o estado AINDA é o que lemos
 * (`where: { lifecycleState: <lido> }`); `count = 0` significa que outra transição venceu a corrida — reconsulta e
 * decide idempotente (chegou ao mesmo alvo) ou **409** (divergiu). Nunca 500, nunca lost update silencioso.
 *
 * **Fronteira de banco:** a transição só toca `lifecycleState`/`previousLifecycleState` (+`updatedAt`) — as únicas
 * colunas de `Card` com GRANT de UPDATE (column-scoped, 2.11). `phaseId` (movimentação, 2.14) segue sem UPDATE.
 */
@Injectable()
export class CardLifecycleService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  finalizar(cardId: string): Promise<CicloVidaVisao> {
    return this.transicionar(cardId, 'finalizar');
  }
  reabrir(cardId: string): Promise<CicloVidaVisao> {
    return this.transicionar(cardId, 'reabrir');
  }
  arquivar(cardId: string): Promise<CicloVidaVisao> {
    return this.transicionar(cardId, 'arquivar');
  }
  restaurar(cardId: string): Promise<CicloVidaVisao> {
    return this.transicionar(cardId, 'restaurar');
  }

  /**
   * Aplica uma transição de ciclo de vida. 404 se o Card não existe/sem acesso; 403 se só pode ler; **409** se a
   * transição é inválida a partir do estado atual (ex.: finalizar um arquivado) ou se uma transição concorrente
   * venceu a corrida. Idempotente: pedir o estado em que já se está devolve o Card sem novo evento.
   */
  private async transicionar(cardId: string, acao: AcaoCiclo): Promise<CicloVidaVisao> {
    const { contexto, db } = this.db();
    await exigirOperarCard(db, contexto, cardId); // 404 sem acesso; 403 se só lê

    const card = await db.card.findUnique({ where: { id: cardId }, select: SELECT_CICLO });
    if (!card) throw new NotFoundException();

    const plano = planejarTransicao(acao, card.lifecycleState, card.previousLifecycleState);
    if (plano.tipo === 'idempotente') return card;
    if (plano.tipo === 'invalido') throw new ConflictException(plano.motivo);

    const { transicao } = plano;
    let atualizado: CicloVidaVisao | null;
    try {
      atualizado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Guarda otimista: só transiciona se o estado ainda é o lido (senão outra transição venceu a corrida).
        const { count } = await tx.card.updateMany({
          where: { id: cardId, lifecycleState: card.lifecycleState },
          data: {
            lifecycleState: transicao.target,
            previousLifecycleState: transicao.novoPrevious,
          },
        });
        if (count === 0) return null; // perdeu a corrida — decidido fora da tx

        // Evento da transição — MESMA transação (AD-13): não há mudança de estado sem evento no Histórico.
        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: transicao.evento,
            summary: transicao.resumo,
            actorId: contexto.accountId ?? null,
          },
        });

        return tx.card.findUniqueOrThrow({ where: { id: cardId }, select: SELECT_CICLO });
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('transição concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    if (!atualizado) {
      // A corrida foi perdida. Reconsulta: se o estado atual já é o alvo, foi idempotente (mesmo desfecho);
      // caso contrário, houve divergência real → 409.
      const agora = await db.card.findUnique({ where: { id: cardId }, select: SELECT_CICLO });
      if (agora && agora.lifecycleState === transicao.target) return agora;
      throw new ConflictException('o estado do Card mudou concorrentemente; reconsulte e repita');
    }

    this.auditar(contexto, 'update', 'Card');
    this.auditar(contexto, 'create', 'CardHistory');
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
