import { ForbiddenException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { MembershipRole, MembershipState, Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import { capacidadesDoMembro, type CapacidadesMembro, conviteExpirado } from './roster.core';
import type { ConsultaConvites, ConsultaMembros } from './roster.dto';

type Db = ReturnType<typeof withTenantContext>;

/** Uma linha do roster de membros — visão do ADMIN (identidade + estado + ações permitidas). */
export interface MembroVisao {
  membershipId: string;
  accountId: string;
  name: string;
  /** E-mail do membro: finalidade legítima do roster administrativo (LGPD). Só na visão do Admin. */
  email: string;
  role: MembershipRole;
  state: MembershipState;
  createdAt: Date;
  capacidades: CapacidadesMembro;
}

/** Uma linha do roster de membros — visão REDUZIDA do MEMBRO comum (só ativas; nome/papel; sem e-mail/ações). */
export interface MembroReduzidoVisao {
  membershipId: string;
  name: string;
  role: MembershipRole;
}

/** Página do roster de membros. `visao` diz qual projeção veio (o Admin vê tudo; o Membro, o mínimo). */
export interface RosterMembrosVisao {
  visao: 'admin' | 'membro';
  membros: MembroVisao[] | MembroReduzidoVisao[];
  total: number;
  skip: number;
  take: number;
}

/** Uma linha do roster de Convites (Admin only). NUNCA expõe `tokenHash`/token. `orgId` fora da fronteira. */
export interface ConviteRosterVisao {
  id: string;
  email: string;
  role: MembershipRole;
  state: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
  /** EXPIRADO de fato: PENDING cujo prazo já passou (derivado na leitura — não há agendador). */
  expirado: boolean;
  expiresAt: Date;
  createdAt: Date;
}

/** Página do roster de Convites. */
export interface RosterConvitesVisao {
  convites: ConviteRosterVisao[];
  total: number;
  skip: number;
  take: number;
}

/** Projeção do Convite — a MESMA de `ConviteVisao` (8.2): id/email/role/state/expiresAt/createdAt. Sem token. */
const SELECT_CONVITE = {
  id: true,
  email: true,
  role: true,
  state: true,
  expiresAt: true,
  createdAt: true,
} as const;

/**
 * **Roster de membros e Convites (Story 8.7)** — superfície **somente leitura** sobre `Membership` e
 * `Invite` já materializados (8.2–8.6). **Sem migration, sem GRANT novo** (o runtime já lê via `SELECT`),
 * espelhando o rigor do Kanban read (2.9) e do Records read (3.5): projeção controlada, paginação com
 * teto, `orgId` fora da fronteira e autorização revalidada no servidor.
 *
 * **NÃO toca o write-side de `invites/`** (congelado): apenas LÊ os dados do Convite sob RLS.
 *
 * **Autorização (fina, no serviço — guard grosso `ler Organizacao`):**
 *  - roster de MEMBROS: Admin → visão plena; Membro → visão REDUZIDA (só ATIVAS, nome/papel, sem e-mail
 *    nem ações); **Convidado → 403** (não acessa);
 *  - roster de CONVITES: **só Admin** (o controller usa `administrar Organizacao`; o serviço reforça).
 *
 * Toda query passa por `withTenantContext` (isolamento é do banco — nenhum `where orgId` manual). `Account`
 * é GLOBAL (sem RLS): nome/e-mail vêm de um `findMany` por `id in [...]` — mas só de contas que TÊM
 * Membership nesta Org (o join é filtrado pela lista de `accountId` das Memberships já escopadas por RLS),
 * então uma conta de outra Org jamais vaza.
 */
@Injectable()
export class RosterReadService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Roster de membros. Admin → plena; Membro → reduzida; Convidado → 403. */
  async listarMembros(consulta: ConsultaMembros): Promise<RosterMembrosVisao> {
    const { contexto, db } = this.ctx();

    if (contexto.papel === 'GUEST') {
      // "Convidado não acessa" (AC-3). Guard `ler Organizacao` é o piso e deixa o Convidado passar;
      // a autoridade FINA nega aqui — deny-by-default, sem tocar `ability.ts` (C3 congelado).
      throw new ForbiddenException({ erro: 'ROSTER_INDISPONIVEL' });
    }

    return contexto.papel === 'ADMIN'
      ? this.listarMembrosAdmin(contexto, db, consulta)
      : this.listarMembrosReduzido(db, consulta);
  }

  /** Visão plena (Admin): todos os estados, e-mail e capacidades por linha. */
  private async listarMembrosAdmin(
    contexto: ContextoOrganizacional,
    db: Db,
    consulta: ConsultaMembros,
  ): Promise<RosterMembrosVisao> {
    // Busca por nome/e-mail (só Admin) resolve na `Account` GLOBAL → lista de `accountId`. A Membership
    // filtrada por `accountId in [...]` sob RLS garante que só membros DESTA Org aparecem.
    const restricaoBusca = await this.accountIdsPorBusca(consulta.busca, true);
    if (restricaoBusca?.length === 0) {
      return { visao: 'admin', membros: [], total: 0, skip: consulta.skip, take: consulta.take };
    }

    const where: Prisma.MembershipWhereInput = {
      ...(consulta.state ? { state: consulta.state } : {}),
      ...(consulta.role ? { role: consulta.role } : {}),
      ...(restricaoBusca ? { accountId: { in: restricaoBusca } } : {}),
    };

    const [total, adminsAtivos, linhas] = await Promise.all([
      db.membership.count({ where }),
      db.membership.count({ where: { role: 'ADMIN', state: 'ACTIVE' } }),
      db.membership.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: consulta.skip,
        take: consulta.take,
        select: { id: true, accountId: true, role: true, state: true, createdAt: true },
      }),
    ]);

    const contas = await this.contasPorId(linhas.map((l) => l.accountId));
    const membros: MembroVisao[] = linhas.map((l) => {
      const conta = contas.get(l.accountId);
      return {
        membershipId: l.id,
        accountId: l.accountId,
        name: conta?.name ?? '',
        email: conta?.email ?? '',
        role: l.role,
        state: l.state,
        createdAt: l.createdAt,
        capacidades: capacidadesDoMembro({
          role: l.role,
          state: l.state,
          ehProprio: l.accountId === contexto.accountId,
          adminsAtivos,
        }),
      };
    });

    return { visao: 'admin', membros, total, skip: consulta.skip, take: consulta.take };
  }

  /** Visão reduzida (Membro): só ATIVAS, nome/papel; sem e-mail, sem estado, sem capacidades. */
  private async listarMembrosReduzido(
    db: Db,
    consulta: ConsultaMembros,
  ): Promise<RosterMembrosVisao> {
    // Busca só por NOME (e-mail é "só Admin"). Estado é FORÇADO a ACTIVE (o Membro não vê suspensas/encerradas).
    const restricaoBusca = await this.accountIdsPorBusca(consulta.busca, false);
    if (restricaoBusca?.length === 0) {
      return { visao: 'membro', membros: [], total: 0, skip: consulta.skip, take: consulta.take };
    }

    const where: Prisma.MembershipWhereInput = {
      state: 'ACTIVE',
      ...(consulta.role ? { role: consulta.role } : {}),
      ...(restricaoBusca ? { accountId: { in: restricaoBusca } } : {}),
    };

    const [total, linhas] = await Promise.all([
      db.membership.count({ where }),
      db.membership.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: consulta.skip,
        take: consulta.take,
        select: { id: true, accountId: true, role: true },
      }),
    ]);

    const contas = await this.contasPorId(linhas.map((l) => l.accountId));
    const membros: MembroReduzidoVisao[] = linhas.map((l) => ({
      membershipId: l.id,
      name: contas.get(l.accountId)?.name ?? '',
      role: l.role,
    }));

    return { visao: 'membro', membros, total, skip: consulta.skip, take: consulta.take };
  }

  /** Roster de Convites (Admin only). Reforça a autoridade fina (o guard grosso já é `administrar`). */
  async listarConvites(consulta: ConsultaConvites): Promise<RosterConvitesVisao> {
    const { contexto, db } = this.ctx();
    if (contexto.papel !== 'ADMIN') {
      // Defesa em profundidade: o controller já exige `administrar Organizacao` (só Admin). Se um dia a
      // rota fosse afrouxada, esta guarda ainda nega — Convites nunca aparecem a não-Admin.
      throw new ForbiddenException({ erro: 'ROSTER_INDISPONIVEL' });
    }

    // Busca por e-mail do CONVITE (o e-mail vive na própria linha do Invite, não na Account).
    const where: Prisma.InviteWhereInput = {
      ...(consulta.state ? { state: consulta.state } : {}),
      ...(consulta.role ? { role: consulta.role } : {}),
      ...(consulta.busca ? { email: { contains: consulta.busca, mode: 'insensitive' } } : {}),
    };

    const [total, linhas] = await Promise.all([
      db.invite.count({ where }),
      db.invite.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: consulta.skip,
        take: consulta.take,
        select: SELECT_CONVITE,
      }),
    ]);

    const agora = new Date();
    const convites: ConviteRosterVisao[] = linhas.map((l) => ({
      id: l.id,
      email: l.email,
      role: l.role,
      state: l.state,
      expirado: conviteExpirado(l.state, l.expiresAt, agora),
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
    }));

    return { convites, total, skip: consulta.skip, take: consulta.take };
  }

  /**
   * Resolve `accountId`s que casam com o termo de busca, na `Account` GLOBAL (SELECT-only). Retorna:
   *  - `undefined` quando não há busca (sem restrição — o `where` da Membership não ganha `accountId`);
   *  - lista (possivelmente vazia) de ids quando há busca. Vazia ⇒ zero resultados por construção.
   *
   * `comEmail` liga a busca por e-mail (só Admin). A restrição real de tenant é da Membership (RLS): um
   * `accountId` de outra Org que case aqui simplesmente não terá Membership nesta Org e some no join.
   */
  private async accountIdsPorBusca(
    busca: string | undefined,
    comEmail: boolean,
  ): Promise<string[] | undefined> {
    if (!busca) return undefined;
    const or: Prisma.AccountWhereInput[] = [{ name: { contains: busca, mode: 'insensitive' } }];
    if (comEmail) or.push({ email: { contains: busca, mode: 'insensitive' } });
    // `Account` é GLOBAL (sem RLS): lê-se pelo client base. Só devolve `id` — nunca projeta a conta inteira.
    const contas = await this.prisma.account.findMany({ where: { OR: or }, select: { id: true } });
    return contas.map((c) => c.id);
  }

  /** Lê nome/e-mail das contas (GLOBAL, SELECT-only) para as Memberships da página — só os ids necessários. */
  private async contasPorId(ids: string[]): Promise<Map<string, { name: string; email: string }>> {
    if (ids.length === 0) return new Map();
    const contas = await this.prisma.account.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    return new Map(contas.map((c) => [c.id, { name: c.name, email: c.email }]));
  }
}
