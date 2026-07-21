import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { MembershipRole } from '../../../generated/prisma';
import { RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { withTenantContext } from '../../kernel/db/tenant-context';
import {
  type ConflitoConvite,
  type EstadoMembershipAlvo,
  calcularExpiracao,
  decidirCriacao,
  emailValido,
  normalizarEmail,
} from './invite-core';
import { InviteRateLimit } from './invite-rate-limit';
import { emitirToken } from './invite-token';
import { TRANSACTIONAL_EMAIL_PORT, type TransactionalEmailPort } from './transactional-email.port';
import { getEnv } from '../../kernel/config/env';

/** O que um Convite expõe pela API — NUNCA o token nem o hash. `orgId` fora da fronteira. */
export interface ConviteVisao {
  id: string;
  email: string;
  role: MembershipRole;
  state: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: Date;
  createdAt: Date;
}

const SELECT_VISAO = {
  id: true,
  email: true,
  role: true,
  state: true,
  expiresAt: true,
  createdAt: true,
} as const;

/** Erro de conflito de domínio — o controller traduz em 409 com o motivo. */
export class ConflitoConviteError extends Error {
  constructor(readonly motivo: ConflitoConvite | 'NAO_CANCELAVEL') {
    super(motivo);
    this.name = 'ConflitoConviteError';
  }
}

/**
 * Ciclo do Convite (Story 8.2): criar, reenviar, cancelar. Compõe os componentes já verificados
 * (`invite-core` puro, `invite-token`, `InviteRateLimit`, `TransactionalEmailPort`) — SEM duplicar
 * regra. A Organização vem do CONTEXTO (nunca do cliente); toda query passa por `withTenantContext`.
 *
 * **Fronteira transacional (contrato G1):** a persistência é uma escrita única sob contexto (que já
 * emite a auditoria estruturada via `MODELOS_AUDITADOS`, sem PII/token). O e-mail é enviado **depois**
 * do commit, pela porta — nunca se segura transação durante o HTTP ao provedor, nem se envia antes de
 * persistir. Falha de entrega **não** desfaz o Convite (estado de entrega ≠ estado do Convite): o
 * Convite segue `PENDING`, a falha é observável e o reenvio a recupera.
 */
@Injectable()
export class InvitesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly rateLimit: InviteRateLimit,
    @Inject(TRANSACTIONAL_EMAIL_PORT) private readonly email: TransactionalEmailPort,
    private readonly logger: PinoLogger,
  ) {}

  private ctx() {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Cria um Convite PENDING (7 dias). Ordem: validar formato → conflito de Membership → rate limit →
   * persistir (unicidade "1 PENDING" imposta pelo índice PARCIAL, não por leitura-antes-de-escrever)
   * → enviar e-mail após o commit.
   */
  async criar(emailBruto: string, role: MembershipRole): Promise<ConviteVisao> {
    const { contexto, db } = this.ctx();

    if (!emailValido(emailBruto)) throw new BadRequestException({ motivo: 'EMAIL_INVALIDO' });
    const normalizedEmail = normalizarEmail(emailBruto);

    // Conflito de Membership + pendente existente (regra pura em invite-core).
    const membership = await this.estadoMembershipAlvo(db, normalizedEmail);
    const pendente = await db.invite.findFirst({
      where: { normalizedEmail, state: 'PENDING' },
      select: { id: true },
    });
    const decisao = decidirCriacao(membership, pendente !== null);
    if (decisao.tipo === 'conflito') throw new ConflitoConviteError(decisao.motivo);

    // Rate limits ANTES da emissão (fail-closed). Lança RateLimitExcedidoError → 429 no controller.
    await this.rateLimit.cobrar({
      orgId: contexto.orgId,
      adminAccountId: contexto.accountId,
      normalizedEmail,
    });

    const token = emitirToken();
    const agora = new Date();

    // Persistência sob contexto (auto-auditada). A corrida de 2 PENDING simultâneos cai no índice
    // parcial → P2002 → 409 (nunca lost update silencioso).
    let criado: ConviteVisao;
    try {
      criado = await db.invite.create({
        data: {
          orgId: contexto.orgId,
          normalizedEmail,
          email: emailBruto.trim(),
          role,
          state: 'PENDING',
          tokenHash: token.hash,
          expiresAt: calcularExpiracao(agora),
          lastSentAt: agora,
          invitedByAccountId: contexto.accountId,
        },
        select: SELECT_VISAO,
      });
    } catch (err) {
      // Corrida: outro PENDING para o mesmo par foi criado entre a checagem e o INSERT.
      if (this.ehUniqueViolation(err)) throw new ConflitoConviteError('CONVITE_PENDENTE_EXISTE');
      throw err;
    }

    await this.enviar(criado, token.bruto);
    return criado;
  }

  /**
   * Reenvia: rotaciona o token (invalida o anterior no ato — o hash é substituído), reinicia os 7
   * dias, mantém PENDING. Cooldown de 60s + limites G2 cobrados antes. Não-enumerante: Convite de
   * outra Org / inexistente → 404.
   */
  async reenviar(inviteId: string): Promise<ConviteVisao> {
    const { contexto, db } = this.ctx();

    const atual = await db.invite.findFirst({
      where: { id: inviteId },
      select: { id: true, state: true, normalizedEmail: true },
    });
    if (!atual) throw new NotFoundException();
    if (atual.state !== 'PENDING') throw new ConflitoConviteError('NAO_CANCELAVEL');

    await this.rateLimit.cobrar({
      orgId: contexto.orgId,
      adminAccountId: contexto.accountId,
      normalizedEmail: atual.normalizedEmail,
      inviteId,
    });

    const token = emitirToken();
    const agora = new Date();
    // Guarda otimista pelo estado: só rotaciona se ainda PENDING (evita corrida cancelar×reenviar).
    const r = await db.invite.updateMany({
      where: { id: inviteId, state: 'PENDING' },
      data: { tokenHash: token.hash, expiresAt: calcularExpiracao(agora), lastSentAt: agora },
    });
    if (r.count === 0) throw new ConflitoConviteError('NAO_CANCELAVEL');

    const visao = await db.invite.findFirstOrThrow({
      where: { id: inviteId },
      select: SELECT_VISAO,
    });
    await this.enviar(visao, token.bruto);
    return visao;
  }

  /**
   * Cancela/revoga: PENDING → CANCELLED (invalida o token — o lookup de aceite exige PENDING).
   * Idempotente: já CANCELLED → no-op (sem emitir updateMany, para não gravar falso `denied` na
   * auditoria). Terminal não-cancelável (ACCEPTED/EXPIRED) → 409.
   */
  async cancelar(inviteId: string): Promise<ConviteVisao> {
    const { db } = this.ctx();

    const atual = await db.invite.findFirst({
      where: { id: inviteId },
      select: { id: true, state: true },
    });
    if (!atual) throw new NotFoundException();
    if (atual.state === 'CANCELLED') {
      return db.invite.findFirstOrThrow({ where: { id: inviteId }, select: SELECT_VISAO });
    }
    if (atual.state !== 'PENDING') throw new ConflitoConviteError('NAO_CANCELAVEL');

    const r = await db.invite.updateMany({
      where: { id: inviteId, state: 'PENDING' },
      data: { state: 'CANCELLED' },
    });
    if (r.count === 0) throw new ConflitoConviteError('NAO_CANCELAVEL');

    this.logger.info({ event: 'invite.cancelado', inviteId }, 'convite cancelado');
    return db.invite.findFirstOrThrow({ where: { id: inviteId }, select: SELECT_VISAO });
  }

  /** Estado de Membership do e-mail na Org atual (Account é global; Membership é org-scoped). */
  private async estadoMembershipAlvo(
    db: ReturnType<typeof withTenantContext>,
    normalizedEmail: string,
  ): Promise<EstadoMembershipAlvo> {
    // Account é GLOBAL (sem RLS); o runtime tem SELECT. Busca por e-mail único.
    const conta = await this.prisma.account.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (!conta) return 'NONE';
    const m = await db.membership.findFirst({
      where: { accountId: conta.id },
      select: { state: true },
    });
    if (!m) return 'NONE';
    return m.state; // 'ACTIVE' | 'SUSPENDED' | 'REMOVED'
  }

  /**
   * Envia o e-mail APÓS a persistência, pela porta. Falha NÃO desfaz o Convite (estado de entrega ≠
   * estado do Convite). O link vem só de `APP_PUBLIC_URL`; o token vai na URL, JAMAIS em log.
   */
  private async enviar(convite: ConviteVisao, tokenBruto: string): Promise<void> {
    const env = getEnv();
    const link = `${env.APP_PUBLIC_URL ?? ''}/convite/${tokenBruto}`;
    const org = await this.prisma.organization.findUnique({
      where: { id: this.requestContext.obter().orgId },
      select: { name: true },
    });
    const nomeOrg = org?.name ?? 'sua Organização';

    const resultado = await this.email.enviar({
      para: convite.email,
      assunto: `Convite para ${nomeOrg}`,
      texto: montarTexto(nomeOrg, link, convite.expiresAt),
      html: montarHtml(nomeOrg, link, convite.expiresAt),
      // Idempotência de ENTREGA por Convite + hash do token corrente (um retry não duplica; um
      // reenvio, com token novo, é um e-mail novo). Nunca usa o token bruto na chave.
      idempotencyKey: `invite:${convite.id}:${convite.expiresAt.getTime()}`,
    });

    if (resultado.estado === 'falhou') {
      // Observável e recuperável: o Convite segue PENDING; o reenvio tenta de novo. Sem token em log.
      this.logger.warn(
        { event: 'invite.entrega_falhou', inviteId: convite.id, codigo: resultado.erro.codigo },
        'falha na entrega do convite — permanece PENDING, reenvio disponível',
      );
    }
  }

  private ehUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
  }
}

/** Template mínimo — texto. Link só de APP_PUBLIC_URL; validade e aviso de segurança. */
function montarTexto(org: string, link: string, expiraEm: Date): string {
  return [
    `Você foi convidado para ${org}.`,
    ``,
    `Aceite pelo link (válido até ${expiraEm.toISOString()}):`,
    link,
    ``,
    `Se você não esperava este convite, ignore este e-mail. O link é de uso único e expira.`,
  ].join('\n');
}

/** Template mínimo — HTML. Sem imagem externa, sem token em atributo de rastreio. */
function montarHtml(org: string, link: string, expiraEm: Date): string {
  return [
    `<p>Você foi convidado para <strong>${escapar(org)}</strong>.</p>`,
    `<p><a href="${escapar(link)}">Aceitar o convite</a> (válido até ${expiraEm.toISOString()}).</p>`,
    `<p>Se você não esperava este convite, ignore este e-mail. O link é de uso único e expira.</p>`,
  ].join('');
}

/** Escapa o mínimo para o HTML do template (org é dado interno, mas defesa em profundidade). */
function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
