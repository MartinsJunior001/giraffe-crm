import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../db/prisma.service';
import { AUTH, type Auth } from './auth.tokens';
import { validarPoliticaSenha } from './password-policy';
import {
  SECURITY_NOTIFICATION_PORT,
  type SecurityNotificationPort,
} from './security-notification.port';
import { StepUpService, type SessaoAtual } from './step-up.service';

/** O que a troca devolve — contagens observáveis, jamais senha/hash/token. */
export interface TrocaSenhaResultado {
  readonly sessoesRevogadas: number;
  readonly recuperacoesInvalidadas: number;
}

/**
 * Troca AUTENTICADA da própria senha (Story 1.12), exigindo step-up recente.
 *
 * Sequência (fail-closed):
 *  1. **Gate de step-up** — sem reautenticação recente válida para ESTA sessão → 403 STEP_UP_REQUIRED.
 *  2. **Política central** — a nova senha passa por `validarPoliticaSenha` (o validador ÚNICO). Fraca → 400.
 *  3. **Troca só a própria Account** — o hash é gerado pelo MÓDULO DE SENHA do Better Auth
 *     (`auth.$context.password.hash`, o mesmo algoritmo do login/seed) e gravado em `AuthCredential`
 *     do próprio titular. A escrita é do runtime (GRANT UPDATE em `AuthCredential`), não do Better Auth.
 *  4. **Preserva a sessão atual, revoga as demais** — apaga toda `AuthSession` do titular EXCETO a
 *     corrente. `cookieCache` está desabilitado (ver `auth.factory`), então a revogação é imediata.
 *  5. **Invalida recuperação pendente** — apaga os tokens `reset-password:<token>` (value = accountId)
 *     do titular na `AuthVerification` (convenção real do Better Auth 1.6.23, ver nota abaixo).
 *  6. **Consome a janela de step-up** — uso único.
 *
 * Os passos 3–6 correm numa **única transação** do client raiz: ou a senha muda, as sessões caem, a
 * recuperação é invalidada e o step-up é consumido — ou nada disso acontece. `AuthCredential`,
 * `AuthSession` e `AuthVerification` são GLOBAIS (sem RLS, AD-10) — a fronteira é o GRANT, não a RLS.
 *
 * Depois do commit (não fatais): **notificação de segurança** (porta E5/1.13) e **trilha de auditoria**
 * sanitizada. A senha, o hash e qualquer token NUNCA entram em log, evento ou resposta.
 *
 * **Nota de contrato (recuperação):** o fluxo público de recuperação (Story 1.10) ainda NÃO está
 * ligado (`sendResetPassword` não configurado), então hoje não há tokens `reset-password:*` a apagar —
 * o DELETE casa zero linhas. Ele é REAL sobre o store REAL, com a convenção REAL do Better Auth: quando
 * 1.10 existir, esta invalidação já protege sem tocar aqui. Não é no-op fingido; é contrato reconciliado.
 */
@Injectable()
export class PasswordChangeService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
    private readonly stepUp: StepUpService,
    @Inject(SECURITY_NOTIFICATION_PORT)
    private readonly notificacao: SecurityNotificationPort,
    private readonly logger: PinoLogger,
  ) {}

  async trocarSenha(novaSenha: unknown, sessao: SessaoAtual): Promise<TrocaSenhaResultado> {
    // 1. Gate: step-up recente é PRÉ-condição. Ausente/expirado → 403 STEP_UP_REQUIRED.
    if (!(await this.stepUp.janelaValida(sessao))) {
      throw new ForbiddenException({ erro: 'STEP_UP_REQUIRED' });
    }

    // 2. Política central (validador único). Não ecoa a senha — só o motivo tipado.
    const veredito = validarPoliticaSenha(novaSenha);
    if (!veredito.ok) {
      throw new BadRequestException({ erro: 'SENHA_FRACA', motivo: veredito.motivo });
    }
    const senha = novaSenha as string; // garantido string pelo veredito ok

    // 3. Hash pelo módulo de senha do Better Auth (mesmo algoritmo do login). Nunca logado.
    const contexto = await this.auth.$context;
    const hash = await contexto.password.hash(senha);

    // 3–6. Uma transação atômica no client raiz (entidades globais, fronteira = GRANT).
    const identificadorStepUp = `step-up:${sessao.sessionId}`;
    const [, sessoes, recuperacoes] = await this.prisma.$transaction([
      // 3. Troca só a PRÓPRIA Account, só o provedor `credential`.
      this.prisma.authCredential.updateMany({
        where: { userId: sessao.accountId, providerId: 'credential' },
        data: { password: hash, updatedAt: new Date() },
      }),
      // 4. Revoga TODAS as demais sessões; preserva a atual (`id <> sessionId`).
      this.prisma.authSession.deleteMany({
        where: { userId: sessao.accountId, id: { not: sessao.sessionId } },
      }),
      // 5. Invalida recuperação pendente do titular (convenção do Better Auth: value = accountId).
      this.prisma.authVerification.deleteMany({
        where: { identifier: { startsWith: 'reset-password:' }, value: sessao.accountId },
      }),
      // 6. Consome a janela de step-up (uso único).
      this.prisma.authVerification.deleteMany({ where: { identifier: identificadorStepUp } }),
    ]);

    const resultado: TrocaSenhaResultado = {
      sessoesRevogadas: sessoes.count,
      recuperacoesInvalidadas: recuperacoes.count,
    };

    // Pós-commit, não fatais.
    await this.emitirNotificacao(sessao.accountId);
    this.auditar(sessao.accountId, resultado);

    return resultado;
  }

  private async emitirNotificacao(accountId: string): Promise<void> {
    try {
      await this.notificacao.notificarSeguranca({
        tipo: 'SENHA_ALTERADA',
        accountId,
        em: new Date().toISOString(),
      });
    } catch {
      // Observável e não fatal: a troca já está commitada. Sem senha/token no log.
      this.logger.warn(
        { event: 'security.notification.failed', accountId },
        'falha ao emitir notificação de segurança — troca de senha preservada',
      );
    }
  }

  /**
   * Trilha de auditoria sanitizada (FR-214), na mesma forma da extensão de tenant-context. `orgId` é
   * `null`: a senha é atributo GLOBAL da Account (AD-10), não pertence a uma Organização. NUNCA carrega
   * senha/hash/token — só o fato e as contagens.
   */
  private auditar(accountId: string, resultado: TrocaSenhaResultado): void {
    this.logger.info(
      {
        event: 'audit',
        actor: accountId,
        orgId: null,
        action: 'password.change',
        resource: 'AuthCredential',
        result: 'allowed',
        sessoesRevogadas: resultado.sessoesRevogadas,
        recuperacoesInvalidadas: resultado.recuperacoesInvalidadas,
        at: new Date().toISOString(),
      },
      'auditoria',
    );
  }
}
