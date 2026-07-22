import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AbilityCache } from '../../kernel/authz/ability.cache';
import { StepUpService } from '../../kernel/auth/step-up.service';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { pipeGrantsIncompativeisConvidado } from '../../pipes/grants/pipe-grant-ceiling';
import {
  derivarEventId,
  type MembershipRole,
  planejarAlteracaoPapel,
  planejarRevogacaoIncompativel,
} from './membership-role.core';

/** Papéis de Pipe lidos para o teto do Convidado (espelha `PipeRole`). */
type PapelPipe = 'ADMIN' | 'MEMBER' | 'VIEWER';

/** O que a alteração devolve pela API interna. `orgId` fica FORA da fronteira; nunca vaza. */
export interface AlteracaoPapelVisao {
  id: string;
  role: MembershipRole;
  previousRole: MembershipRole;
  /** Concessões `DatabaseGrant` revogadas por incompatibilidade com o novo papel (AD-9). */
  revokedDatabaseGrants: readonly string[];
}

/** Conflito de concorrência (→ 409): P2002/P2028 da tx interativa sob contenção. */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

const SELECT_ALVO = { id: true, accountId: true, role: true, state: true } as const;

/**
 * Alteração de papel da Membership (Story 8.4) — pela AUTORIDADE do Admin da Organização, com step-up,
 * proteção ATÔMICA do último Admin, evento canônico e invalidação imediata de abilities.
 *
 * **Autorização:** só o Admin da Org (a rota exige `administrar Organizacao` no guard; aqui, defesa em
 * profundidade). O alvo cross-tenant é invisível sob RLS → 404 não-enumerante.
 *
 * **Step-up (D-1):** promover→Admin e rebaixar Admin exigem janela de step-up recente (reusa a 1.12).
 * Sem sessão/janela → **403 STEP_UP_REQUIRED**. Trocas entre não-Admins NÃO exigem step-up.
 *
 * **Último Admin (D-2):** contagem otimista NÃO basta. A alteração que reduz Admins abre transação,
 * **bloqueia a linha da `Organization` com `SELECT … FOR UPDATE`**, RELÊ os Admins ativos e o alvo
 * DENTRO da tx (anti-TOCTOU), revalida o invariante e só então aplica — evento + revogações na MESMA
 * transação. Rebaixar o último Admin → **409 LAST_ADMIN_PROTECTED**. Duas alterações concorrentes
 * serializam pelo lock: uma vence, a outra vê 1 Admin e é barrada.
 *
 * **Sessões/abilities (D-3):** ao mudar o papel, invalida a ability em cache do ALVO na Org afetada
 * (`AbilityCache.invalidar`). O contexto RELÊ a Membership ACTIVE a cada requisição, então a próxima
 * requisição do alvo já respeita o novo papel (deny-by-default). NÃO se revoga a Account globalmente:
 * outras Organizações permanecem intactas.
 *
 * **Evento/auditoria:** cada alteração escreve um `MembershipEvent` (`ROLE_CHANGED`, papel de→para,
 * ator) na MESMA transação (append-only) e uma linha de auditoria (FR-214). Minimização LGPD: nunca
 * senha/token/sessão/e-mail/corpo HTTP.
 */
@Injectable()
export class MembershipRoleService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly stepUp: StepUpService,
    private readonly abilityCache: AbilityCache,
    private readonly logger: PinoLogger,
  ) {}

  async alterarPapel(
    membershipId: string,
    novoPapel: MembershipRole,
    headers: IncomingHttpHeaders,
  ): Promise<AlteracaoPapelVisao> {
    const contexto = this.requestContext.obter();
    // Defesa em profundidade: a rota já exige `administrar Organizacao` (Admin da Org). Se, por
    // regressão, um não-Admin chegasse aqui, o papel do contexto (Membership ACTIVE) ainda barra.
    if (contexto.papel !== 'ADMIN') throw new ForbiddenException();

    const db = withTenantContext(this.prisma, contexto, this.logger);

    // Alvo sob RLS: outra Org é invisível → `null` → 404 não-enumerante (não confirma existência).
    const alvo = await db.membership.findUnique({
      where: { id: membershipId },
      select: SELECT_ALVO,
    });
    if (!alvo) throw new NotFoundException();

    // Sessão do ator (Account + sessão), pelo MESMO caminho da 1.12 — sempre do servidor, nunca do
    // corpo. Sem sessão, a janela de step-up é inválida por construção.
    const sessao = await this.stepUp.sessaoAtual(headers);
    const stepUpValido = sessao ? await this.stepUp.janelaValida(sessao) : false;

    // Contagem pré-tx (escopada à Org pela RLS) — pré-cheque para rejeitar cedo. A decisão AUTORITATIVA
    // do último Admin é reavaliada DENTRO da tx com `FOR UPDATE`.
    const adminsAtivos = await db.membership.count({
      where: { role: 'ADMIN', state: 'ACTIVE' },
    });

    const preDecisao = planejarAlteracaoPapel({
      papelAtual: alvo.role as MembershipRole,
      novoPapel,
      estadoAlvo: alvo.state as 'ACTIVE' | 'SUSPENDED' | 'REMOVED',
      adminsAtivos,
      stepUpValido,
    });
    this.recusar(preDecisao); // lança 409/403 se for INATIVA/STEP_UP/ULTIMO_ADMIN
    if (preDecisao.tipo === 'NOOP') {
      // Idempotente: o papel já é o desejado. SEM escrita, SEM `updateMany` (evita falso `denied` na
      // auditoria), SEM evento — nada mudou.
      return { id: alvo.id, role: novoPapel, previousRole: novoPapel, revokedDatabaseGrants: [] };
    }

    // Concessões incompatíveis a revogar (teto AD-9): só ao rebaixar para GUEST, e só as ativas ≠ VIEWER.
    const grantsIncompat =
      novoPapel === 'GUEST'
        ? await db.databaseGrant.findMany({
            where: { membershipId: alvo.id, state: 'ACTIVE', role: { not: 'VIEWER' } },
            select: { id: true, role: true },
          })
        : [];
    const idsARevogar = planejarRevogacaoIncompativel(
      novoPapel,
      grantsIncompat.map((g) => ({ id: g.id, role: g.role as 'ADMIN' | 'MEMBER' | 'VIEWER' })),
    );

    // Rebaixar para CONVIDADO: a decisão DEB-PIPEGRANT-GUEST-CEILING (item 7) manda **RECUSAR** — nunca
    // rebaixar em silêncio — enquanto houver `PipeGrant` ativo acima do teto (`ADMIN`/`MEMBER`). Difere
    // do auto-revogar de `DatabaseGrant` (8.4), por decisão de Produto distinta e explícita. Pré-cheque
    // para rejeitar cedo; a decisão AUTORITATIVA é reavaliada DENTRO da tx (anti-TOCTOU). O read-side de
    // `pipe-authz` é o fail-closed complementar caso um grant escape pela janela entre operações.
    if (novoPapel === 'GUEST') {
      const pipeGrantsAtivos = await db.pipeGrant.findMany({
        where: { membershipId: alvo.id, state: 'ACTIVE', role: { in: ['ADMIN', 'MEMBER'] } },
        select: { id: true, role: true },
      });
      const incompat = pipeGrantsIncompativeisConvidado(
        'GUEST',
        pipeGrantsAtivos.map((g) => ({ id: g.id, role: g.role as PapelPipe })),
      );
      if (incompat.length > 0) {
        throw new ConflictException({ erro: 'PIPE_GRANT_INCOMPATIVEL', pipeGrants: [...incompat] });
      }
    }

    const correlationId = randomUUID();
    let resultado: TxResultado;
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // D-2: BLOQUEIA a linha canônica da Organização. Serializa todas as alterações de papel da Org —
        // a 2ª alteração concorrente espera aqui e, ao entrar, relê a contagem já atualizada.
        await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${contexto.orgId}::uuid FOR UPDATE`;

        // Relê DENTRO da tx (anti-TOCTOU): estado/papel do alvo e a contagem de Admins autoritativa.
        const alvoAgora = await tx.membership.findFirst({
          where: { id: alvo.id, orgId: contexto.orgId },
          select: SELECT_ALVO,
        });
        if (!alvoAgora) return { tipo: 'SUMIU' };
        const adminsAgora = await tx.membership.count({
          where: { orgId: contexto.orgId, role: 'ADMIN', state: 'ACTIVE' },
        });

        const dentro = planejarAlteracaoPapel({
          papelAtual: alvoAgora.role as MembershipRole,
          novoPapel,
          estadoAlvo: alvoAgora.state as 'ACTIVE' | 'SUSPENDED' | 'REMOVED',
          adminsAtivos: adminsAgora,
          stepUpValido,
        });
        if (dentro.tipo !== 'APLICAR') return { tipo: 'RECUSA', decisao: dentro };

        // Anti-TOCTOU: relê os `PipeGrant` incompatíveis DENTRO da tx. Se um foi concedido entre o
        // pré-cheque e aqui, a alteração é recusada — não rebaixa em silêncio (DEB-PIPEGRANT-GUEST-CEILING).
        if (novoPapel === 'GUEST') {
          const pipeGrantsAgora = await tx.pipeGrant.findMany({
            where: {
              orgId: contexto.orgId,
              membershipId: alvo.id,
              state: 'ACTIVE',
              role: { in: ['ADMIN', 'MEMBER'] },
            },
            select: { id: true, role: true },
          });
          const incompatAgora = pipeGrantsIncompativeisConvidado(
            'GUEST',
            pipeGrantsAgora.map((g) => ({ id: g.id, role: g.role as PapelPipe })),
          );
          if (incompatAgora.length > 0) return { tipo: 'PIPE_INCOMPATIVEL', ids: incompatAgora };
        }

        // Guarda otimista: só altera se o papel/estado ainda são os que a decisão assumiu.
        const { count } = await tx.membership.updateMany({
          where: { id: alvo.id, orgId: contexto.orgId, role: alvoAgora.role, state: 'ACTIVE' },
          data: { role: novoPapel },
        });
        if (count === 0) return { tipo: 'CONFLITO' };

        // Revoga as concessões incompatíveis na MESMA transação (AD-9). Filtro defensivo repete as
        // condições — nunca revoga uma que virou VIEWER/REVOKED entre a leitura e a tx.
        if (idsARevogar.length > 0) {
          await tx.databaseGrant.updateMany({
            where: {
              id: { in: [...idsARevogar] },
              orgId: contexto.orgId,
              state: 'ACTIVE',
              role: { not: 'VIEWER' },
            },
            data: { state: 'REVOKED', revokedAt: new Date() },
          });
        }

        // Evento canônico (append-only), MESMA transação — não há alteração sem seu evento (AD-13).
        // `eventId` determinístico (idempotência); payload mínimo, sem PII.
        const eventId = derivarEventId(contexto.orgId, alvo.id, correlationId);
        await tx.membershipEvent.create({
          data: {
            orgId: contexto.orgId,
            eventId,
            membershipId: alvo.id,
            type: 'ROLE_CHANGED',
            fromRole: alvoAgora.role,
            toRole: novoPapel,
            actorId: contexto.accountId,
            occurredAt: new Date(),
            correlationId,
            version: 1,
            payload: { revokedDatabaseGrants: [...idsARevogar] },
          },
        });

        return {
          tipo: 'OK',
          deRole: alvoAgora.role as MembershipRole,
          alvoAccountId: alvoAgora.accountId,
          revogados: idsARevogar,
        };
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('alteração concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    return this.finalizar(contexto, alvo.id, novoPapel, resultado);
  }

  /**
   * Traduz o desfecho da tx em resposta/HTTP. `OK` invalida a ability do alvo e audita; recusas relidas
   * DENTRO da tx viram 403/409 (o último Admin autoritativo mora aqui); conflito/sumiço reconsulta e
   * decide idempotente vs 409 — nunca 500.
   */
  private async finalizar(
    contexto: ContextoOrganizacional,
    membershipId: string,
    novoPapel: MembershipRole,
    resultado: TxResultado,
  ): Promise<AlteracaoPapelVisao> {
    if (resultado.tipo === 'RECUSA') {
      this.recusar(resultado.decisao);
      // `recusar` já lançou para INATIVA/STEP_UP/ULTIMO_ADMIN; NOOP não chega aqui (decidido antes da tx).
      throw new ConflictException();
    }
    if (resultado.tipo === 'PIPE_INCOMPATIVEL') {
      // Rebaixar para GUEST com `PipeGrant` acima do teto → RECUSA (DEB-PIPEGRANT-GUEST-CEILING, item 7):
      // erro de domínio sanitizado, exigindo reduzir/remover os grants antes. Sem rebaixamento silencioso.
      throw new ConflictException({
        erro: 'PIPE_GRANT_INCOMPATIVEL',
        pipeGrants: [...resultado.ids],
      });
    }
    if (resultado.tipo === 'CONFLITO' || resultado.tipo === 'SUMIU') {
      const db = withTenantContext(this.prisma, contexto, this.logger);
      const agora = await db.membership.findUnique({
        where: { id: membershipId },
        select: SELECT_ALVO,
      });
      // Idempotência: se já está no papel desejado (outra requisição venceu com o mesmo alvo), 200.
      if (agora && agora.role === novoPapel && agora.state === 'ACTIVE') {
        return {
          id: membershipId,
          role: novoPapel,
          previousRole: novoPapel,
          revokedDatabaseGrants: [],
        };
      }
      throw new ConflictException('o papel do membro mudou concorrentemente; reconsulte e repita');
    }

    // resultado.tipo === 'OK'
    // D-3: invalida a ability em cache do ALVO na Org afetada. A próxima requisição dele reconstrói com
    // o papel novo (o contexto relê a Membership ACTIVE) — sem janela de cache obsoleto. Só a Org
    // afetada; a Account NÃO é revogada globalmente.
    this.abilityCache.invalidar(resultado.alvoAccountId, contexto.orgId);

    this.auditar(contexto, 'update', 'Membership');
    this.auditar(contexto, 'create', 'MembershipEvent');
    if (resultado.revogados.length > 0) this.auditar(contexto, 'update', 'DatabaseGrant');

    return {
      id: membershipId,
      role: novoPapel,
      previousRole: resultado.deRole,
      revokedDatabaseGrants: resultado.revogados,
    };
  }

  /** Lança a recusa HTTP correspondente à decisão. `APLICAR`/`NOOP` NÃO lançam. */
  private recusar(decisao: { tipo: string }): void {
    switch (decisao.tipo) {
      case 'INATIVA':
        throw new ConflictException({ erro: 'MEMBERSHIP_INATIVA' });
      case 'STEP_UP':
        throw new ForbiddenException({ erro: 'STEP_UP_REQUIRED' });
      case 'ULTIMO_ADMIN':
        throw new ConflictException({ erro: 'LAST_ADMIN_PROTECTED' });
      default:
        return;
    }
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca PII. */
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

/** Desfecho interno da transação. */
type TxResultado =
  | { tipo: 'OK'; deRole: MembershipRole; alvoAccountId: string; revogados: readonly string[] }
  | { tipo: 'RECUSA'; decisao: { tipo: string } }
  | { tipo: 'PIPE_INCOMPATIVEL'; ids: readonly string[] }
  | { tipo: 'CONFLITO' }
  | { tipo: 'SUMIU' };
