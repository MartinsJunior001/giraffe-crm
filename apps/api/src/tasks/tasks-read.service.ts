import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';
import { resolverPoderNoPipe } from '../pipes/pipe-authz';
import { derivarAtrasada } from './task-overdue.core';
import type { EstadoArquivamento, EstadoOperacional } from './task-lifecycle.transitions';

type Db = ReturnType<typeof withTenantContext>;

/** Uma Tarefa na leitura: estado persistido + `atrasada` DERIVADO + validade do Responsável. */
export interface TarefaLeituraVisao {
  id: string;
  pipeId: string;
  cardId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  dueVersion: number;
  responsavelMembershipId: string | null;
  /** O Responsável ainda é uma Membership ACTIVE? Nunca confia silenciosamente numa referência inválida. */
  responsavelValido: boolean;
  creatorMembershipId: string | null;
  lifecycleState: EstadoOperacional;
  archiveState: EstadoArquivamento;
  /** DERIVADO na leitura (nunca persistido): aberta + ativa + prazo vencido no fuso oficial. */
  atrasada: boolean;
}

const SELECT = {
  id: true,
  pipeId: true,
  cardId: true,
  title: true,
  description: true,
  dueAt: true,
  dueVersion: true,
  responsavelMembershipId: true,
  creatorMembershipId: true,
  lifecycleState: true,
  archiveState: true,
} as const;

const TETO_PAGINA = 100;

/**
 * Leitura de Tarefas (Story 5.1) — espelha o rigor do Kanban read (2.9): autz por acesso de LEITURA
 * (`resolverPoderNoPipe` — qualquer poder; ler ≠ operar; sem acesso → 404 não-enumerante), projeção controlada
 * (`orgId` fora da fronteira), `atrasada` DERIVADO na leitura (nunca persistido — 2.13). A validade do
 * Responsável é recomputada (a referência nunca é confiada em silêncio — §1525).
 */
@Injectable()
export class TasksReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Lista as Tarefas de um Pipe (ATIVAS por padrão; `incluirArquivadas` opcional). Teto 100 por página. */
  async listar(
    pipeId: string,
    opcoes: { incluirArquivadas?: boolean; take?: number; skip?: number } = {},
  ): Promise<{ tarefas: TarefaLeituraVisao[]; total: number }> {
    const { contexto, db } = this.db();
    await resolverPoderNoPipe(db, contexto, pipeId); // qualquer poder; 404 não-enumerante sem acesso

    const take = Math.min(Math.max(opcoes.take ?? TETO_PAGINA, 1), TETO_PAGINA);
    const skip = Math.max(opcoes.skip ?? 0, 0);
    const where = {
      pipeId,
      ...(opcoes.incluirArquivadas ? {} : { archiveState: 'ATIVA' as const }),
    };

    const [linhas, total] = await Promise.all([
      db.task.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
      }),
      db.task.count({ where }),
    ]);

    const agora = new Date();
    const validade = await this.validadeResponsaveis(
      db,
      linhas.map((l) => l.responsavelMembershipId),
    );
    return { tarefas: linhas.map((l) => this.montar(l, agora, validade)), total };
  }

  /** Detalhe de UMA Tarefa. Resolve o Pipe dono e exige acesso de leitura a ele. */
  async obter(taskId: string): Promise<TarefaLeituraVisao> {
    const { contexto, db } = this.db();
    const t = await db.task.findUnique({ where: { id: taskId }, select: SELECT });
    if (!t) throw new NotFoundException();
    await resolverPoderNoPipe(db, contexto, t.pipeId); // 404 não-enumerante sem acesso ao Pipe

    const validade = await this.validadeResponsaveis(db, [t.responsavelMembershipId]);
    return this.montar(t, new Date(), validade);
  }

  /** Conjunto de Memberships ACTIVE entre os `responsavelMembershipId` presentes (para `responsavelValido`). */
  private async validadeResponsaveis(
    db: Db,
    ids: readonly (string | null)[],
  ): Promise<Set<string>> {
    const alvos = [...new Set(ids.filter((i): i is string => i !== null))];
    if (alvos.length === 0) return new Set();
    const ativos = await db.membership.findMany({
      where: { id: { in: alvos }, state: 'ACTIVE' },
      select: { id: true },
    });
    return new Set(ativos.map((m) => m.id));
  }

  private montar(
    l: {
      id: string;
      pipeId: string;
      cardId: string | null;
      title: string;
      description: string | null;
      dueAt: Date | null;
      dueVersion: number;
      responsavelMembershipId: string | null;
      creatorMembershipId: string | null;
      lifecycleState: string;
      archiveState: string;
    },
    agora: Date,
    responsaveisAtivos: Set<string>,
  ): TarefaLeituraVisao {
    const lifecycleState = l.lifecycleState as EstadoOperacional;
    const archiveState = l.archiveState as EstadoArquivamento;
    return {
      id: l.id,
      pipeId: l.pipeId,
      cardId: l.cardId,
      title: l.title,
      description: l.description,
      dueAt: l.dueAt,
      dueVersion: l.dueVersion,
      responsavelMembershipId: l.responsavelMembershipId,
      responsavelValido:
        l.responsavelMembershipId !== null && responsaveisAtivos.has(l.responsavelMembershipId),
      creatorMembershipId: l.creatorMembershipId,
      lifecycleState,
      archiveState,
      atrasada: derivarAtrasada(lifecycleState, archiveState, l.dueAt, agora),
    };
  }
}
