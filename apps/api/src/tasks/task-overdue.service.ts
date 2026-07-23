import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from '../kernel/db/prisma.service';
import { definirContextoOrg } from '../kernel/db/tenant-context';

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
  ) {}

  /**
   * Emite (idempotente) as ocorrências do Evento "Tarefa atrasada" para uma Organização: uma por Tarefa
   * ABERTA+ATIVA com prazo vencido que ainda não tenha ocorrência na versão CORRENTE do prazo. Devolve quantas
   * ocorrências NOVAS foram materializadas nesta passagem (0 se nada mudou desde o último scan).
   */
  async escanearOrg(orgId: string): Promise<number> {
    const inseridas = await this.prisma.$transaction([
      ...definirContextoOrg(this.prisma, { orgId }),
      this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO "TaskOverdueOccurrence" ("id", "orgId", "taskId", "dueVersion", "dueAt", "detectedAt", "createdAt")
        SELECT gen_random_uuid(), t."orgId", t."id", t."dueVersion", t."dueAt", now(), now()
        FROM "Task" t
        WHERE t."orgId" = current_org_id()
          AND t."lifecycleState" = 'ABERTA'
          AND t."archiveState" = 'ATIVA'
          AND t."dueAt" IS NOT NULL
          AND t."dueAt" <= now()
        ON CONFLICT ("orgId", "taskId", "dueVersion") DO NOTHING
      `),
    ]);
    // `$executeRaw` (último item do lote) devolve o nº de linhas afetadas (ocorrências inseridas).
    const count = Array.isArray(inseridas) ? Number(inseridas[inseridas.length - 1] ?? 0) : 0;
    if (count > 0) {
      this.logger.info(
        { event: 'task.overdue.emitted', orgId, count, at: new Date().toISOString() },
        'ocorrências de Tarefa atrasada emitidas',
      );
    }
    return count;
  }
}
