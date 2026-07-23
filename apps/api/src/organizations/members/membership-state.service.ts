import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  aoAlterarMembership,
  preflightEncerramentoMembership,
} from '../../pipes/cards/access/membership-contract';
import { AbilityCache } from '../../kernel/authz/ability.cache';
import { StepUpService } from '../../kernel/auth/step-up.service';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { derivarEventId, type MembershipRole, type MembershipState } from './membership-role.core';
import {
  type DecisaoEstado,
  estadoDestino,
  planejarTransicaoEstado,
  tipoEvento,
  type TransicaoEstado,
} from './membership-state.core';

/** O que a transição devolve pela API interna. `orgId` fica FORA da fronteira; nunca vaza. */
export interface TransicaoEstadoVisao {
  id: string;
  state: MembershipState;
  previousState: MembershipState;
  /** `CardGrant` revogados pela reconciliação da suspensão (contrato 2.10). Vazio na reativação. */
  revokedCardGrants: readonly string[];
  /** Cards cuja atribuição de Responsável foi removida (por cardId). Vazio na reativação. */
  removedResponsavelDe: readonly string[];
  /** Tarefas (5.1) cujo Responsável foi esvaziado pela reconciliação. Vazio na reativação. */
  removedTaskResponsavelDe: readonly string[];
  /** Solicitações (5.2) cujo Responsável foi esvaziado pela reconciliação. Vazio na reativação. */
  removedRequestResponsavelDe: readonly string[];
}

/** Conflito de concorrência (→ 409): P2002/P2028 da tx interativa sob contenção. */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

const SELECT_ALVO = { id: true, accountId: true, role: true, state: true } as const;

/**
 * Suspensão e reativação da Membership (Story 8.5) — pela AUTORIDADE do Admin da Organização, com
 * step-up, proteção ATÔMICA do último Admin, preflight, evento canônico e invalidação imediata de
 * acesso na Organização afetada. Twin de comportamento da 8.4, no eixo de ESTADO (`ACTIVE ↔ SUSPENDED`).
 *
 * **Autorização:** só o Admin da Org (a rota exige `administrar Organizacao` no guard; aqui, defesa em
 * profundidade). O alvo cross-tenant é invisível sob RLS → 404 não-enumerante. **Autossuspensão vedada**
 * (saída própria é a 8.6) → 403 AUTOSSUSPENSAO_PROIBIDA.
 *
 * **Step-up (D-1):** suspender E reativar exigem janela de step-up recente (reusa a 1.12). Sem
 * sessão/janela → **403 STEP_UP_REQUIRED**.
 *
 * **Último Admin (D-2):** suspender que reduz Admins abre transação, **bloqueia a linha da
 * `Organization` com `SELECT … FOR UPDATE`**, RELÊ os Admins ativos e o alvo DENTRO da tx (anti-TOCTOU),
 * revalida o invariante e só então aplica — evento + revogações na MESMA transação. Suspender o último
 * Admin → **409 LAST_ADMIN_PROTECTED**.
 *
 * **Sessões/abilities (D-3):** ao suspender, invalida a ability em cache do ALVO na Org afetada
 * (`AbilityCache.invalidar`) e **limpa** `AuthSession.activeOrganizationId` das sessões do alvo que
 * apontam para ela. O `OrgContextResolver` RELÊ a Membership ACTIVE a cada requisição, então a próxima
 * requisição do alvo já cai em deny-by-default naquela Org. NÃO se revoga a Account globalmente: outras
 * Organizações permanecem intactas. **Reativação** retoma o acesso com o papel preservado e **NÃO
 * restaura** concessões/atribuições revogadas (reconceder é ato explícito — não-restauração automática).
 *
 * **Preflight (contrato 2.10):** antes de suspender, consulta `preflightEncerramentoMembership`
 * (vacuamente verdadeiro na Fase 1). Bloqueio → 409 PREFLIGHT_BLOQUEADO, sem alteração parcial.
 *
 * **Evento/auditoria:** cada transição escreve um `MembershipEvent` (`SUSPENDED`/`REACTIVATED`) na
 * MESMA transação (append-only) e uma linha de auditoria (FR-214). Minimização LGPD (D-4): papel
 * preservado em `fromRole=toRole`, estados em `payload`; nunca senha/token/sessão/e-mail/corpo HTTP.
 */
@Injectable()
export class MembershipStateService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly stepUp: StepUpService,
    private readonly abilityCache: AbilityCache,
    private readonly logger: PinoLogger,
  ) {}

  suspender(membershipId: string, headers: IncomingHttpHeaders): Promise<TransicaoEstadoVisao> {
    return this.executar(membershipId, 'SUSPENDER', headers);
  }

  reativar(membershipId: string, headers: IncomingHttpHeaders): Promise<TransicaoEstadoVisao> {
    return this.executar(membershipId, 'REATIVAR', headers);
  }

  private async executar(
    membershipId: string,
    transicao: TransicaoEstado,
    headers: IncomingHttpHeaders,
  ): Promise<TransicaoEstadoVisao> {
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

    // O ator é o próprio alvo? (autossuspensão vedada). Membership é única por (accountId, orgId),
    // então comparar `accountId` equivale a comparar a Membership.
    const ehProprio = alvo.accountId === contexto.accountId;

    // Contagem pré-tx (escopada à Org pela RLS) — pré-cheque para rejeitar cedo. A decisão AUTORITATIVA
    // do último Admin é reavaliada DENTRO da tx com `FOR UPDATE`.
    const adminsAtivos = await db.membership.count({
      where: { role: 'ADMIN', state: 'ACTIVE' },
    });

    const preDecisao = planejarTransicaoEstado({
      estadoAtual: alvo.state as MembershipState,
      transicao,
      ehProprio,
      adminsAtivos,
      papelAlvo: alvo.role as MembershipRole,
      stepUpValido,
    });
    this.recusar(preDecisao); // lança 409/403 se for ESTADO_INVALIDO/AUTOSSUSPENSAO/STEP_UP/ULTIMO_ADMIN
    if (preDecisao.tipo === 'NOOP') {
      // Idempotente: o estado já é o desejado. SEM escrita, SEM `updateMany` (evita falso `denied` na
      // auditoria), SEM evento — nada mudou.
      const atual = alvo.state as MembershipState;
      return {
        id: alvo.id,
        state: atual,
        previousState: atual,
        revokedCardGrants: [],
        removedResponsavelDe: [],
        removedTaskResponsavelDe: [],
        removedRequestResponsavelDe: [],
      };
    }

    const novoEstado = estadoDestino(transicao);
    const correlationId = randomUUID();
    let resultado: TxResultado;
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // D-2: BLOQUEIA a linha canônica da Organização. Serializa as transições de estado/papel da Org —
        // a 2ª operação concorrente espera aqui e, ao entrar, relê a contagem já atualizada.
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

        const dentro = planejarTransicaoEstado({
          estadoAtual: alvoAgora.state as MembershipState,
          transicao,
          ehProprio,
          adminsAtivos: adminsAgora,
          papelAlvo: alvoAgora.role as MembershipRole,
          stepUpValido,
        });
        if (dentro.tipo !== 'APLICAR') return { tipo: 'RECUSA', decisao: dentro };

        // Reconciliação (contrato 2.10): concessões diretas e atribuições ATIVAS do alvo. Na suspensão,
        // são revogadas/removidas; na reativação, o plano é vazio (não restaura nada).
        const grants =
          transicao === 'SUSPENDER'
            ? await tx.cardGrant.findMany({
                where: { membershipId: alvo.id, orgId: contexto.orgId, state: 'ACTIVE' },
                select: { id: true },
              })
            : [];
        const responsaveis =
          transicao === 'SUSPENDER'
            ? await tx.cardResponsavel.findMany({
                where: { membershipId: alvo.id, orgId: contexto.orgId, state: 'ACTIVE' },
                select: { cardId: true },
              })
            : [];

        // Tarefas (5.1) em que o alvo é Responsável — esvaziadas na suspensão (referência-por-id inválida
        // não pode restar em silêncio, §1525). Vazio na reativação.
        const tarefasResponsavel =
          transicao === 'SUSPENDER'
            ? await tx.task.findMany({
                where: { responsavelMembershipId: alvo.id, orgId: contexto.orgId },
                select: { id: true },
              })
            : [];

        // Solicitações (5.2) em que o alvo é Responsável — esvaziadas na suspensão (referência-por-id
        // inválida não pode restar em silêncio, §1546). Vazio na reativação.
        const solicitacoesResponsavel =
          transicao === 'SUSPENDER'
            ? await tx.solicitacao.findMany({
                where: { responsavelMembershipId: alvo.id, orgId: contexto.orgId },
                select: { id: true },
              })
            : [];

        // Preflight (SC-2106): hoje vacuamente verdadeiro. Bloqueio → aborta sem alteração parcial.
        const responsavelDe = responsaveis.map((r) => r.cardId);
        const taskResponsavelDe = tarefasResponsavel.map((t) => t.id);
        const requestResponsavelDe = solicitacoesResponsavel.map((s) => s.id);
        if (transicao === 'SUSPENDER') {
          const pf = preflightEncerramentoMembership({ responsavelDe });
          if (pf.bloqueios.length > 0) return { tipo: 'PREFLIGHT', bloqueios: pf.bloqueios };
        }

        const plano = aoAlterarMembership({
          novoEstado,
          grantsAtivos: grants.map((g) => g.id),
          responsavelDe,
          taskResponsavelDe,
          requestResponsavelDe,
        });

        // Guarda otimista: só altera se o estado ainda é o que a decisão assumiu.
        const { count } = await tx.membership.updateMany({
          where: { id: alvo.id, orgId: contexto.orgId, state: alvoAgora.state },
          data: { state: novoEstado },
        });
        if (count === 0) return { tipo: 'CONFLITO' };

        // Revoga as concessões diretas e remove as atribuições de Responsável na MESMA transação
        // (contrato 2.10). Filtro defensivo repete `state: ACTIVE`. Vazio na reativação.
        if (plano.revogarGrants.length > 0) {
          await tx.cardGrant.updateMany({
            where: { id: { in: [...plano.revogarGrants] }, orgId: contexto.orgId, state: 'ACTIVE' },
            data: { state: 'REVOKED', revokedAt: new Date() },
          });
        }
        if (plano.removerResponsavelDe.length > 0) {
          await tx.cardResponsavel.updateMany({
            where: {
              membershipId: alvo.id,
              cardId: { in: [...plano.removerResponsavelDe] },
              orgId: contexto.orgId,
              state: 'ACTIVE',
            },
            data: { state: 'REMOVED', removedAt: new Date() },
          });
        }
        // Esvazia o Responsável das Tarefas (5.1) do alvo na MESMA transação (contrato de reatribuição).
        if (plano.removerTaskResponsavelDe.length > 0) {
          await tx.task.updateMany({
            where: {
              responsavelMembershipId: alvo.id,
              id: { in: [...plano.removerTaskResponsavelDe] },
              orgId: contexto.orgId,
            },
            data: { responsavelMembershipId: null },
          });
        }
        // Esvazia o Responsável das Solicitações (5.2) do alvo na MESMA transação (contrato de reatribuição).
        if (plano.removerRequestResponsavelDe.length > 0) {
          await tx.solicitacao.updateMany({
            where: {
              responsavelMembershipId: alvo.id,
              id: { in: [...plano.removerRequestResponsavelDe] },
              orgId: contexto.orgId,
            },
            data: { responsavelMembershipId: null },
          });
        }

        // D-3: ao suspender, LIMPA o ponteiro de Organização ativa das sessões do alvo que apontam
        // para a Org afetada — a sessão não dispensa a revalidação de Membership, e sem isto ela
        // seguiria "apontando" para uma Org onde a pessoa não tem mais acesso. `AuthSession` é GLOBAL
        // (sem RLS), keyed por `userId` (a conta). Não mata a sessão (outras Orgs seguem válidas).
        if (transicao === 'SUSPENDER') {
          await tx.authSession.updateMany({
            where: { userId: alvo.accountId, activeOrganizationId: contexto.orgId },
            data: { activeOrganizationId: null },
          });
        }

        // Evento canônico (append-only), MESMA transação — não há transição sem seu evento (AD-13).
        // `eventId` determinístico (idempotência); papel PRESERVADO (from=to); estados no payload; sem PII.
        const eventId = derivarEventId(contexto.orgId, alvo.id, correlationId);
        await tx.membershipEvent.create({
          data: {
            orgId: contexto.orgId,
            eventId,
            membershipId: alvo.id,
            type: tipoEvento(transicao),
            fromRole: alvoAgora.role,
            toRole: alvoAgora.role,
            actorId: contexto.accountId,
            occurredAt: new Date(),
            correlationId,
            version: 1,
            payload: {
              fromState: alvoAgora.state,
              toState: novoEstado,
              revokedCardGrants: [...plano.revogarGrants],
              removedResponsavelDe: [...plano.removerResponsavelDe],
              removedTaskResponsavelDe: [...plano.removerTaskResponsavelDe],
              removedRequestResponsavelDe: [...plano.removerRequestResponsavelDe],
              reatribuir: [...plano.reatribuir],
            },
          },
        });

        return {
          tipo: 'OK',
          dePrevio: alvoAgora.state as MembershipState,
          alvoAccountId: alvoAgora.accountId,
          revogados: plano.revogarGrants,
          responsavelRemovido: plano.removerResponsavelDe,
          taskResponsavelRemovido: plano.removerTaskResponsavelDe,
          requestResponsavelRemovido: plano.removerRequestResponsavelDe,
        };
      });
    } catch (err) {
      if (isConflito(err)) {
        throw new ConflictException('transição concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    return this.finalizar(contexto, alvo.id, novoEstado, resultado);
  }

  /**
   * Traduz o desfecho da tx em resposta/HTTP. `OK` invalida a ability do alvo e audita; recusas relidas
   * DENTRO da tx viram 403/409 (o último Admin autoritativo mora aqui); conflito/sumiço reconsulta e
   * decide idempotente vs 409 — nunca 500.
   */
  private async finalizar(
    contexto: ContextoOrganizacional,
    membershipId: string,
    novoEstado: MembershipState,
    resultado: TxResultado,
  ): Promise<TransicaoEstadoVisao> {
    if (resultado.tipo === 'PREFLIGHT') {
      throw new ConflictException({ erro: 'PREFLIGHT_BLOQUEADO', cards: resultado.bloqueios });
    }
    if (resultado.tipo === 'RECUSA') {
      this.recusar(resultado.decisao);
      // `recusar` já lançou para ESTADO_INVALIDO/AUTOSSUSPENSAO/STEP_UP/ULTIMO_ADMIN; NOOP não chega aqui.
      throw new ConflictException();
    }
    if (resultado.tipo === 'CONFLITO' || resultado.tipo === 'SUMIU') {
      const db = withTenantContext(this.prisma, contexto, this.logger);
      const agora = await db.membership.findUnique({
        where: { id: membershipId },
        select: SELECT_ALVO,
      });
      // Idempotência: se já está no estado desejado (outra requisição venceu com o mesmo alvo), 200.
      if (agora && agora.state === novoEstado) {
        return {
          id: membershipId,
          state: novoEstado,
          previousState: novoEstado,
          revokedCardGrants: [],
          removedResponsavelDe: [],
          removedTaskResponsavelDe: [],
          removedRequestResponsavelDe: [],
        };
      }
      throw new ConflictException('o estado do membro mudou concorrentemente; reconsulte e repita');
    }

    // resultado.tipo === 'OK'
    // D-3: invalida a ability em cache do ALVO na Org afetada. A próxima requisição dele reconstrói (ou
    // cai em deny-by-default, se suspenso, pois o contexto relê a Membership ACTIVE) — sem janela de
    // cache obsoleto. Só a Org afetada; a Account NÃO é revogada globalmente.
    this.abilityCache.invalidar(resultado.alvoAccountId, contexto.orgId);

    this.auditar(contexto, 'update', 'Membership');
    this.auditar(contexto, 'create', 'MembershipEvent');
    if (resultado.revogados.length > 0) this.auditar(contexto, 'update', 'CardGrant');
    if (resultado.responsavelRemovido.length > 0)
      this.auditar(contexto, 'update', 'CardResponsavel');
    if (resultado.taskResponsavelRemovido.length > 0) this.auditar(contexto, 'update', 'Task');
    if (resultado.requestResponsavelRemovido.length > 0)
      this.auditar(contexto, 'update', 'Solicitacao');

    return {
      id: membershipId,
      state: novoEstado,
      previousState: resultado.dePrevio,
      revokedCardGrants: resultado.revogados,
      removedResponsavelDe: resultado.responsavelRemovido,
      removedTaskResponsavelDe: resultado.taskResponsavelRemovido,
      removedRequestResponsavelDe: resultado.requestResponsavelRemovido,
    };
  }

  /** Lança a recusa HTTP correspondente à decisão. `APLICAR`/`NOOP` NÃO lançam. */
  private recusar(decisao: DecisaoEstado): void {
    switch (decisao.tipo) {
      case 'ESTADO_INVALIDO':
        throw new ConflictException({ erro: 'TRANSICAO_INVALIDA' });
      case 'AUTOSSUSPENSAO':
        throw new ForbiddenException({ erro: 'AUTOSSUSPENSAO_PROIBIDA' });
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
  | {
      tipo: 'OK';
      dePrevio: MembershipState;
      alvoAccountId: string;
      revogados: readonly string[];
      responsavelRemovido: readonly string[];
      taskResponsavelRemovido: readonly string[];
      requestResponsavelRemovido: readonly string[];
    }
  | { tipo: 'RECUSA'; decisao: DecisaoEstado }
  | { tipo: 'PREFLIGHT'; bloqueios: readonly string[] }
  | { tipo: 'CONFLITO' }
  | { tipo: 'SUMIU' };
