import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../kernel/db/prisma.service';
import { definirContextoOrg } from '../kernel/db/tenant-context';
import { uuidV5 } from '../domain-events/event-envelope';
import { NotificationDistributionService } from '../notifications/distribution/notification-distribution.service';

/**
 * Namespace UUID (fixo) para derivar o `sourceEventId` DETERMINÍSTICO da Notificação "Tarefa atrasada" (5.6). Uma
 * ocorrência `(orgId, taskId, dueVersion)` sempre produz o mesmo `sourceEventId` → re-scan NÃO re-notifica (a
 * fonte 5.3 dedupe por `sourceEventId`). Distinto dos namespaces de Evento (4.3) e movimentação (2.16).
 */
const NS_NOTIF_TASK_OVERDUE = 'e6b9c0a2-7f3d-5e41-9a8c-1b2d3e4f5a6b';

/**
 * Mecanismo temporal do Evento "Tarefa atrasada" (Story 5.1, gate §1535). Serviço SINGLETON (não
 * `RequestContext`-scoped) — recebe o `orgId` do agendador/dispatcher, nunca do cliente. Reusa o PADRÃO
 * Postgres-based do motor 4.6 (zero-dependência, AD-32): sem Redis, sem cron de SO. Ver a decision doc
 * `task-overdue-mechanism-5-1.md`.
 *
 * **A emissão é um único INSERT idempotente set-based** (`INSERT … SELECT … ON CONFLICT DO NOTHING`), sob RLS
 * (`current_org_id()`), que:
 *   • **re-checa a elegibilidade no ato** (ABERTA + ATIVA + prazo vencido): concluir/arquivar/mudar o prazo
 *     ANTES do scan tira a linha do SELECT — sem emissão incorreta (§1535);
 *   • é **idempotente por `@@unique(orgId, taskId, dueVersion)`**: um retry ou atraso do scheduler não duplica
 *     (a 2ª tentativa cai no `ON CONFLICT DO NOTHING`);
 *   • **congela `dueAt`/`dueVersion`** na ocorrência (padrão FormVersion/CardPhaseEntry — sem recálculo
 *     retroativo silencioso).
 *
 * Diferente do motor 4.6, NÃO há lease/claim (`FOR UPDATE SKIP LOCKED`): a ocorrência é um INSERT append-only
 * idempotente, então o índice único É o árbitro de concorrência — dois workers concorrentes convergem no mesmo
 * conjunto sem duplicar. O DRIVER contínuo multi-réplica (loop/intervalo por env) fica DEFERIDO como
 * `DEB-5-1-OVERDUE-DRIVER`, como o `DEB-4-6-DRIVER-CONTINUO` do motor — a 5.1 entrega o mecanismo INVOCÁVEL que
 * emite; o agendamento periódico é operação de plataforma (não se antecipa infra sem consumidor — AD-11).
 */
@Injectable()
export class TaskOverdueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly distribuicao: NotificationDistributionService,
  ) {}

  /**
   * Emite (idempotente) as ocorrências do Evento "Tarefa atrasada" para uma Organização: uma por Tarefa
   * ABERTA+ATIVA com prazo vencido que ainda não tenha ocorrência na versão CORRENTE do prazo. Devolve quantas
   * ocorrências NOVAS foram materializadas nesta passagem (0 se nada mudou desde o último scan).
   */
  async escanearOrg(orgId: string): Promise<number> {
    const resultado = await this.prisma.$transaction([
      ...definirContextoOrg(this.prisma, { orgId }),
      // `RETURNING` (Story 5.6) devolve exatamente as ocorrências NOVAS desta passagem (o `ON CONFLICT DO
      // NOTHING` não retorna as já existentes) — são elas que devem gerar Notificação, uma única vez.
      this.prisma.$queryRaw<Array<{ taskId: string; dueVersion: number }>>(Prisma.sql`
        INSERT INTO "TaskOverdueOccurrence" ("id", "orgId", "taskId", "dueVersion", "dueAt", "detectedAt", "createdAt")
        SELECT gen_random_uuid(), t."orgId", t."id", t."dueVersion", t."dueAt", now(), now()
        FROM "Task" t
        WHERE t."orgId" = current_org_id()
          AND t."lifecycleState" = 'ABERTA'
          AND t."archiveState" = 'ATIVA'
          AND t."dueAt" IS NOT NULL
          AND t."dueAt" <= now()
        ON CONFLICT ("orgId", "taskId", "dueVersion") DO NOTHING
        RETURNING "taskId", "dueVersion"
      `),
    ]);
    const novas = Array.isArray(resultado)
      ? (resultado[resultado.length - 1] as Array<{ taskId: string; dueVersion: number }>)
      : [];
    const count = novas.length;
    if (count > 0) {
      this.logger.info(
        { event: 'task.overdue.emitted', orgId, count, at: new Date().toISOString() },
        'ocorrências de Tarefa atrasada emitidas',
      );
    }

    // Story 5.6 — distribui a Notificação "Tarefa atrasada" para cada ocorrência NOVA (best-effort, pós-commit).
    // Evento de SISTEMA (sem ator humano); destinatário = Responsável atual da Tarefa (resolvido na distribuição).
    // Idempotente por `sourceEventId` determinístico → um retry/atraso do scan não re-notifica.
    for (const occ of novas) {
      await this.notificarAtraso(orgId, occ.taskId, Number(occ.dueVersion));
    }
    return count;
  }

  /**
   * Distribui a Notificação `TASK_OVERDUE` de UMA ocorrência (Story 5.6), best-effort e fault-isolated: erro
   * logado, nunca propagado (o scan segue). Contexto de SISTEMA (`actorId=null`); `sourceEventId` determinístico
   * por ocorrência.
   */
  private async notificarAtraso(orgId: string, taskId: string, dueVersion: number): Promise<void> {
    try {
      await this.distribuicao.distribuir(
        { orgId, actorId: null },
        {
          type: 'TASK_OVERDUE',
          resourceId: taskId,
          sourceEventId: uuidV5(
            NS_NOTIF_TASK_OVERDUE,
            `TASK_OVERDUE:${orgId}:${taskId}:${dueVersion}`,
          ),
        },
      );
    } catch {
      this.logger.warn(
        { event: 'notification.distribution.failed', type: 'TASK_OVERDUE', taskId },
        'falha ao distribuir Notificação de Tarefa atrasada (best-effort)',
      );
    }
  }
}
