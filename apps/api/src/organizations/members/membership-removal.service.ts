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
import { type DecisaoRemocao, planejarRemocao } from './membership-removal.core';

/** O que a remoção devolve pela API interna. `orgId` fica FORA da fronteira; nunca vaza. */
export interface RemocaoVisao {
  id: string;
  state: MembershipState;
  previousState: MembershipState;
  /** `true` quando o ator é o próprio alvo (saída voluntária); `false` na remoção por um Admin. */
  saidaVoluntaria: boolean;
  /** `CardGrant` revogados pela reconciliação (contrato 2.10). */
  revokedCardGrants: readonly string[];
  /** Cards cuja atribuição de Responsável foi removida (por cardId). */
  removedResponsavelDe: readonly string[];
  /** Tarefas (5.1) cujo Responsável foi esvaziado pela reconciliação (por taskId). */
  removedTaskResponsavelDe: readonly string[];
  /** Solicitações (5.2) cujo Responsável foi esvaziado pela reconciliação (por solicitacaoId). */
  removedRequestResponsavelDe: readonly string[];
}

/** Conflito de concorrência (→ 409): P2002/P2028 da tx interativa sob contenção. */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

const SELECT_ALVO = { id: true, accountId: true, role: true, state: true } as const;
const REMOVED: MembershipState = 'REMOVED';

/**
 * Remoção e saída voluntária da Membership (Story 8.6) — o ENCERRAMENTO do vínculo
 * (`ACTIVE`/`SUSPENDED → REMOVED`), com step-up, proteção ATÔMICA do último Admin, preflight, evento
 * canônico e invalidação imediata de acesso na Organização afetada. Terceiro eixo do ciclo de
 * Membership (papel 8.4, estado 8.5, encerramento 8.6), reusando o MESMO substrato — sem reabrir aqueles
 * núcleos.
 *
 * **Dois fluxos, um núcleo:** `remover` (autoridade do Admin da Org sobre um alvo) e `sair` (o próprio
 * usuário encerra a SUA Membership). Ambos convergem em `encerrar`: a única diferença é a origem do alvo
 * (param vs contexto) e a auditoria (`saidaVoluntaria = actorId === alvo.accountId`). Diferente da
 * autossuspensão (8.5, vedada), a saída própria é o próprio objetivo — por isso não há bloqueio de
 * auto-alvo; o que ainda barra é a proteção do último Admin (409, nos DOIS fluxos).
 *
 * **Autorização:** `remover` exige Admin da Org (rota `@Requer('administrar','Organizacao')`; aqui,
 * defesa em profundidade). `sair` exige apenas Membership ativa (piso `ler Organizacao`), pois o alvo é
 * o PRÓPRIO requisitante. Alvo cross-tenant é invisível sob RLS → 404 não-enumerante.
 *
 * **Step-up (D-1):** remover E sair exigem janela de step-up recente (reusa a 1.12). Sem sessão/janela →
 * **403 STEP_UP_REQUIRED**. Resolvido server-side; nunca do corpo.
 *
 * **Último Admin (D-2):** encerrar que reduz Admins ativos abre transação, **bloqueia a linha da
 * `Organization` com `SELECT … FOR UPDATE`**, RELÊ os Admins ativos e o alvo DENTRO da tx (anti-TOCTOU),
 * revalida o invariante e só então aplica — evento + revogações na MESMA transação. Encerrar o último
 * Admin (por remoção OU saída) → **409 LAST_ADMIN_PROTECTED**.
 *
 * **Sessões/abilities (D-3):** ao encerrar, invalida a ability em cache do ALVO na Org afetada
 * (`AbilityCache.invalidar`) e **limpa** `AuthSession.activeOrganizationId` das sessões do alvo que
 * apontam para ela. O `OrgContextResolver` RELÊ a Membership ACTIVE a cada requisição, então a próxima
 * requisição do alvo já cai em deny-by-default naquela Org. NÃO se revoga a Account globalmente: outras
 * Organizações permanecem intactas. `REMOVED` é reversível só por novo Convite/aceite (8.3); reingressar
 * **NÃO restaura** papel, concessões nem atribuições anteriores.
 *
 * **Impacto sobre recursos (contrato 2.10):** consome `aoAlterarMembership('REMOVED', …)` — **revoga**
 * `CardGrant` ativos e **remove** `CardResponsavel` ativos do alvo, na MESMA transação. `PipeGrant`/
 * `DatabaseGrant` NÃO são fisicamente revogados (o deny-by-default já os torna inalcançáveis — coerente
 * com a 8.5; `DEB-8-5-PIPE-DB-GRANT-REVOKE`). `creator` é preservado por construção (é o `actorId` do
 * `CREATED`, não uma concessão).
 *
 * **Preflight (contrato 2.10):** antes de encerrar, consulta `preflightEncerramentoMembership`
 * (vacuamente verdadeiro na Fase 1 — DIV-3). Bloqueio → 409 PREFLIGHT_BLOQUEADO, sem alteração parcial.
 *
 * **Evento/auditoria:** cada encerramento escreve um `MembershipEvent` (`REMOVED`) na MESMA transação
 * (append-only) e uma linha de auditoria (FR-214). Minimização LGPD (D-4): papel preservado
 * (`fromRole=toRole`), estados/flag no `payload`; nunca senha/token/sessão/e-mail/corpo HTTP.
 */
@Injectable()
export class MembershipRemovalService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly stepUp: StepUpService,
    private readonly abilityCache: AbilityCache,
    private readonly logger: PinoLogger,
  ) {}

  /** Remoção administrativa: o Admin da Org encerra a Membership de `membershipId` (alvo por param). */
  async remover(membershipId: string, headers: IncomingHttpHeaders): Promise<RemocaoVisao> {
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
    return this.encerrar(contexto, alvo, headers);
  }

  /** Saída voluntária: o próprio usuário encerra a SUA Membership na Organização do contexto. */
  async sair(headers: IncomingHttpHeaders): Promise<RemocaoVisao> {
    const contexto = this.requestContext.obter();
    const db = withTenantContext(this.prisma, contexto, this.logger);
    // O alvo é o PRÓPRIO requisitante. Sob RLS + `@@unique([accountId, orgId])`, há no máximo uma
    // Membership da conta nesta Org — e o contexto só existe porque ela está ACTIVE.
    const alvo = await db.membership.findFirst({
      where: { accountId: contexto.accountId },
      select: SELECT_ALVO,
    });
    // Defesa em profundidade: sem contexto não se chega aqui; se ainda assim sumiu, 404 sanitizado.
    if (!alvo) throw new NotFoundException();
    return this.encerrar(contexto, alvo, headers);
  }

  /**
   * Núcleo transacional COMPARTILHADO pelos dois fluxos. `alvo` já foi resolvido (por param ou por
   * contexto); daqui em diante remover e sair são idênticos, exceto pela flag `saidaVoluntaria`.
   */
  private async encerrar(
    contexto: ContextoOrganizacional,
    alvo: { id: string; accountId: string; role: MembershipRole; state: MembershipState },
    headers: IncomingHttpHeaders,
  ): Promise<RemocaoVisao> {
    // O ator é o próprio alvo? (saída voluntária vs remoção administrativa). Membership é única por
    // (accountId, orgId), então comparar `accountId` equivale a comparar a Membership.
    const saidaVoluntaria = alvo.accountId === contexto.accountId;

    // Sessão do ator (Account + sessão), pelo MESMO caminho da 1.12 — sempre do servidor, nunca do
    // corpo. Sem sessão, a janela de step-up é inválida por construção.
    const sessao = await this.stepUp.sessaoAtual(headers);
    const stepUpValido = sessao ? await this.stepUp.janelaValida(sessao) : false;

    const db = withTenantContext(this.prisma, contexto, this.logger);
    // Contagem pré-tx (escopada à Org pela RLS) — pré-cheque para rejeitar cedo. A decisão AUTORITATIVA
    // do último Admin é reavaliada DENTRO da tx com `FOR UPDATE`.
    const adminsAtivos = await db.membership.count({
      where: { role: 'ADMIN', state: 'ACTIVE' },
    });

    const preDecisao = planejarRemocao({
      estadoAtual: alvo.state,
      adminsAtivos,
      papelAlvo: alvo.role,
      stepUpValido,
    });
    this.recusar(preDecisao); // lança 403/409 se for STEP_UP/ULTIMO_ADMIN
    if (preDecisao.tipo === 'NOOP') {
      // Idempotente: já REMOVED. SEM escrita, SEM `updateMany` (evita falso `denied` na auditoria),
      // SEM evento — nada mudou.
      return {
        id: alvo.id,
        state: REMOVED,
        previousState: REMOVED,
        saidaVoluntaria,
        revokedCardGrants: [],
        removedResponsavelDe: [],
        removedTaskResponsavelDe: [],
        removedRequestResponsavelDe: [],
      };
    }

    const correlationId = randomUUID();
    let resultado: TxResultado;
    try {
      resultado = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // D-2: BLOQUEIA a linha canônica da Organização. Serializa as transições de papel/estado da Org —
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

        const dentro = planejarRemocao({
          estadoAtual: alvoAgora.state as MembershipState,
          adminsAtivos: adminsAgora,
          papelAlvo: alvoAgora.role as MembershipRole,
          stepUpValido,
        });
        if (dentro.tipo === 'NOOP') return { tipo: 'NOOP_TX' };
        if (dentro.tipo !== 'APLICAR') return { tipo: 'RECUSA', decisao: dentro };

        // Reconciliação (contrato 2.10): concessões diretas e atribuições ATIVAS do alvo. Ao encerrar,
        // são revogadas/removidas. (Se o alvo já estava SUSPENDED, a 8.5 já as revogou → listas vazias.)
        const grants = await tx.cardGrant.findMany({
          where: { membershipId: alvo.id, orgId: contexto.orgId, state: 'ACTIVE' },
          select: { id: true },
        });
        const responsaveis = await tx.cardResponsavel.findMany({
          where: { membershipId: alvo.id, orgId: contexto.orgId, state: 'ACTIVE' },
          select: { cardId: true },
        });
        const responsavelDe = responsaveis.map((r) => r.cardId);
        // Tarefas (5.1) em que o alvo é Responsável — esvaziadas ao encerrar (referência-por-id inválida
        // não pode restar em silêncio, §1525).
        const tarefasResponsavel = await tx.task.findMany({
          where: { responsavelMembershipId: alvo.id, orgId: contexto.orgId },
          select: { id: true },
        });
        const taskResponsavelDe = tarefasResponsavel.map((t) => t.id);
        // Solicitações (5.2) em que o alvo é Responsável — esvaziadas ao encerrar (referência-por-id inválida
        // não pode restar em silêncio, §1546).
        const solicitacoesResponsavel = await tx.solicitacao.findMany({
          where: { responsavelMembershipId: alvo.id, orgId: contexto.orgId },
          select: { id: true },
        });
        const requestResponsavelDe = solicitacoesResponsavel.map((s) => s.id);

        // Preflight (SC-2106): hoje vacuamente verdadeiro. Bloqueio → aborta sem alteração parcial.
        const pf = preflightEncerramentoMembership({ responsavelDe });
        if (pf.bloqueios.length > 0) return { tipo: 'PREFLIGHT', bloqueios: pf.bloqueios };

        const plano = aoAlterarMembership({
          novoEstado: 'REMOVED',
          grantsAtivos: grants.map((g) => g.id),
          responsavelDe,
          taskResponsavelDe,
          requestResponsavelDe,
        });

        // Guarda otimista: só encerra se o estado ainda é o que a decisão assumiu.
        const { count } = await tx.membership.updateMany({
          where: { id: alvo.id, orgId: contexto.orgId, state: alvoAgora.state },
          data: { state: REMOVED },
        });
        if (count === 0) return { tipo: 'CONFLITO' };

        // Revoga as concessões diretas e remove as atribuições de Responsável na MESMA transação
        // (contrato 2.10). Filtro defensivo repete `state: ACTIVE`.
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

        // D-3: LIMPA o ponteiro de Organização ativa das sessões do alvo que apontam para a Org
        // afetada — vale para a remoção administrativa E para a saída voluntária (nesta, o alvo é o
        // próprio ator). `AuthSession` é GLOBAL (sem RLS), keyed por `userId`. Não mata a sessão
        // (outras Orgs seguem válidas).
        await tx.authSession.updateMany({
          where: { userId: alvo.accountId, activeOrganizationId: contexto.orgId },
          data: { activeOrganizationId: null },
        });

        // Evento canônico (append-only), MESMA transação — não há encerramento sem seu evento (AD-13).
        // `eventId` determinístico (idempotência); papel PRESERVADO (from=to); estados/flag no payload; sem PII.
        const eventId = derivarEventId(contexto.orgId, alvo.id, correlationId);
        await tx.membershipEvent.create({
          data: {
            orgId: contexto.orgId,
            eventId,
            membershipId: alvo.id,
            type: 'REMOVED',
            fromRole: alvoAgora.role,
            toRole: alvoAgora.role,
            actorId: contexto.accountId,
            occurredAt: new Date(),
            correlationId,
            version: 1,
            payload: {
              fromState: alvoAgora.state,
              toState: REMOVED,
              saidaVoluntaria,
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
        throw new ConflictException('encerramento concorrente em andamento; reconsulte e repita');
      }
      throw err;
    }

    return this.finalizar(contexto, alvo.id, saidaVoluntaria, resultado);
  }

  /**
   * Traduz o desfecho da tx em resposta/HTTP. `OK` invalida a ability do alvo e audita; recusas relidas
   * DENTRO da tx viram 403/409 (o último Admin autoritativo mora aqui); conflito/sumiço reconsulta e
   * decide idempotente vs 409 — nunca 500.
   */
  private async finalizar(
    contexto: ContextoOrganizacional,
    membershipId: string,
    saidaVoluntaria: boolean,
    resultado: TxResultado,
  ): Promise<RemocaoVisao> {
    if (resultado.tipo === 'PREFLIGHT') {
      throw new ConflictException({ erro: 'PREFLIGHT_BLOQUEADO', cards: resultado.bloqueios });
    }
    if (resultado.tipo === 'RECUSA') {
      this.recusar(resultado.decisao);
      // `recusar` já lançou para STEP_UP/ULTIMO_ADMIN; NOOP/APLICAR não chegam aqui.
      throw new ConflictException();
    }
    if (
      resultado.tipo === 'NOOP_TX' ||
      resultado.tipo === 'CONFLITO' ||
      resultado.tipo === 'SUMIU'
    ) {
      const db = withTenantContext(this.prisma, contexto, this.logger);
      const agora = await db.membership.findUnique({
        where: { id: membershipId },
        select: SELECT_ALVO,
      });
      // Idempotência: se já está REMOVED (o alvo foi encerrado concorrentemente, ou virou REMOVED entre
      // a leitura e a tx), 200 sem novo evento.
      if (!agora || agora.state === 'REMOVED') {
        return {
          id: membershipId,
          state: REMOVED,
          previousState: REMOVED,
          saidaVoluntaria,
          revokedCardGrants: [],
          removedResponsavelDe: [],
          removedTaskResponsavelDe: [],
          removedRequestResponsavelDe: [],
        };
      }
      throw new ConflictException('o estado do membro mudou concorrentemente; reconsulte e repita');
    }

    // resultado.tipo === 'OK'
    // D-3: invalida a ability em cache do ALVO na Org afetada. A próxima requisição dele cai em
    // deny-by-default (o contexto relê a Membership ACTIVE, e não há mais nenhuma) — sem janela de cache
    // obsoleto. Só a Org afetada; a Account NÃO é revogada globalmente.
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
      state: REMOVED,
      previousState: resultado.dePrevio,
      saidaVoluntaria,
      revokedCardGrants: resultado.revogados,
      removedResponsavelDe: resultado.responsavelRemovido,
      removedTaskResponsavelDe: resultado.taskResponsavelRemovido,
      removedRequestResponsavelDe: resultado.requestResponsavelRemovido,
    };
  }

  /** Lança a recusa HTTP correspondente à decisão. `APLICAR`/`NOOP` NÃO lançam. */
  private recusar(decisao: DecisaoRemocao): void {
    switch (decisao.tipo) {
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
  | { tipo: 'RECUSA'; decisao: DecisaoRemocao }
  | { tipo: 'PREFLIGHT'; bloqueios: readonly string[] }
  | { tipo: 'NOOP_TX' }
  | { tipo: 'CONFLITO' }
  | { tipo: 'SUMIU' };
