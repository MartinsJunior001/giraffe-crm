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
import { exigirOperarPipe } from '../pipes/pipe-authz';
import {
  planejarArquivamento,
  planejarOperacional,
  podeEscrever,
  type AcaoArquivamento,
  type AcaoOperacional,
  type EstadoArquivamento,
  type EstadoOperacional,
} from './solicitacao-lifecycle.transitions';
import type { CriarSolicitacaoDTO, EditarSolicitacaoDTO } from './solicitacoes.dto';

type Db = ReturnType<typeof withTenantContext>;

/** A Solicitação como sai pela API interna (`orgId` FORA da fronteira; nunca vaza). */
export interface SolicitacaoVisao {
  id: string;
  pipeId: string;
  cardId: string | null;
  title: string;
  description: string | null;
  responsavelMembershipId: string | null;
  creatorMembershipId: string | null;
  lifecycleState: EstadoOperacional;
  archiveState: EstadoArquivamento;
}

const SELECT_SOLICITACAO = {
  id: true,
  pipeId: true,
  cardId: true,
  title: true,
  description: true,
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
 * Ciclo de vida e Responsável da Solicitação (Story 5.2). Twin de `TasksService` (5.1) SEM o eixo temporal
 * (não há prazo/atrasada/dueVersion). Entidade DISTINTA (não reusa Card/Registro/Task); reusa a AUTORIZAÇÃO
 * por Pipe (`pipe-authz.ts`) e os PADRÕES da base (tx interativa no client raiz com `definirContextoOrg`,
 * guarda otimista, auditoria manual). Toda query passa por `withTenantContext` — nenhum `where orgId` manual;
 * `orgId` nunca vem do cliente.
 *
 * **Autorização (matriz canônica 1.6; C3 congelado):** criar/editar/resolver/reabrir/arquivar/restaurar/
 * atribuir-Responsável/vincular exigem **operar o Pipe** (`exigirOperarPipe` — Admin da Org/Admin do Pipe/
 * Membro operam; Viewer → 403; sem acesso → 404 não-enumerante). A leitura fica no `SolicitacoesReadService`.
 *
 * **Arquivada = somente-leitura integral (§1546):** editar/Responsável/vínculo sob arquivamento → 409
 * `SOLICITACAO_ARQUIVADA`; só `restaurar` sai desse estado.
 *
 * **Atomicidade/auditoria:** cada mutação escreve seu evento no `SolicitacaoHistory` na MESMA transação
 * interativa no client raiz (`definirContextoOrg`) — não há mudança sem evento (AD-13). Guarda otimista onde
 * há transição de estado; P2002/P2028 → 409, nunca 500.
 */
@Injectable()
export class SolicitacoesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
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

  /** Carrega a Solicitação sob RLS ou 404 não-enumerante. */
  private async carregar(db: Db, solicitacaoId: string): Promise<SolicitacaoVisao> {
    const s = await db.solicitacao.findUnique({
      where: { id: solicitacaoId },
      select: SELECT_SOLICITACAO,
    });
    if (!s) throw new NotFoundException();
    return s as SolicitacaoVisao;
  }

  /**
   * Valida que um `cardId` (não nulo) pertence ao MESMO Pipe/Org da Solicitação — sob RLS (um Card de outra
   * Org é invisível → 404). O vínculo NÃO amplia acesso (§1544): só se confere pertencimento, nunca `valores`.
   */
  private async validarCardDoPipe(db: Db, cardId: string, pipeId: string): Promise<void> {
    const card = await db.card.findUnique({
      where: { id: cardId },
      select: { id: true, pipeId: true },
    });
    if (!card) throw new NotFoundException(); // cross-tenant/inexistente → 404 não-enumerante
    if (card.pipeId !== pipeId) {
      throw new BadRequestException('o Card deve pertencer ao mesmo Pipe da Solicitação');
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

  async criar(pipeId: string, dto: CriarSolicitacaoDTO): Promise<SolicitacaoVisao> {
    const { contexto, db } = this.db();
    await exigirOperarPipe(db, contexto, pipeId); // 404 sem acesso; 403 se só lê

    if (dto.cardId !== null) await this.validarCardDoPipe(db, dto.cardId, pipeId);
    if (dto.responsavelMembershipId !== null) {
      await this.validarMembershipAtiva(db, dto.responsavelMembershipId);
    }
    const creatorMembershipId = await this.membershipDoPrincipal(db, contexto);

    const solicitacaoId = randomUUID();
    let criada: SolicitacaoVisao;
    try {
      criada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        await tx.solicitacao.create({
          data: {
            id: solicitacaoId,
            orgId: contexto.orgId,
            pipeId,
            cardId: dto.cardId,
            title: dto.title,
            description: dto.description,
            responsavelMembershipId: dto.responsavelMembershipId,
            creatorMembershipId,
            lifecycleState: 'ABERTA',
            archiveState: 'ATIVA',
          },
        });
        await this.evento(tx, contexto, solicitacaoId, 'CREATED', 'Solicitação criada');
        return tx.solicitacao.findUniqueOrThrow({
          where: { id: solicitacaoId },
          select: SELECT_SOLICITACAO,
        }) as Promise<SolicitacaoVisao>;
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('conflito ao criar a Solicitação; repita');
      throw err;
    }
    this.auditar(contexto, 'create', 'Solicitacao');
    this.auditar(contexto, 'create', 'SolicitacaoHistory');
    return criada;
  }

  // ────────────────────────────────────────────────────────────── EDITAR ──

  async editar(solicitacaoId: string, dto: EditarSolicitacaoDTO): Promise<SolicitacaoVisao> {
    const { contexto, db } = this.db();
    const solicitacao = await this.carregar(db, solicitacaoId);
    await exigirOperarPipe(db, contexto, solicitacao.pipeId);
    if (!podeEscrever(solicitacao.archiveState)) {
      throw new ConflictException({ motivo: 'SOLICITACAO_ARQUIVADA' });
    }

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;

    let atualizada: SolicitacaoVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        // Guarda otimista: só edita se ainda está ATIVA (defesa contra arquivamento concorrente).
        const { count } = await tx.solicitacao.updateMany({
          where: { id: solicitacaoId, archiveState: 'ATIVA' },
          data,
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, solicitacaoId, 'EDITED', 'Solicitação editada');
        return tx.solicitacao.findUniqueOrThrow({
          where: { id: solicitacaoId },
          select: SELECT_SOLICITACAO,
        }) as Promise<SolicitacaoVisao>;
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('edição concorrente; reconsulte e repita');
      throw err;
    }
    if (!atualizada) throw new ConflictException({ motivo: 'SOLICITACAO_ARQUIVADA' });
    this.auditar(contexto, 'update', 'Solicitacao');
    return atualizada;
  }

  // ─────────────────────────────────────────────────────────── RESPONSÁVEL ──

  async atribuirResponsavel(solicitacaoId: string, novo: string | null): Promise<SolicitacaoVisao> {
    const { contexto, db } = this.db();
    const solicitacao = await this.carregar(db, solicitacaoId);
    await exigirOperarPipe(db, contexto, solicitacao.pipeId);
    if (!podeEscrever(solicitacao.archiveState)) {
      throw new ConflictException({ motivo: 'SOLICITACAO_ARQUIVADA' });
    }
    if (novo !== null) await this.validarMembershipAtiva(db, novo);

    const anterior = solicitacao.responsavelMembershipId;
    if (anterior === novo) return solicitacao; // idempotente — sem escrita, sem evento

    const { evento, resumo } = this.eventoResponsavel(anterior, novo);
    let atualizada: SolicitacaoVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.solicitacao.updateMany({
          where: { id: solicitacaoId, responsavelMembershipId: anterior, archiveState: 'ATIVA' },
          data: { responsavelMembershipId: novo },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, solicitacaoId, evento, resumo);
        return tx.solicitacao.findUniqueOrThrow({
          where: { id: solicitacaoId },
          select: SELECT_SOLICITACAO,
        }) as Promise<SolicitacaoVisao>;
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('atribuição concorrente; reconsulte e repita');
      throw err;
    }
    if (!atualizada)
      throw new ConflictException('o Responsável mudou concorrentemente; reconsulte e repita');
    this.auditar(contexto, 'update', 'Solicitacao');
    return atualizada;
  }

  // ──────────────────────────────────────────────────────────── VÍNCULO CARD ──

  async vincularCard(solicitacaoId: string, novoCardId: string | null): Promise<SolicitacaoVisao> {
    const { contexto, db } = this.db();
    const solicitacao = await this.carregar(db, solicitacaoId);
    await exigirOperarPipe(db, contexto, solicitacao.pipeId);
    if (!podeEscrever(solicitacao.archiveState)) {
      throw new ConflictException({ motivo: 'SOLICITACAO_ARQUIVADA' });
    }
    if (novoCardId !== null) await this.validarCardDoPipe(db, novoCardId, solicitacao.pipeId);

    const anterior = solicitacao.cardId;
    if (anterior === novoCardId) return solicitacao; // idempotente

    const evento = novoCardId === null ? 'CARD_UNLINKED' : 'CARD_LINKED';
    const resumo = novoCardId === null ? 'Card desvinculado' : 'Card vinculado';
    let atualizada: SolicitacaoVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.solicitacao.updateMany({
          where: { id: solicitacaoId, cardId: anterior, archiveState: 'ATIVA' },
          data: { cardId: novoCardId },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, solicitacaoId, evento, resumo);
        return tx.solicitacao.findUniqueOrThrow({
          where: { id: solicitacaoId },
          select: SELECT_SOLICITACAO,
        }) as Promise<SolicitacaoVisao>;
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('vínculo concorrente; reconsulte e repita');
      throw err;
    }
    if (!atualizada)
      throw new ConflictException('o vínculo mudou concorrentemente; reconsulte e repita');
    this.auditar(contexto, 'update', 'Solicitacao');
    return atualizada;
  }

  // ──────────────────────────────────────────── CICLO OPERACIONAL / ARQUIVAR ──

  resolver(solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.transicaoOperacional(solicitacaoId, 'resolver');
  }
  reabrir(solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.transicaoOperacional(solicitacaoId, 'reabrir');
  }
  arquivar(solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.transicaoArquivamento(solicitacaoId, 'arquivar');
  }
  restaurar(solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.transicaoArquivamento(solicitacaoId, 'restaurar');
  }

  private async transicaoOperacional(
    solicitacaoId: string,
    acao: AcaoOperacional,
  ): Promise<SolicitacaoVisao> {
    const { contexto, db } = this.db();
    const solicitacao = await this.carregar(db, solicitacaoId);
    await exigirOperarPipe(db, contexto, solicitacao.pipeId);

    const plano = planejarOperacional(acao, solicitacao.lifecycleState, solicitacao.archiveState);
    if (plano.tipo === 'bloqueado_arquivada')
      throw new ConflictException({ motivo: 'SOLICITACAO_ARQUIVADA' });
    if (plano.tipo === 'idempotente') return solicitacao;

    const { transicao } = plano;
    let atualizada: SolicitacaoVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.solicitacao.updateMany({
          where: {
            id: solicitacaoId,
            lifecycleState: solicitacao.lifecycleState,
            archiveState: 'ATIVA',
          },
          data: { lifecycleState: transicao.target },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, solicitacaoId, transicao.evento, transicao.resumo);
        return tx.solicitacao.findUniqueOrThrow({
          where: { id: solicitacaoId },
          select: SELECT_SOLICITACAO,
        }) as Promise<SolicitacaoVisao>;
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('transição concorrente; reconsulte e repita');
      throw err;
    }
    return this.finalizarTransicao(
      contexto,
      db,
      solicitacaoId,
      atualizada,
      transicao.target,
      'lifecycleState',
    );
  }

  private async transicaoArquivamento(
    solicitacaoId: string,
    acao: AcaoArquivamento,
  ): Promise<SolicitacaoVisao> {
    const { contexto, db } = this.db();
    const solicitacao = await this.carregar(db, solicitacaoId);
    await exigirOperarPipe(db, contexto, solicitacao.pipeId);

    const plano = planejarArquivamento(acao, solicitacao.archiveState);
    if (plano.tipo === 'idempotente') return solicitacao;

    const { transicao } = plano;
    let atualizada: SolicitacaoVisao | null;
    try {
      atualizada = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const { count } = await tx.solicitacao.updateMany({
          where: { id: solicitacaoId, archiveState: solicitacao.archiveState },
          data: { archiveState: transicao.target },
        });
        if (count === 0) return null;
        await this.evento(tx, contexto, solicitacaoId, transicao.evento, transicao.resumo);
        return tx.solicitacao.findUniqueOrThrow({
          where: { id: solicitacaoId },
          select: SELECT_SOLICITACAO,
        }) as Promise<SolicitacaoVisao>;
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('transição concorrente; reconsulte e repita');
      throw err;
    }
    return this.finalizarTransicao(
      contexto,
      db,
      solicitacaoId,
      atualizada,
      transicao.target,
      'archiveState',
    );
  }

  /** Desfecho comum de uma transição: reconsulta idempotente vs 409 na perda de corrida; audita no sucesso. */
  private async finalizarTransicao(
    contexto: ContextoOrganizacional,
    db: Db,
    solicitacaoId: string,
    atualizada: SolicitacaoVisao | null,
    alvo: string,
    coluna: 'lifecycleState' | 'archiveState',
  ): Promise<SolicitacaoVisao> {
    if (!atualizada) {
      const agora = await db.solicitacao.findUnique({
        where: { id: solicitacaoId },
        select: SELECT_SOLICITACAO,
      });
      if (agora && (agora as SolicitacaoVisao)[coluna] === alvo) return agora as SolicitacaoVisao;
      throw new ConflictException(
        'o estado da Solicitação mudou concorrentemente; reconsulte e repita',
      );
    }
    this.auditar(contexto, 'update', 'Solicitacao');
    this.auditar(contexto, 'create', 'SolicitacaoHistory');
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

  /** Escreve um evento no `SolicitacaoHistory` DENTRO da transação corrente (append-only). */
  private evento(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    contexto: ContextoOrganizacional,
    solicitacaoId: string,
    type: string,
    summary: string,
  ): Promise<unknown> {
    return tx.solicitacaoHistory.create({
      data: { orgId: contexto.orgId, solicitacaoId, type, summary, actorId: contexto.accountId },
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
