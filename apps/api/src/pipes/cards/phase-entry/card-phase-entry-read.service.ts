import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { withTenantContext } from '../../../kernel/db/tenant-context';
import { calcularMarcos, lerSnapshotConfig } from '../../phases/milestones/phase-milestones.core';
import { exigirLerCard } from '../../pipe-authz';

/**
 * Base temporal de um Card (Story 2.12): a **entrada atual** na Fase + os **marcos calculados** (instantes
 * absolutos), aplicando a precedência override-do-Card › duração-da-Fase › ausência. É a BASE que a saúde temporal
 * (2.13) consumirá — aqui NÃO há veredito de saúde (ok/atrasado/vencido), só os instantes.
 */
export interface MarcoVisao {
  esperado: string | null;
  vencimento: string | null;
  expiracao: string | null;
}

export interface BaseTemporalVisao {
  cardId: string;
  phaseId: string;
  /** Instante absoluto da entrada atual (ISO). */
  enteredAt: string;
  origin: 'SUBMISSION' | 'MOVE';
  marcos: MarcoVisao;
}

/**
 * Leitura da base temporal do Card. Autorização por acesso de LEITURA ao Card (`exigirLerCard`, 2.10) — VIEWER
 * concedido lê (ler ≠ operar); sem acesso → 404 não-enumerante. "Entrada atual" = a `CardPhaseEntry` mais recente
 * por `enteredAt` (desempate por `id` — determinístico). Só LEITURA: nenhuma escrita, nenhum GRANT novo.
 */
@Injectable()
export class CardPhaseEntryReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  async verBaseTemporal(cardId: string): Promise<BaseTemporalVisao> {
    const { contexto, db } = this.db();
    await exigirLerCard(db, contexto, cardId); // 404 sem acesso, sem revelar existência

    const entrada = await db.cardPhaseEntry.findFirst({
      where: { cardId },
      orderBy: [{ enteredAt: 'desc' }, { id: 'desc' }],
      select: { phaseId: true, enteredAt: true, origin: true, configSnapshot: true },
    });
    if (!entrada) throw new NotFoundException(); // Card sem entrada (não deveria ocorrer após a 2.12/backfill)

    // `valores` é possível PII — lido só para o CÁLCULO do override, nunca devolvido nem logado.
    const card = await db.card.findUnique({ where: { id: cardId }, select: { valores: true } });
    const valores =
      card &&
      typeof card.valores === 'object' &&
      card.valores !== null &&
      !Array.isArray(card.valores)
        ? (card.valores as Record<string, unknown>)
        : {};

    const snapshot = lerSnapshotConfig(entrada.configSnapshot);
    const marcos = calcularMarcos(entrada.enteredAt, snapshot, valores);

    return {
      cardId,
      phaseId: entrada.phaseId,
      enteredAt: entrada.enteredAt.toISOString(),
      origin: entrada.origin,
      marcos: {
        esperado: marcos.esperado?.toISOString() ?? null,
        vencimento: marcos.vencimento?.toISOString() ?? null,
        expiracao: marcos.expiracao?.toISOString() ?? null,
      },
    };
  }
}
