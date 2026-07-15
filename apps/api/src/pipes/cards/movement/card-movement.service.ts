import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../../kernel/db/tenant-context';
import { exigirMoverCard } from '../../pipe-authz';
import { registrarEntradaNaFase } from '../phase-entry/card-phase-entry';
import {
  type ContextoDeTransicao,
  type EstadoCicloCard,
  executarPreflight,
} from './transition-preflight';
import type { MovimentacaoDTO } from './card-movement.dto';

type Db = ReturnType<typeof withTenantContext>;

/** A movimentação, do jeito que sai pela API interna (`orgId`/`valores` fora da fronteira). */
export interface MovimentacaoVisao {
  id: string;
  phaseId: string;
  lifecycleState: string;
}

const SELECT_CARD = {
  id: true,
  phaseId: true,
  lifecycleState: true,
} as const;

const SELECT_FASE = {
  id: true,
  pipeId: true,
  state: true,
} as const;

/**
 * Conflito de concorrência (→ 409): P2002/P2028 da transação interativa sob contenção. A **guarda otimista** (o
 * `updateMany` filtrado pela Fase lida) é o mecanismo primário; este trata só o timeout/erro da tx.
 */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Movimentação do Card entre Fases (Story 2.14) — o **2º UPDATE de `Card`** em runtime, column-scoped a `phaseId`
 * (GRANT da migration `card_movement`). Muda o eixo **Fase**, distinto do ciclo de vida (2.11) e da saúde (2.13):
 * `Fase ≠ Status do Card`.
 *
 * **Autorização:** MOVER o Card (`exigirMoverCard`, compõe operar + `podeMover` — 2.10/2.14). Sem acesso → 404
 * não-enumerante; Somente leitura/Observador → 403.
 *
 * **Preflight (núcleo puro):** ciclo aberto, Fase destino ativa do mesmo Pipe, confirmação humana (D2/R2/D2.4). Um
 * bloqueio ⇒ **409** com o motivo, **sem** persistir nada (CA2 — sem movimentação parcial).
 *
 * **Atomicidade (AD-13):** UPDATE `phaseId` + reentrada (`CardPhaseEntry`, origin=MOVE) + evento `CardHistory`
 * (`MOVED`) vivem na MESMA transação interativa no client raiz com contexto transaction-local (`definirContextoOrg`),
 * como 2.7/2.10/2.11. Não há Card movido sem sua entrada e sem seu evento.
 *
 * **Concorrência:** guarda otimista — o `updateMany` só move se a Fase AINDA é a que lemos
 * (`where: { phaseId: <origem lida> }`); `count = 0` significa que outra movimentação venceu a corrida — reconsulta e
 * decide idempotente (já na Fase destino) ou **409**. Nunca 500, nunca lost update silencioso.
 *
 * **Recálculo de marcos/saúde é por leitura (sem agendador):** a nova `CardPhaseEntry` (origin=MOVE), com seu
 * `configSnapshot`, passa a ser a entrada atual; `calcularMarcos` (2.12) e `derivarSaude` (2.13) já leem a atual.
 * Nada a persistir aqui, nenhum evento de saúde (AD-11).
 */
@Injectable()
export class CardMovementService {
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
   * Move um Card para outra Fase. 404 se o Card não existe/sem acesso; 403 se só pode ler; **409** se o preflight
   * bloqueia (ciclo não-aberto, Fase arquivada/outro Pipe, confirmação ausente) ou se uma movimentação concorrente
   * venceu a corrida. Mover para a Fase atual (origem == destino) é **no-op idempotente** (200 — D4).
   */
  async mover(cardId: string, dados: MovimentacaoDTO): Promise<MovimentacaoVisao> {
    const { contexto, db } = this.db();
    await exigirMoverCard(db, contexto, cardId); // 404 sem acesso; 403 se só lê/observa

    const card = await db.card.findUnique({ where: { id: cardId }, select: SELECT_CARD });
    if (!card) throw new NotFoundException();

    // D4 — mover para a Fase atual não muda nada: no-op idempotente, sem UPDATE/evento/entrada (não emite
    // `updateMany`, então não gera falso-positivo de auditoria). Não depende de ler o destino (é a própria Fase).
    if (dados.destinoPhaseId === card.phaseId) return card;

    const [faseOrigem, faseDestino] = await Promise.all([
      db.phase.findUnique({ where: { id: card.phaseId }, select: SELECT_FASE }),
      db.phase.findUnique({ where: { id: dados.destinoPhaseId }, select: SELECT_FASE }),
    ]);
    // Destino inexistente NO CONTEXTO (não existe ou é de outra Org — invisível sob RLS) → 404 não-enumerante.
    if (!faseDestino) throw new NotFoundException();
    // Origem sempre existe (o Card está nela); defesa: se sumiu, é estado inconsistente → 404.
    if (!faseOrigem) throw new NotFoundException();

    const ctx: ContextoDeTransicao = {
      card: {
        id: card.id,
        lifecycleState: card.lifecycleState as EstadoCicloCard,
        phaseId: card.phaseId,
      },
      faseOrigem: {
        id: faseOrigem.id,
        pipeId: faseOrigem.pipeId,
        ativa: faseOrigem.state === 'ACTIVE',
      },
      faseDestino: {
        id: faseDestino.id,
        pipeId: faseDestino.pipeId,
        ativa: faseDestino.state === 'ACTIVE',
      },
      confirmado: dados.confirmado,
    };

    const preflight = executarPreflight(ctx);
    if (!preflight.ok) throw new ConflictException(preflight.motivo); // bloqueio → 409, nada persistido (CA2)

    let atualizado: MovimentacaoVisao | null;
    try {
      atualizado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Guarda otimista: só move se a Fase ainda é a lida (senão outra movimentação venceu a corrida).
        const { count } = await tx.card.updateMany({
          where: { id: cardId, phaseId: card.phaseId },
          data: { phaseId: dados.destinoPhaseId },
        });
        if (count === 0) return null; // perdeu a corrida — decidido fora da tx

        // Reentrada temporal (2.12): novo INSERT de `CardPhaseEntry` (origin=MOVE), congelando o `configSnapshot`
        // da Fase destino. Vira a entrada ATUAL — marcos/saúde passam a derivar dela na leitura (AD-11).
        await registrarEntradaNaFase(tx, contexto, {
          cardId,
          phaseId: dados.destinoPhaseId,
          origin: 'MOVE',
        });

        // Evento da movimentação — MESMA transação (AD-13): não há Card movido sem evento no Histórico.
        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: 'MOVED',
            summary: 'Card movido de Fase',
            actorId: contexto.accountId ?? null,
          },
        });

        return tx.card.findUniqueOrThrow({ where: { id: cardId }, select: SELECT_CARD });
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('movimentação concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    if (!atualizado) {
      // A corrida foi perdida. Reconsulta: se o Card já está na Fase destino, foi idempotente (mesmo desfecho);
      // caso contrário, houve divergência real → 409.
      const agora = await db.card.findUnique({ where: { id: cardId }, select: SELECT_CARD });
      if (agora && agora.phaseId === dados.destinoPhaseId) return agora;
      throw new ConflictException('a Fase do Card mudou concorrentemente; reconsulte e repita');
    }

    this.auditar(contexto, 'update', 'Card');
    this.auditar(contexto, 'create', 'CardPhaseEntry');
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
