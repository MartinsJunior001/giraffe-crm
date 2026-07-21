import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type MembershipRole, Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg } from '../../kernel/db/tenant-context';
import { normalizarEmail, validarParaAceite } from './invite-core';
import { hashToken } from './invite-token';
import { InviteAcceptRateLimit } from './invite-accept-rate-limit';
import { InviteRouteResolver } from './invite-route.resolver';
import {
  INVITE_ACCEPTED_NOTIFICATION_PORT,
  type InviteAcceptedNotificationPort,
} from './notification.port';

/** O que o aceite devolve — a Membership recém-ativada. NUNCA token/hash; expõe a Org à qual se juntou. */
export interface AceiteVisao {
  orgId: string;
  membershipId: string;
  role: MembershipRole;
  state: 'ACTIVE';
}

/** Conflito de concorrência (P2002 da unique de Membership / P2028 timeout) → caminho idempotente/409. */
function isConflito(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Aceite de Convite e ativação da Membership (Story 8.3).
 *
 * Fluxo (fail-closed, não-enumerante): hash do token → resolve `orgId` pela `InviteRoute` GLOBAL
 * (pré-contexto) → entra em `withTenantContext(orgId)` numa transação INTERATIVA no client raiz
 * (`definirContextoOrg`, molde de 2.7/2.8/3.4) e **RELÊ o Convite sob RLS** (a AUTORIDADE). Valida
 * identidade (e-mail verificado casando `normalizedEmail`) e estado (`validarParaAceite`, reúso 8.2),
 * **consome o token atomicamente** (`updateMany where state='PENDING'`) e ativa a Membership — tudo na
 * MESMA transação (AD-13). Idempotente por construção; concorrência resolve por guarda otimista +
 * `@@unique([accountId, orgId])`; P2002/P2028 → idempotente/409, **nunca 500**.
 *
 * A Org e o papel saem SÓ do Convite; a Account, SÓ da sessão — nada de elevação vinda do cliente.
 * `Invite`/`Membership` correm no client raiz (fora da extensão auto-auditada) → auditoria MANUAL
 * (FR-214), sem token/PII. A Notificação `convite aceito` é PÓS-commit, só no primeiro consumo.
 */
@Injectable()
export class InviteAcceptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rota: InviteRouteResolver,
    private readonly rateLimit: InviteAcceptRateLimit,
    @Inject(INVITE_ACCEPTED_NOTIFICATION_PORT)
    private readonly notificacao: InviteAcceptedNotificationPort,
    private readonly logger: PinoLogger,
  ) {}

  async aceitar(
    tokenBruto: string,
    accountId: string,
    ip: string | undefined,
  ): Promise<AceiteVisao> {
    const tokenHash = hashToken(tokenBruto);

    // 0. Rate limit (fail-closed) ANTES de qualquer resolução — throttla brute-force de token por IP e
    // por hash. Lança RateLimitExcedidoError → 429 + Retry-After no controller.
    await this.rateLimit.cobrar(ip, tokenHash);

    // 1. Resolução de tenant PRÉ-contexto (global, só dica). Ausente → 404 uniforme.
    const orgId = await this.rota.resolverOrg(tokenHash);
    if (!orgId) throw new NotFoundException();

    // 2. Identidade da sessão (Account é GLOBAL; o runtime tem SELECT). Sessão órfã → 401.
    const conta = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { email: true, emailVerified: true },
    });
    if (!conta) throw new UnauthorizedException();

    const contexto = { orgId, accountId };

    // 3. Transação interativa no client raiz, com contexto — RELÊ sob RLS e decide tudo atomicamente.
    let resultado: { visao: AceiteVisao; primeiro: boolean; inviteId: string };
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // RELEITURA sob RLS = a autoridade. Rota envenenada/obsoleta não acha o Convite → 404.
        const convite = await tx.invite.findUnique({
          where: { tokenHash },
          select: { id: true, role: true, state: true, expiresAt: true, normalizedEmail: true },
        });
        if (!convite) throw new NotFoundException();

        // Identidade: e-mail verificado E casando o destinatário. O requerente POSSUI o token, logo
        // 403 (não 404) — não é enumeração; é "você tem o link, mas está logado como outra pessoa".
        if (!conta.emailVerified) throw new ForbiddenException({ motivo: 'EMAIL_NAO_VERIFICADO' });
        if (normalizarEmail(conta.email) !== convite.normalizedEmail) {
          throw new ForbiddenException({ motivo: 'IDENTIDADE_INCOMPATIVEL' });
        }

        const validade = validarParaAceite(convite.state, convite.expiresAt, new Date());
        if (!validade.ok) {
          // Idempotência: já ACEITO por esta MESMA conta, com Membership ATIVA → sucesso repetível.
          const idem = await this.idempotente(tx, convite.state, accountId, orgId, convite.role);
          if (idem) return { visao: idem, primeiro: false, inviteId: convite.id };
          throw new NotFoundException(); // expirado/revogado/usado por outro → 404 uniforme
        }

        // Consumo ATÔMICO do token (guarda otimista): só transiciona se ainda PENDING.
        const consumo = await tx.invite.updateMany({
          where: { id: convite.id, state: 'PENDING' },
          data: { state: 'ACCEPTED' },
        });
        if (consumo.count === 0) {
          // Corrida cancelar×aceitar / duplo aceite: reavalia idempotência, senão 404.
          const rec = await tx.invite.findUnique({
            where: { id: convite.id },
            select: { state: true },
          });
          const idem = rec
            ? await this.idempotente(tx, rec.state, accountId, orgId, convite.role)
            : null;
          if (idem) return { visao: idem, primeiro: false, inviteId: convite.id };
          throw new NotFoundException();
        }

        // Ativa a Membership. Se falhar (ex.: SUSPENDED), a exceção FAZ ROLLBACK — o token volta a
        // PENDING (nunca fica consumido sem Membership).
        const visao = await this.ativarMembership(tx, accountId, orgId, convite.role);
        return { visao, primeiro: true, inviteId: convite.id };
      });
    } catch (err) {
      if (isConflito(err)) {
        // Retry concorrente: o outro venceu. Relê fora de tx para o caminho idempotente/409.
        const idem = await this.idempotenteForaDeTx(accountId, orgId);
        if (idem) return idem;
        throw new ConflictException({ motivo: 'ACEITE_CONCORRENTE' });
      }
      throw err;
    }

    // Auditoria manual (client raiz não passa pela extensão auto-auditada), só no primeiro consumo.
    if (resultado.primeiro) {
      this.auditar(contexto, 'update', 'Invite');
      this.auditar(contexto, 'create', 'Membership');
      // Notificação PÓS-commit, pela porta (contrato de E5/5.6). Falha aqui não desfaz o aceite.
      await this.emitirNotificacao(resultado.visao, resultado.inviteId, accountId);
    }
    return resultado.visao;
  }

  /** Sucesso idempotente: Convite já ACCEPTED e ESTA conta já tem Membership ATIVA na Org. */
  private async idempotente(
    tx: Prisma.TransactionClient,
    estado: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED',
    accountId: string,
    orgId: string,
    roleConvite: MembershipRole,
  ): Promise<AceiteVisao | null> {
    if (estado !== 'ACCEPTED') return null;
    const m = await tx.membership.findUnique({
      where: { accountId_orgId: { accountId, orgId } },
      select: { id: true, state: true, role: true },
    });
    if (!m || m.state !== 'ACTIVE') return null;
    return { orgId, membershipId: m.id, role: m.role ?? roleConvite, state: 'ACTIVE' };
  }

  /** Idempotência no caminho de conflito (P2002/P2028), fora da transação que abortou. */
  private async idempotenteForaDeTx(accountId: string, orgId: string): Promise<AceiteVisao | null> {
    const m = await this.prisma.membership.findUnique({
      where: { accountId_orgId: { accountId, orgId } },
      select: { id: true, state: true, role: true },
    });
    if (!m || m.state !== 'ACTIVE') return null;
    return { orgId, membershipId: m.id, role: m.role, state: 'ACTIVE' };
  }

  /**
   * Ativa a Membership sobre o `@@unique([accountId, orgId])` CHEIO: sem linha → cria ACTIVE com o papel
   * do Convite; `REMOVED` → reativa (UPDATE→ACTIVE, papel do Convite; NÃO restaura concessões antigas);
   * `ACTIVE` → idempotente (o token já foi consumido, devolve a existente, papel preservado);
   * `SUSPENDED` → 409 (reativar é a 8.5, não o aceite) — a exceção reverte o consumo do token.
   */
  private async ativarMembership(
    tx: Prisma.TransactionClient,
    accountId: string,
    orgId: string,
    role: MembershipRole,
  ): Promise<AceiteVisao> {
    const existente = await tx.membership.findUnique({
      where: { accountId_orgId: { accountId, orgId } },
      select: { id: true, state: true, role: true },
    });

    if (!existente) {
      const criada = await tx.membership.create({
        data: { accountId, orgId, role, state: 'ACTIVE' },
        select: { id: true, role: true },
      });
      return { orgId, membershipId: criada.id, role: criada.role, state: 'ACTIVE' };
    }
    if (existente.state === 'REMOVED') {
      await tx.membership.update({
        where: { id: existente.id },
        data: { state: 'ACTIVE', role },
      });
      return { orgId, membershipId: existente.id, role, state: 'ACTIVE' };
    }
    if (existente.state === 'ACTIVE') {
      return { orgId, membershipId: existente.id, role: existente.role, state: 'ACTIVE' };
    }
    // SUSPENDED
    throw new ConflictException({ motivo: 'MEMBERSHIP_SUSPENSA' });
  }

  private async emitirNotificacao(
    visao: AceiteVisao,
    inviteId: string,
    destinatarioAccountId: string,
  ): Promise<void> {
    try {
      await this.notificacao.registrarConviteAceito({
        orgId: visao.orgId,
        inviteId,
        membershipId: visao.membershipId,
        destinatarioAccountId,
        role: visao.role,
      });
    } catch {
      // Observável e não fatal: o aceite já está commitado. Sem token/PII no log.
      this.logger.warn(
        { event: 'notification.convite_aceito.falhou', inviteId, orgId: visao.orgId },
        'falha ao registrar a notificação de convite aceito — aceite preservado',
      );
    }
  }

  /** Trilha de auditoria manual (FR-214) — a mesma forma da extensão, sem token/PII. */
  private auditar(
    contexto: { orgId: string; accountId: string },
    action: string,
    resource: string,
  ) {
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
      'audit',
    );
  }
}
