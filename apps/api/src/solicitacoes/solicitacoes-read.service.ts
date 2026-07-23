import { Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';
import { resolverPoderNoPipe } from '../pipes/pipe-authz';
import type { EstadoArquivamento, EstadoOperacional } from './solicitacao-lifecycle.transitions';

type Db = ReturnType<typeof withTenantContext>;

/** Uma Solicitação na leitura: estado persistido + validade do Responsável (recomputada). Sem eixo temporal. */
export interface SolicitacaoLeituraVisao {
  id: string;
  pipeId: string;
  cardId: string | null;
  title: string;
  description: string | null;
  responsavelMembershipId: string | null;
  /** O Responsável ainda é uma Membership ACTIVE? Nunca confia silenciosamente numa referência inválida. */
  responsavelValido: boolean;
  creatorMembershipId: string | null;
  lifecycleState: EstadoOperacional;
  archiveState: EstadoArquivamento;
}

const SELECT = {
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

const TETO_PAGINA = 100;

/**
 * Leitura de Solicitações (Story 5.2) — twin de `TasksReadService` (5.1) SEM `atrasada` (não há eixo
 * temporal). Espelha o rigor do Kanban read (2.9): autz por acesso de LEITURA (`resolverPoderNoPipe` —
 * qualquer poder; ler ≠ operar; sem acesso → 404 não-enumerante), projeção controlada (`orgId` fora da
 * fronteira). A validade do Responsável é recomputada (a referência nunca é confiada em silêncio — §1546).
 */
@Injectable()
export class SolicitacoesReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Lista as Solicitações de um Pipe (ATIVAS por padrão; `incluirArquivadas` opcional). Teto 100 por página. */
  async listar(
    pipeId: string,
    opcoes: { incluirArquivadas?: boolean; take?: number; skip?: number } = {},
  ): Promise<{ solicitacoes: SolicitacaoLeituraVisao[]; total: number }> {
    const { contexto, db } = this.db();
    await resolverPoderNoPipe(db, contexto, pipeId); // qualquer poder; 404 não-enumerante sem acesso

    const take = Math.min(Math.max(opcoes.take ?? TETO_PAGINA, 1), TETO_PAGINA);
    const skip = Math.max(opcoes.skip ?? 0, 0);
    const where = {
      pipeId,
      ...(opcoes.incluirArquivadas ? {} : { archiveState: 'ATIVA' as const }),
    };

    const [linhas, total] = await Promise.all([
      db.solicitacao.findMany({
        where,
        select: SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
      }),
      db.solicitacao.count({ where }),
    ]);

    const validade = await this.validadeResponsaveis(
      db,
      linhas.map((l) => l.responsavelMembershipId),
    );
    return { solicitacoes: linhas.map((l) => this.montar(l, validade)), total };
  }

  /** Detalhe de UMA Solicitação. Resolve o Pipe dono e exige acesso de leitura a ele. */
  async obter(solicitacaoId: string): Promise<SolicitacaoLeituraVisao> {
    const { contexto, db } = this.db();
    const s = await db.solicitacao.findUnique({ where: { id: solicitacaoId }, select: SELECT });
    if (!s) throw new NotFoundException();
    await resolverPoderNoPipe(db, contexto, s.pipeId); // 404 não-enumerante sem acesso ao Pipe

    const validade = await this.validadeResponsaveis(db, [s.responsavelMembershipId]);
    return this.montar(s, validade);
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
      responsavelMembershipId: string | null;
      creatorMembershipId: string | null;
      lifecycleState: string;
      archiveState: string;
    },
    responsaveisAtivos: Set<string>,
  ): SolicitacaoLeituraVisao {
    return {
      id: l.id,
      pipeId: l.pipeId,
      cardId: l.cardId,
      title: l.title,
      description: l.description,
      responsavelMembershipId: l.responsavelMembershipId,
      responsavelValido:
        l.responsavelMembershipId !== null && responsaveisAtivos.has(l.responsavelMembershipId),
      creatorMembershipId: l.creatorMembershipId,
      lifecycleState: l.lifecycleState as EstadoOperacional,
      archiveState: l.archiveState as EstadoArquivamento,
    };
  }
}
