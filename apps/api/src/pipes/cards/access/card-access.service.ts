import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  type ContextoOrganizacional,
  RequestContext,
} from '../../../kernel/context/request-context';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../../kernel/db/tenant-context';
import {
  exigirGerenciarPipe,
  exigirOperarCard,
  resolverAcessoDaMembership,
} from '../../pipe-authz';

type Db = ReturnType<typeof withTenantContext>;

/** O Responsável corrente de um Card (`orgId` fora da fronteira). */
export interface ResponsavelVisao {
  cardId: string;
  membershipId: string;
  state: string;
  createdAt: Date;
}

/** Uma concessão direta de acesso a um Card. */
export interface ConcessaoVisao {
  id: string;
  cardId: string;
  membershipId: string;
  podeLer: boolean;
  podeOperar: boolean;
  podeMover: boolean;
  state: string;
}

/**
 * Conflito de concorrência (→ 409), simétrico ao `isConflitoDeSubmissao` da 2.7:
 * - **P2002**: violação de um índice PARCIAL de unicidade ativa (1 Responsável ativo por Card; 1 concessão ativa
 *   por (Card, pessoa)) — duas operações simultâneas; o banco barrou a segunda.
 * - **P2028**: a transação interativa expirou sob contenção no MESMO índice. Ainda é a mesma corrida — tratá-la
 *   como conflito (o cliente repete) é honesto; deixá-la virar 500 esconderia a corrida atrás de "erro interno".
 */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Acesso, Responsável e concessões de Card (Story 2.10) — fecha o DBT-2.2-ROLE-DORMENTE (operação por concessão).
 *
 * **Responsável** (`atribuir`/`remover`) é ATRIBUIÇÃO operacional, não papel: exige que o **alvo** já tenha acesso
 * operacional prévio ao Card (SC-2101) e **não amplia** acesso (SC-2102). Chave por `membershipId`. Autorização do
 * autor: **operar o Card** (`exigirOperarCard` — mais restrito que operar o Pipe: um Membro "restrito ao próprio"
 * não mexe em Cards que não acessa).
 *
 * **Concessão direta** (`conceder`/`revogar`) dá acesso a UM Card específico (Observador = ler; operacional =
 * operar [+`podeMover`]), escopo limitado àquele Card (SC-2103/2104), nunca lista/config do Pipe. Autorização do
 * autor: **gerenciar o Pipe** (`exigirGerenciarPipe`) — conceder acesso a outrem é ação de gestão.
 *
 * **Atomicidade**: cada mutação escreve o dado + um evento `CardHistory` na MESMA transação (AD-13), como a 2.7 —
 * transação interativa no client raiz com contexto transaction-local (`definirContextoOrg`), com auditoria manual
 * (FR-214), pois esse caminho não passa pela extensão. **Sem DELETE**: revogar/remover é `state`, nunca exclusão.
 */
@Injectable()
export class CardAccessService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  // ── Responsável ──────────────────────────────────────────────────────────────────────────────

  /**
   * Atribui (ou troca) o Responsável de um Card. 404 se o Card não existe/sem acesso; 403 se o autor não pode
   * operar o Card; **400** se o alvo não tem acesso operacional prévio (SC-2101 — atribuir não concede acesso);
   * **409** sob concorrência. Idempotente: reatribuir a MESMA pessoa que já é Responsável atual é no-op.
   */
  async atribuirResponsavel(cardId: string, membershipId: string): Promise<ResponsavelVisao> {
    const { contexto, db } = this.db();
    await exigirOperarCard(db, contexto, cardId); // 404 sem acesso; 403 se só lê

    // SC-2101: o alvo precisa JÁ ter acesso operacional ao Card. Atribuir Responsável NÃO amplia acesso.
    const acessoAlvo = await resolverAcessoDaMembership(db, membershipId, cardId);
    if (!acessoAlvo || !acessoAlvo.podeOperar) {
      throw new BadRequestException('o alvo não tem acesso operacional a este Card');
    }

    const atual = await db.cardResponsavel.findFirst({
      where: { cardId, state: 'ACTIVE' },
      select: { id: true, membershipId: true },
    });
    if (atual && atual.membershipId === membershipId) {
      // Já é o Responsável atual → idempotente, sem novo evento.
      return this.lerResponsavel(cardId);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Troca: remove o Responsável atual (state → REMOVED) antes de inserir o novo (respeita o índice parcial).
        if (atual) {
          await tx.cardResponsavel.update({
            where: { id: atual.id },
            data: { state: 'REMOVED', removedAt: new Date() },
          });
        }

        await tx.cardResponsavel.create({
          data: { orgId: contexto.orgId, cardId, membershipId, state: 'ACTIVE' },
        });

        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: atual ? 'RESPONSAVEL_CHANGED' : 'RESPONSAVEL_ASSIGNED',
            summary: atual ? 'Responsável do Card alterado' : 'Responsável do Card atribuído',
            actorId: contexto.accountId ?? null,
          },
        });
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('atribuição concorrente em andamento; repita a requisição');
      }
      throw err;
    }

    this.auditar(contexto, 'update', 'CardResponsavel');
    this.auditar(contexto, 'create', 'CardHistory');
    return this.lerResponsavel(cardId);
  }

  /**
   * Remove o Responsável de um Card (`state → REMOVED`). 404/403 como `atribuir`. Idempotente: sem Responsável
   * atual, não faz nada (nem evento).
   */
  async removerResponsavel(cardId: string): Promise<{ removido: boolean }> {
    const { contexto, db } = this.db();
    await exigirOperarCard(db, contexto, cardId);

    const atual = await db.cardResponsavel.findFirst({
      where: { cardId, state: 'ACTIVE' },
      select: { id: true },
    });
    if (!atual) return { removido: false }; // idempotente

    await this.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, contexto)) await p;
      await tx.cardResponsavel.update({
        where: { id: atual.id },
        data: { state: 'REMOVED', removedAt: new Date() },
      });
      await tx.cardHistory.create({
        data: {
          orgId: contexto.orgId,
          cardId,
          type: 'RESPONSAVEL_REMOVED',
          summary: 'Responsável do Card removido',
          actorId: contexto.accountId ?? null,
        },
      });
    });

    this.auditar(contexto, 'update', 'CardResponsavel');
    this.auditar(contexto, 'create', 'CardHistory');
    return { removido: true };
  }

  /** Lê o Responsável atual de um Card (ou `null`). Autorização: LER o Card. */
  async verResponsavel(cardId: string): Promise<ResponsavelVisao | null> {
    const { contexto, db } = this.db();
    await exigirOperarCard(db, contexto, cardId); // ver a atribuição é operação (não leitura pública)
    return db.cardResponsavel
      .findFirst({
        where: { cardId, state: 'ACTIVE' },
        select: { cardId: true, membershipId: true, state: true, createdAt: true },
      })
      .then((r) => r ?? null);
  }

  // ── Concessão direta ─────────────────────────────────────────────────────────────────────────

  /**
   * Concede (ou atualiza) acesso direto de uma pessoa a UM Card. Observador = só ler; operacional = `podeOperar`
   * [+`podeMover`]. 404 se o Card não existe/sem acesso; 403 se o autor não gerencia o Pipe; **409** sob
   * concorrência. Reconceder à mesma pessoa ATUALIZA as capacidades (uma concessão ativa por (Card, pessoa)).
   */
  async conceder(
    cardId: string,
    dto: { membershipId: string; podeOperar: boolean; podeMover: boolean },
  ): Promise<ConcessaoVisao> {
    const { contexto, db } = this.db();
    await exigirLerCardEGerenciarPipe(db, contexto, cardId);

    // O alvo precisa ser uma Membership ATIVA da MESMA Organização (RLS garante o isolamento; aqui, existência
    // + estado). Conceder acesso a um vínculo suspenso/removido deixaria uma concessão dormente sem sentido — e o
    // `pipe-grants` (2.2) já recusa o mesmo caso. 400: o recurso da rota é o Card (existe); o corpo é que está errado.
    const alvo = await db.membership.findFirst({
      where: { id: dto.membershipId },
      select: { state: true },
    });
    if (!alvo || alvo.state !== 'ACTIVE') {
      throw new BadRequestException('membershipId não é uma Membership ativa desta Organização');
    }

    const existente = await db.cardGrant.findFirst({
      where: { cardId, membershipId: dto.membershipId, state: 'ACTIVE' },
      select: { id: true },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        if (existente) {
          await tx.cardGrant.update({
            where: { id: existente.id },
            data: { podeLer: true, podeOperar: dto.podeOperar, podeMover: dto.podeMover },
          });
        } else {
          await tx.cardGrant.create({
            data: {
              orgId: contexto.orgId,
              cardId,
              membershipId: dto.membershipId,
              podeLer: true,
              podeOperar: dto.podeOperar,
              podeMover: dto.podeMover,
            },
          });
        }

        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId,
            type: 'ACCESS_GRANTED',
            summary: 'Acesso direto ao Card concedido',
            actorId: contexto.accountId ?? null,
          },
        });
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('concessão concorrente em andamento; repita a requisição');
      }
      throw err;
    }

    this.auditar(contexto, existente ? 'update' : 'create', 'CardGrant');
    this.auditar(contexto, 'create', 'CardHistory');
    return this.lerConcessao(cardId, dto.membershipId);
  }

  /**
   * Revoga a concessão direta de uma pessoa a um Card (`state → REVOKED`). 404/403 como `conceder`. Idempotente:
   * sem concessão ativa, não faz nada (nem evento).
   */
  async revogar(cardId: string, membershipId: string): Promise<{ revogado: boolean }> {
    const { contexto, db } = this.db();
    await exigirLerCardEGerenciarPipe(db, contexto, cardId);

    const ativa = await db.cardGrant.findFirst({
      where: { cardId, membershipId, state: 'ACTIVE' },
      select: { id: true },
    });
    if (!ativa) return { revogado: false }; // idempotente

    await this.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, contexto)) await p;
      await tx.cardGrant.update({
        where: { id: ativa.id },
        data: { state: 'REVOKED', revokedAt: new Date() },
      });
      await tx.cardHistory.create({
        data: {
          orgId: contexto.orgId,
          cardId,
          type: 'ACCESS_REVOKED',
          summary: 'Acesso direto ao Card revogado',
          actorId: contexto.accountId ?? null,
        },
      });
    });

    this.auditar(contexto, 'update', 'CardGrant');
    this.auditar(contexto, 'create', 'CardHistory');
    return { revogado: true };
  }

  /** Lista as concessões ATIVAS de um Card. Autorização: gerenciar o Pipe (ver quem tem acesso é gestão). */
  async listarConcessoes(cardId: string): Promise<ConcessaoVisao[]> {
    const { contexto, db } = this.db();
    await exigirLerCardEGerenciarPipe(db, contexto, cardId);
    return db.cardGrant.findMany({
      where: { cardId, state: 'ACTIVE' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SELECT_CONCESSAO,
    });
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  private async lerResponsavel(cardId: string): Promise<ResponsavelVisao> {
    const { db } = this.db();
    const r = await db.cardResponsavel.findFirst({
      where: { cardId, state: 'ACTIVE' },
      select: { cardId: true, membershipId: true, state: true, createdAt: true },
    });
    if (!r) throw new ConflictException('estado inconsistente do Responsável');
    return r;
  }

  private async lerConcessao(cardId: string, membershipId: string): Promise<ConcessaoVisao> {
    const { db } = this.db();
    const g = await db.cardGrant.findFirst({
      where: { cardId, membershipId, state: 'ACTIVE' },
      select: SELECT_CONCESSAO,
    });
    if (!g) throw new ConflictException('estado inconsistente da concessão');
    return g;
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca dados de titular. */
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

const SELECT_CONCESSAO = {
  id: true,
  cardId: true,
  membershipId: true,
  podeLer: true,
  podeOperar: true,
  podeMover: true,
  state: true,
} as const;

/**
 * Gate de conceder/revogar/listar: exige que o Card exista e seja acessível (404 não-enumerante) E que o autor
 * **gerencie o Pipe** dono do Card (403). Carrega o Card sob RLS para obter o `pipeId` antes de resolver o poder
 * no Pipe — nunca confia num `pipeId` do cliente.
 */
async function exigirLerCardEGerenciarPipe(
  db: Db,
  contexto: ContextoOrganizacional,
  cardId: string,
): Promise<{ pipeId: string }> {
  const card = await db.card.findUnique({ where: { id: cardId }, select: { pipeId: true } });
  if (!card) throw new NotFoundException();
  await exigirGerenciarPipe(db, contexto, card.pipeId);
  return { pipeId: card.pipeId };
}
