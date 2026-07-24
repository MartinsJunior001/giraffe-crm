import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../kernel/db/tenant-context';
import { emitirEventoDeDominio } from '../domain-events/domain-event-emission';
import { NotificationDistributionService } from '../notifications/distribution/notification-distribution.service';
import { exigirOperarPipe } from '../pipes/pipe-authz';
import {
  planejarArquivamento,
  planejarOperacional,
  podeEscrever,
  type AcaoArquivamento,
  type AcaoOperacional,
  type EstadoArquivamento,
  type EstadoOperacional,
} from './task-lifecycle.transitions';
import type { CriarTarefaDTO, EditarTarefaDTO } from './tasks.dto';

type Db = ReturnType<typeof withTenantContext>;

/** A Tarefa como sai pela API interna (`orgId` FORA da fronteira; nunca vaza). */
export interface TarefaVisao {
  id: string;
  pipeId: string;
  cardId: string | null;
  title: string;
  description: string | null;
  dueAt: Date | null;
  dueVersion: number;
  responsavelMembershipId: string | null;
  creatorMembershipId: string | null;
  lifecycleState: EstadoOperacional;
  archiveState: EstadoArquivamento;
}

const SELECT_TAREFA = {
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

/** Conflito de concorrência (→ 409): P2002/P2028 da tx interativa sob contenção. */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Ciclo de vida e acompanhamento da Tarefa (Story 5.1). Entidade DISTINTA (não reusa Card/Registro); reusa a
 * AUTORIZAÇÃO por Pipe (`pipe-authz.ts`) e os PADRÕES da base (tx interativa no client raiz com
 * `definirContextoOrg`, guarda otimista, auditoria manual). Toda query passa por `withTenantContext` — nenhum
 * `where orgId` manual; `orgId` nunca vem do cliente.
 *
 * **Autorização (matriz canônica 1.6; C3 congelado):** criar/editar/concluir/reabrir/arquivar/restaurar/
 * atribuir-Responsável/vincular exigem **operar o Pipe** (`exigirOperarPipe` — Admin da Org/Admin do Pipe/
 * Membro operam; Viewer → 403; sem acesso → 404 não-enumerante). A leitura fica no `TasksReadService`.
 *
 * **Arquivada = somente-leitura integral (§1526):** editar/Responsável/vínculo sob arquivamento → 409
 * `TAREFA_ARQUIVADA`; só `restaurar` sai desse estado.
 *
 * **Atomicidade/auditoria:** cada mutação escreve seu evento no `TaskHistory` na MESMA transação interativa no
 * client raiz (`definirContextoOrg`) — não há mudança sem evento (AD-13). Guarda otimista onde há transição de
 * estado; P2002/P2028 → 409, nunca 500.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly distribuicao: NotificationDistributionService,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Membership ativa do PRINCIPAL na Org do contexto (para `creatorMembershipId`). Sob RLS. */
  private async membershipDoPrincipal(
    db: Db,
    contexto: ContextoOrganizacional,
  ): Promise<string | null> {
    const m = await db.membership.findFirst({
      where: { accountId: contexto.accountId, state: 'ACTIVE' },
      select: { id: true },
    });
    return m?.id ?? null;
  }

  /** Carrega a Tarefa sob RLS ou 404 não-enumerante. */
  private async carregar(db: Db, taskId: string): Promise<TarefaVisao> {
    const t = await db.task.findUnique({ where: { id: taskId }, select: SELECT_TAREFA });
    if (!t) throw new NotFoundException();
    return t as TarefaVisao;
  }

  /**
   * Valida que um `cardId` (não nulo) pertence ao MESMO Pipe/Org da Tarefa — sob RLS (um Card de outra Org é
   * invisível → 404). O vínculo NÃO amplia acesso (§1523): só se confere pertencimento, nunca se lê `valores`.
   */
  private async validarCardDoPipe(db: Db, cardId: string, pipeId: string): Promise<void> {
    const card = await db.card.findUnique({
      where: { id: cardId },
      select: { id: true, pipeId: true },
    });
    if (!card) throw new NotFoundException(); // cross-tenant/inexistente → 404 não-enumerante
    if (card.pipeId !== pipeId) {
      throw new BadRequestException('o Card deve pertencer ao mesmo Pipe da Tarefa');
    }
  }

  /**
   * Valida que uma Membership (não nula) existe e está ACTIVE na Org — sob RLS (outra Org é invisível → 404).
   * É a garantia "Responsável = Membership ATIVA" no assign-time; nunca aceita `Account` global nem referência
   * inválida silenciosa.
   */
  private async validarMembershipAtiva(db: Db, membershipId: string): Promise<void> {
    const m = await db.membership.findFirst({
      where: { id: membershipId, state: 'ACTIVE' },
      select: { id: true },
    });
    if (!m)
      throw new BadRequestException('Responsável deve ser uma Membership ativa da Organização');
  }

  // ─────────────────────────────────────────────────────────────── CRIAR ──

  async criar(pipeId: string, dto: CriarTarefaDTO): Promise<TarefaVisao> {
    const { contexto, db } = this.db();
    await exigirOperarPipe(db, contexto, pipeId); // 404 sem acesso; 403 se só lê

    if (dto.cardId !== null) await this.validarCardDoPipe(db, dto.cardId, pipeId);
    if (dto.responsavelMembershipId !== null) {
      await this.validarMembershipAtiva(db, dto.responsavelMembershipId);
    }
    const creatorMembershipId = await this.membershipDoPrincipal(db, contexto);

    const taskId = randomUUID();
    let criada: TarefaVisao;
    try {
      criada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        await tx.task.create({
          data: {
            id: taskId,
            orgId: contexto.orgId,
            pipeId,
            cardId: dto.cardId,
            title: dto.title,
            description: dto.description,
            dueAt: dto.dueAt,
            dueVersion: 0,
            responsavelMembershipId: dto.responsavelMembershipId,
            creatorMembershipId,
            lifecycleState: 'ABERTA',
            archiveState: 'ATIVA',
          },
        });
        await this.evento(tx, contexto, taskId, 'CREATED', 'Tarefa criada');
        await this.emitirDominio(tx, contexto, pipeId, taskId, 'TASK_CREATED');
        return tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: SELECT_TAREFA,
        }) as Promise<TarefaVisao>;
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('conflito ao criar a Tarefa; repita');
      throw err;
    }
    this.auditar(contexto, 'create', 'Task');
    this.auditar(contexto, 'create', 'TaskHistory');
    return criada;
  }

  // ────────────────────────────────────────────────────────────── EDITAR ──

  async editar(taskId: string, dto: EditarTarefaDTO): Promise<TarefaVisao> {
    const { contexto, db } = this.db();
    const tarefa = await this.carregar(db, taskId);
    await exigirOperarPipe(db, contexto, tarefa.pipeId);
    if (!podeEscrever(tarefa.archiveState)) {
      throw new ConflictException({ motivo: 'TAREFA_ARQUIVADA' });
    }

    // O prazo mudou? (compara instantes; `undefined` = não mexeu). Alterar o prazo BUMPA `dueVersion`, o que
    // invalida a ocorrência anterior do Evento "Tarefa atrasada" (§1535) e permite nova emissão na versão nova.
    const mudouPrazo =
      dto.dueAt !== undefined &&
      (tarefa.dueAt?.getTime() ?? null) !== (dto.dueAt?.getTime() ?? null);
    const novoDueVersion = mudouPrazo ? tarefa.dueVersion + 1 : tarefa.dueVersion;

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.dueAt !== undefined) {
      data.dueAt = dto.dueAt;
      data.dueVersion = novoDueVersion;
    }

    let atualizada: TarefaVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        // Guarda otimista: só edita se `dueVersion` ainda é o lido (defesa contra bump concorrente de prazo).
        const { count } = await tx.task.updateMany({
          where: { id: taskId, dueVersion: tarefa.dueVersion, archiveState: 'ATIVA' },
          data,
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, taskId, 'EDITED', 'Tarefa editada');
        if (mudouPrazo) await this.evento(tx, contexto, taskId, 'DUE_CHANGED', 'Prazo alterado');
        return tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: SELECT_TAREFA,
        }) as Promise<TarefaVisao>;
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('edição concorrente; reconsulte e repita');
      throw err;
    }
    if (!atualizada)
      throw new ConflictException('a Tarefa mudou concorrentemente; reconsulte e repita');
    this.auditar(contexto, 'update', 'Task');
    return atualizada;
  }

  // ─────────────────────────────────────────────────────────── RESPONSÁVEL ──

  async atribuirResponsavel(taskId: string, novo: string | null): Promise<TarefaVisao> {
    const { contexto, db } = this.db();
    const tarefa = await this.carregar(db, taskId);
    await exigirOperarPipe(db, contexto, tarefa.pipeId);
    if (!podeEscrever(tarefa.archiveState)) {
      throw new ConflictException({ motivo: 'TAREFA_ARQUIVADA' });
    }
    if (novo !== null) await this.validarMembershipAtiva(db, novo);

    const anterior = tarefa.responsavelMembershipId;
    if (anterior === novo) return tarefa; // idempotente — sem escrita, sem evento

    const { evento, resumo } = this.eventoResponsavel(anterior, novo);
    let atualizada: TarefaVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.task.updateMany({
          where: { id: taskId, responsavelMembershipId: anterior, archiveState: 'ATIVA' },
          data: { responsavelMembershipId: novo },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, taskId, evento, resumo);
        await this.emitirDominio(tx, contexto, tarefa.pipeId, taskId, 'TASK_RESPONSIBLE_CHANGED');
        return tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: SELECT_TAREFA,
        }) as Promise<TarefaVisao>;
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('atribuição concorrente; reconsulte e repita');
      throw err;
    }
    if (!atualizada)
      throw new ConflictException('o Responsável mudou concorrentemente; reconsulte e repita');
    this.auditar(contexto, 'update', 'Task');
    // Story 5.6 — distribui a Notificação ao NOVO Responsável (best-effort, pós-commit): a atribuição já está
    // persistida; uma falha na distribuição não a derruba (a fonte é o banco). Remoção (novo=null) não notifica.
    if (novo !== null) await this.notificarResponsavel(contexto, taskId, novo);
    return atualizada;
  }

  /**
   * Distribui a Notificação `TASK_RESPONSIBLE_ASSIGNED` ao novo Responsável (Story 5.6), best-effort e
   * fault-isolated (como o tempo real da 5.5): erro é logado, nunca propagado. A resolução final de destinatário
   * (só Membership ativa + acesso atual ao Pipe; preferências; ator excluído) vive na distribuição.
   */
  private async notificarResponsavel(
    contexto: ContextoOrganizacional,
    taskId: string,
    novoMembershipId: string,
  ): Promise<void> {
    try {
      await this.distribuicao.distribuir(
        { orgId: contexto.orgId, actorId: contexto.accountId },
        {
          type: 'TASK_RESPONSIBLE_ASSIGNED',
          resourceId: taskId,
          sourceEventId: randomUUID(),
          alvosDiretos: [novoMembershipId],
        },
      );
    } catch {
      this.logger.warn(
        { event: 'notification.distribution.failed', type: 'TASK_RESPONSIBLE_ASSIGNED', taskId },
        'falha ao distribuir Notificação de Responsável (best-effort)',
      );
    }
  }

  // ──────────────────────────────────────────────────────────── VÍNCULO CARD ──

  async vincularCard(taskId: string, novoCardId: string | null): Promise<TarefaVisao> {
    const { contexto, db } = this.db();
    const tarefa = await this.carregar(db, taskId);
    await exigirOperarPipe(db, contexto, tarefa.pipeId);
    if (!podeEscrever(tarefa.archiveState)) {
      throw new ConflictException({ motivo: 'TAREFA_ARQUIVADA' });
    }
    if (novoCardId !== null) await this.validarCardDoPipe(db, novoCardId, tarefa.pipeId);

    const anterior = tarefa.cardId;
    if (anterior === novoCardId) return tarefa; // idempotente

    const evento = novoCardId === null ? 'CARD_UNLINKED' : 'CARD_LINKED';
    const resumo = novoCardId === null ? 'Card desvinculado' : 'Card vinculado';
    let atualizada: TarefaVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.task.updateMany({
          where: { id: taskId, cardId: anterior, archiveState: 'ATIVA' },
          data: { cardId: novoCardId },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, taskId, evento, resumo);
        return tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: SELECT_TAREFA,
        }) as Promise<TarefaVisao>;
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('vínculo concorrente; reconsulte e repita');
      throw err;
    }
    if (!atualizada)
      throw new ConflictException('o vínculo mudou concorrentemente; reconsulte e repita');
    this.auditar(contexto, 'update', 'Task');
    return atualizada;
  }

  // ──────────────────────────────────────────── CICLO OPERACIONAL / ARQUIVAR ──

  concluir(taskId: string): Promise<TarefaVisao> {
    return this.transicaoOperacional(taskId, 'concluir');
  }
  reabrir(taskId: string): Promise<TarefaVisao> {
    return this.transicaoOperacional(taskId, 'reabrir');
  }
  arquivar(taskId: string): Promise<TarefaVisao> {
    return this.transicaoArquivamento(taskId, 'arquivar');
  }
  restaurar(taskId: string): Promise<TarefaVisao> {
    return this.transicaoArquivamento(taskId, 'restaurar');
  }

  private async transicaoOperacional(taskId: string, acao: AcaoOperacional): Promise<TarefaVisao> {
    const { contexto, db } = this.db();
    const tarefa = await this.carregar(db, taskId);
    await exigirOperarPipe(db, contexto, tarefa.pipeId);

    const plano = planejarOperacional(acao, tarefa.lifecycleState, tarefa.archiveState);
    if (plano.tipo === 'bloqueado_arquivada')
      throw new ConflictException({ motivo: 'TAREFA_ARQUIVADA' });
    if (plano.tipo === 'idempotente') return tarefa;

    const { transicao } = plano;
    let atualizada: TarefaVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.task.updateMany({
          where: { id: taskId, lifecycleState: tarefa.lifecycleState, archiveState: 'ATIVA' },
          data: { lifecycleState: transicao.target },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, taskId, transicao.evento, transicao.resumo);
        await this.emitirDominio(
          tx,
          contexto,
          tarefa.pipeId,
          taskId,
          acao === 'concluir' ? 'TASK_COMPLETED' : 'TASK_REOPENED',
        );
        return tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: SELECT_TAREFA,
        }) as Promise<TarefaVisao>;
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('transição concorrente; reconsulte e repita');
      throw err;
    }
    return this.finalizarTransicao(
      contexto,
      db,
      taskId,
      atualizada,
      transicao.target,
      'lifecycleState',
    );
  }

  private async transicaoArquivamento(
    taskId: string,
    acao: AcaoArquivamento,
  ): Promise<TarefaVisao> {
    const { contexto, db } = this.db();
    const tarefa = await this.carregar(db, taskId);
    await exigirOperarPipe(db, contexto, tarefa.pipeId);

    const plano = planejarArquivamento(acao, tarefa.archiveState);
    if (plano.tipo === 'idempotente') return tarefa;

    const { transicao } = plano;
    let atualizada: TarefaVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.task.updateMany({
          where: { id: taskId, archiveState: tarefa.archiveState },
          data: { archiveState: transicao.target },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, taskId, transicao.evento, transicao.resumo);
        await this.emitirDominio(
          tx,
          contexto,
          tarefa.pipeId,
          taskId,
          acao === 'arquivar' ? 'TASK_ARCHIVED' : 'TASK_RESTORED',
        );
        return tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: SELECT_TAREFA,
        }) as Promise<TarefaVisao>;
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('transição concorrente; reconsulte e repita');
      throw err;
    }
    return this.finalizarTransicao(
      contexto,
      db,
      taskId,
      atualizada,
      transicao.target,
      'archiveState',
    );
  }

  /** Desfecho comum de uma transição: reconsulta idempotente vs 409 na perda de corrida; audita no sucesso. */
  private async finalizarTransicao(
    contexto: ContextoOrganizacional,
    db: Db,
    taskId: string,
    atualizada: TarefaVisao | null,
    alvo: string,
    coluna: 'lifecycleState' | 'archiveState',
  ): Promise<TarefaVisao> {
    if (!atualizada) {
      const agora = await db.task.findUnique({ where: { id: taskId }, select: SELECT_TAREFA });
      if (agora && (agora as TarefaVisao)[coluna] === alvo) return agora as TarefaVisao;
      throw new ConflictException('o estado da Tarefa mudou concorrentemente; reconsulte e repita');
    }
    this.auditar(contexto, 'update', 'Task');
    this.auditar(contexto, 'create', 'TaskHistory');
    return atualizada;
  }

  // ─────────────────────────────────────────────────────────────── HELPERS ──

  private eventoResponsavel(
    anterior: string | null,
    novo: string | null,
  ): { evento: string; resumo: string } {
    if (novo === null) return { evento: 'RESPONSAVEL_REMOVED', resumo: 'Responsável removido' };
    if (anterior === null)
      return { evento: 'RESPONSAVEL_ASSIGNED', resumo: 'Responsável atribuído' };
    return { evento: 'RESPONSAVEL_CHANGED', resumo: 'Responsável alterado' };
  }

  /** Escreve um evento no `TaskHistory` DENTRO da transação corrente (append-only). */
  private evento(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    contexto: ContextoOrganizacional,
    taskId: string,
    type: string,
    summary: string,
  ): Promise<unknown> {
    return tx.taskHistory.create({
      data: { orgId: contexto.orgId, taskId, type, summary, actorId: contexto.accountId },
    });
  }

  /**
   * Emite o Evento canônico de domínio (`TASK_*`, catálogo 4.3) no MESMO `tx` do fato (AD-13, Story 5.7) — o
   * outbox `DomainEvent` que o motor de Automação (E4) drena. `correlationId` = `randomUUID()` (cada mutação é
   * um fato distinto; complete→reopen→complete não colide no `eventId`); `actorId` = o iniciador humano; NÃO há
   * emissão automática além destes pontos. Quem drena é o motor existente (não há draining síncrono aqui).
   */
  private emitirDominio(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    contexto: ContextoOrganizacional,
    pipeId: string,
    taskId: string,
    eventType:
      | 'TASK_CREATED'
      | 'TASK_COMPLETED'
      | 'TASK_REOPENED'
      | 'TASK_ARCHIVED'
      | 'TASK_RESTORED'
      | 'TASK_RESPONSIBLE_CHANGED',
  ): Promise<unknown> {
    return emitirEventoDeDominio(tx, contexto, {
      eventType,
      pipeId,
      resourceType: 'TASK',
      resourceId: taskId,
      actorId: contexto.accountId,
      origin: 'USER',
      occurredAt: new Date(),
      correlationId: randomUUID(),
    });
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca PII/valores. */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId,
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
