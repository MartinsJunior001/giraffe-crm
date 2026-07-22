import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../db/prisma.service';
import { RateLimiter } from '../antiabuso/rate-limit';
import { AUTH, type Auth } from './auth.tokens';

/**
 * Step-up por REAUTENTICAÇÃO RECENTE (Story 1.12, D-1) — capacidade reutilizável.
 *
 * A ideia, tal como ratificada em D-1: antes de uma operação sensível, o titular **revalida a senha
 * atual** (reusando o Better Auth — `auth.api.verifyPassword`, que confere a senha da PRÓPRIA sessão
 * sem criar sessão nova). O sucesso **sela** um estado de step-up, **ligado à Account + à sessão
 * atual** e **só server-side**, válido por uma janela curta. Enquanto a janela vale, as operações
 * sensíveis podem prosseguir sem re-perguntar a senha; fora dela, elas exigem step-up (403).
 *
 * **Onde vive o estado.** Na tabela `AuthVerification` (a mesma do Better Auth para tokens de curta
 * duração), sob um identificador com NAMESPACE próprio — `step-up:<sessionId>` — que não colide com
 * os do Better Auth (`reset-password:…`, verificação de e-mail). Isso liga o step-up à SESSÃO: revogar
 * a sessão (logout, troca de senha) descola qualquer step-up que dependesse dela. É a mesma tabela e o
 * mesmo GRANT (SELECT/INSERT/UPDATE/DELETE) que o runtime já possui — **sem migration**. `AuthVerification`
 * é GLOBAL (sem RLS), como `Account`/`AuthSession` (AD-10): opera pelo client raiz, fora de `withTenantContext`.
 *
 * **Nunca em log.** O estado não é um segredo (é um marcador temporal), mas nem a senha, nem o valor
 * do marcador, nem o token de sessão jamais são registrados.
 *
 * Consumidores: a troca autenticada de senha (1.12) e as operações administrativas sensíveis (E8) —
 * todas passam pelo mesmo gate `janelaValida`, sem um segundo sistema de autenticação.
 */

/** Janela de validade do step-up (D-1: 10 minutos). */
export const STEP_UP_JANELA_MS = 10 * 60 * 1000;

/** Baseline antiabuso de D-1: ≤ 5 FALHAS por (Account+IP) em 15 min → 429. */
export const STEP_UP_MAX_FALHAS = 5;
export const STEP_UP_JANELA_ANTIABUSO_MS = 15 * 60 * 1000;

/** Namespace do identificador na `AuthVerification` — isola o step-up dos tokens do Better Auth. */
const IDENT_PREFIXO = 'step-up:';

/** A sessão atual, resolvida da sessão validada no servidor. Nunca de header/corpo do cliente. */
export interface SessaoAtual {
  readonly accountId: string;
  readonly sessionId: string;
}

/** Erro de reautenticação: rate limit estourado (429) ou senha incorreta (401 não-enumerante). */
export type FalhaStepUp = { tipo: 'RATE_LIMIT' } | { tipo: 'SENHA_INCORRETA' };

@Injectable()
export class StepUpService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
    private readonly rateLimiter: RateLimiter,
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Resolve a sessão atual (Account + id da sessão) a partir dos headers da requisição — usando o
   * MESMO caminho do `SessaoPrincipalProvider`: a sessão validada pelo Better Auth, e nada mais.
   * `null` = sem sessão (o controller traduz em 401).
   */
  async sessaoAtual(headers: IncomingHttpHeaders): Promise<SessaoAtual | null> {
    const sessao = await this.auth.api.getSession({ headers: paraHeaders(headers) });
    const accountId = sessao?.user?.id;
    const sessionId = (sessao?.session as { id?: string } | undefined)?.id;
    if (typeof accountId !== 'string' || typeof sessionId !== 'string') return null;
    return { accountId, sessionId };
  }

  /**
   * Revalida a senha atual e, em caso de sucesso, SELA a janela de step-up para a sessão.
   *
   * Fluxo (fail-closed): confere a senha via Better Auth → se inválida, conta a falha (Account+IP) e
   * devolve `RATE_LIMIT` (se estourou) ou `SENHA_INCORRETA` (não-enumerante); se válida, grava o
   * marcador `step-up:<sessionId>` com expiração `now + 10min`. Nunca registra a senha.
   *
   * O contador de falhas só é incrementado no CAMINHO DE FALHA — um step-up bem-sucedido não gasta
   * orçamento, então reautenticações legítimas repetidas (várias operações sensíveis em sequência)
   * nunca são barradas. É por isso que D-1 conta FALHAS, não tentativas.
   */
  async reautenticar(
    headers: IncomingHttpHeaders,
    senhaAtual: unknown,
    sessao: SessaoAtual,
    ip: string | undefined,
  ): Promise<{ ok: true } | { ok: false; falha: FalhaStepUp }> {
    const valida = await this.senhaConfere(headers, senhaAtual);

    if (!valida) {
      const chave = `stepup:${sessao.accountId}:${ip ?? 'sem-ip'}`;
      const { excedido } = await this.rateLimiter.contar(chave, {
        janelaMs: STEP_UP_JANELA_ANTIABUSO_MS,
        teto: STEP_UP_MAX_FALHAS,
      });
      this.logger.warn(
        { event: 'auth.step_up.failed', accountId: sessao.accountId, rateLimited: excedido },
        'reautenticação (step-up) falhou',
      );
      return { ok: false, falha: { tipo: excedido ? 'RATE_LIMIT' : 'SENHA_INCORRETA' } };
    }

    await this.selarJanela(sessao.sessionId, sessao.accountId);
    this.logger.info(
      { event: 'auth.step_up.sealed', accountId: sessao.accountId },
      'step-up selado',
    );
    return { ok: true };
  }

  /**
   * Há step-up VÁLIDO para esta sessão agora? Gate consumido pela troca de senha (e, no E8, pelas
   * operações administrativas sensíveis). Confere identificador (sessão), titular (Account) e
   * expiração — os três, senão um marcador de outra sessão/conta valeria.
   */
  async janelaValida(sessao: SessaoAtual): Promise<boolean> {
    const linha = await this.prisma.authVerification.findFirst({
      where: {
        identifier: IDENT_PREFIXO + sessao.sessionId,
        value: sessao.accountId,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    return linha !== null;
  }

  /** Consome (invalida) a janela — o step-up é de uso único por operação sensível. */
  async consumirJanela(sessionId: string): Promise<void> {
    await this.prisma.authVerification.deleteMany({
      where: { identifier: IDENT_PREFIXO + sessionId },
    });
  }

  /** Confere a senha atual pela API do Better Auth. Nunca lança por senha incorreta — devolve `false`. */
  private async senhaConfere(headers: IncomingHttpHeaders, senha: unknown): Promise<boolean> {
    if (typeof senha !== 'string' || senha.length === 0) return false;
    try {
      // Better Auth 1.6.23: `verifyPassword` devolve `{ status: true }` no acerto e LANÇA APIError
      // (INVALID_PASSWORD) no erro — os dois casos convergem para o mesmo veredito booleano aqui.
      const r = (await this.auth.api.verifyPassword({
        body: { password: senha },
        headers: paraHeaders(headers),
      })) as { status?: boolean } | null;
      return r?.status === true;
    } catch {
      // `verifyPassword` lança APIError para senha incorreta (e para conta sem credencial). Em ambos
      // os casos, o veredito é o mesmo: não confere. Não distinguir é o que mantém a resposta neutra.
      return false;
    }
  }

  /** Grava o marcador `step-up:<sessionId>` (value = accountId) com expiração de 10 min, atomicamente. */
  private async selarJanela(sessionId: string, accountId: string): Promise<void> {
    const identifier = IDENT_PREFIXO + sessionId;
    const agora = new Date();
    const expiresAt = new Date(agora.getTime() + STEP_UP_JANELA_MS);
    // Reautenticar reinicia a janela: apaga o marcador anterior e grava um novo, numa transação.
    await this.prisma.$transaction([
      this.prisma.authVerification.deleteMany({ where: { identifier } }),
      this.prisma.authVerification.create({
        data: { id: randomUUID(), identifier, value: accountId, expiresAt, updatedAt: agora },
      }),
    ]);
  }
}

/** Converte os headers do Node para o `Headers` web que o Better Auth consome (preserva repetidos). */
function paraHeaders(brutos: IncomingHttpHeaders): Headers {
  const headers = new Headers();
  for (const [nome, valor] of Object.entries(brutos)) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) for (const v of valor) headers.append(nome, v);
    else headers.append(nome, valor);
  }
  return headers;
}
