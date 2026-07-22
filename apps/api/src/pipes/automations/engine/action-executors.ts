import { randomUUID } from 'node:crypto';
import { Prisma } from '../../../../generated/prisma';
import type { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, type withTenantContext } from '../../../kernel/db/tenant-context';
import { resolverAcessoDaMembership } from '../../pipe-authz';
import { SubmissaoInvalidaError, validarSubmissao } from '../../cards/submission';
import type { Acao } from '../automation-config';
import {
  type AlvoAcaoSnapshot,
  type ContextoEvento,
  resolverAlvoDeterministico,
  revalidarAcao,
} from '../actions/action-revalidation.core';
import type { PrincipalAutomacao } from '../actions/automation-principal';
import type { ActionResultState, ErrorCode } from './engine-types';

type Db = ReturnType<typeof withTenantContext>;

/**
 * EXECUTORES de Ação do motor (Story 4.6). Cada executor:
 *  1. resolve o alvo determinístico (`resolverAlvoDeterministico`, 4.5) do `ContextoEvento` (montado pelo
 *     snapshot-builder sob RLS — **M-1** já aplicado ali);
 *  2. monta o `AlvoAcaoSnapshot` (relê o alvo sob RLS — defesa em profundidade / estado atual, §1405);
 *  3. **revalida sob o principal** (`revalidarAcao`, 4.5): capacidade explícita + escopo restrito + Organização +
 *     estado. **Executa APENAS se `permitido`** (L-1 — o gate primário é `resultado.permitido`, NUNCA
 *     `exigeConfirmacaoHumana`);
 *  4. **confirmação humana (§1383):** uma Ação `permitido` mas com `exigeConfirmacaoHumana=true` NÃO é executada
 *     pelo motor da Fase 1 — vira `BLOCKED_CONFIRMATION` (continuação por fluxo separado é contrato futuro);
 *  5. executa a mutação **reusando o núcleo/padrão de domínio** (nunca o serviço `RequestContext`-scoped nem sua
 *     guarda de usuário) numa transação atômica no client raiz com `definirContextoOrg` — evento na mesma tx (AD-13).
 *
 * **Não-ampliação de poder** é garantida em (3): o escopo é do PRINCIPAL (definição versionada), não do criador.
 * A idempotência da Ação vem da chave `(executionId, actionIndex)` do `AutomationActionResult` (o motor não
 * reexecuta uma Ação com resultado), REFORÇADA por chaves idempotentes determinísticas nas mutações de criação.
 */

/** Contexto de execução que o motor injeta em cada executor (singleton — sem `RequestContext`). */
export interface ExecContext {
  readonly prisma: PrismaService;
  readonly db: Db;
  readonly contexto: { orgId: string; accountId?: string };
  readonly principal: PrincipalAutomacao;
  /** Identidade da Execução + posição da Ação — base das chaves idempotentes determinísticas de criação. */
  readonly executionId: string;
  readonly actionIndex: number;
}

/** Desfecho de UMA Ação — o que o motor grava em `AutomationActionResult`. */
export interface ResultadoExecucao {
  readonly state: ActionResultState;
  readonly errorCode: ErrorCode | null;
  readonly targetResourceId: string | null;
}

function conflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Monta o `AlvoAcaoSnapshot` relendo o alvo sob RLS. O tipo de alvo depende da Ação:
 *  · `CARD_*` ⇒ Card (`pipeId`/`lifecycleState`);
 *  · `RECORD_CREATE`/`RECORD_CREATE_RELATED` ⇒ Database de destino (`databaseId`/`state`);
 *  · `RECORD_EDIT` ⇒ Record (`databaseId`/`lifecycleState`).
 * `encontrado=false` quando a releitura não acha (inexistente/outra Org — a RLS não distingue; recusa em ambos).
 */
async function montarAlvoSnapshot(
  db: Db,
  acao: Acao,
  recursoId: string,
): Promise<AlvoAcaoSnapshot> {
  const vazio: AlvoAcaoSnapshot = {
    encontrado: false,
    orgId: null,
    pipeId: null,
    databaseId: null,
    lifecycleState: null,
  };

  if (acao.tipo.startsWith('CARD_')) {
    const card = await db.card.findUnique({
      where: { id: recursoId },
      select: { orgId: true, pipeId: true, lifecycleState: true },
    });
    if (!card) return vazio;
    return {
      encontrado: true,
      orgId: card.orgId,
      pipeId: card.pipeId,
      databaseId: null,
      lifecycleState: card.lifecycleState,
    };
  }

  if (acao.tipo === 'RECORD_CREATE' || acao.tipo === 'RECORD_CREATE_RELATED') {
    const database = await db.database.findUnique({
      where: { id: recursoId },
      select: { orgId: true, state: true },
    });
    if (!database) return vazio;
    return {
      encontrado: true,
      orgId: database.orgId,
      pipeId: null,
      databaseId: recursoId,
      lifecycleState: database.state,
    };
  }

  // RECORD_EDIT (alvo = Registro).
  const record = await db.record.findUnique({
    where: { id: recursoId },
    select: { orgId: true, databaseId: true, lifecycleState: true },
  });
  if (!record) return vazio;
  return {
    encontrado: true,
    orgId: record.orgId,
    pipeId: null,
    databaseId: record.databaseId,
    lifecycleState: record.lifecycleState,
  };
}

/**
 * Executa UMA Ação. Ponto de entrada do módulo. Ordem: resolver alvo → montar snapshot do alvo → revalidar sob
 * o principal → (recusa ⇒ `DENIED`; confirmação ⇒ `BLOCKED_CONFIRMATION`) → executor concreto. Nunca lança por
 * recusa de domínio (vira resultado); erros de EXECUÇÃO (contenção) propagam para o retry do motor.
 */
export async function executarAcao(
  ctx: ExecContext,
  acao: Acao,
  contextoEvento: ContextoEvento,
): Promise<ResultadoExecucao> {
  const alvoResolvido = resolverAlvoDeterministico(acao, contextoEvento);
  const alvoSnapshot =
    alvoResolvido === null
      ? { encontrado: false, orgId: null, pipeId: null, databaseId: null, lifecycleState: null }
      : await montarAlvoSnapshot(ctx.db, acao, alvoResolvido.recursoId);

  const veredito = revalidarAcao(acao, alvoResolvido, alvoSnapshot, ctx.principal);
  if (!veredito.permitido) {
    return {
      state: 'DENIED',
      errorCode: veredito.motivo,
      targetResourceId: alvoResolvido?.recursoId ?? null,
    };
  }
  // L-1: `permitido` é o gate; `exigeConfirmacaoHumana` só CLASSIFICA — o motor da Fase 1 não executa a Ação
  // sensível (não mantém job aberto; continuação por fluxo separado é contrato futuro — §1383).
  if (veredito.exigeConfirmacaoHumana) {
    return {
      state: 'BLOCKED_CONFIRMATION',
      errorCode: 'REQUIRES_CONFIRMATION',
      targetResourceId: alvoResolvido!.recursoId,
    };
  }

  // Só chegam aqui as Ações SEM confirmação: CARD_ASSIGN_RESPONSIBLE, RECORD_CREATE, RECORD_CREATE_RELATED.
  switch (acao.tipo) {
    case 'CARD_ASSIGN_RESPONSIBLE':
      return atribuirResponsavel(ctx, acao, alvoResolvido!.recursoId);
    case 'RECORD_CREATE':
      return criarRegistro(ctx, acao, alvoResolvido!.recursoId, null);
    case 'RECORD_CREATE_RELATED':
      return criarRegistro(ctx, acao, alvoResolvido!.recursoId, contextoEvento.cardId);
    default:
      // Defesa em profundidade: qualquer outro tipo sem confirmação não deveria existir no catálogo Fase 1.
      return { state: 'DENIED', errorCode: 'ACAO_DESCONHECIDA', targetResourceId: null };
  }
}

/**
 * CARD_ASSIGN_RESPONSIBLE — atribui/troca o Responsável (2.10), reusando o padrão de `card-access.service`.
 * **SC-2101/2102 (`DEB-4-5-MEMBERSHIP-REF`):** o alvo (Membership) precisa de acesso operacional PRÉVIO ao Card
 * (`resolverAcessoDaMembership` → `podeOperar`); atribuir NÃO amplia acesso. Sem isso ⇒ `DENIED`.
 */
async function atribuirResponsavel(
  ctx: ExecContext,
  acao: Acao,
  cardId: string,
): Promise<ResultadoExecucao> {
  const membershipId = String(acao.parametros.membershipId);

  // SC-2101 sob RLS: o alvo já tem acesso operacional? (creator/histórico não contam — a lógica é a de 2.10).
  const acessoAlvo = await resolverAcessoDaMembership(ctx.db, membershipId, cardId);
  if (!acessoAlvo || !acessoAlvo.podeOperar) {
    return { state: 'DENIED', errorCode: 'FORA_DO_ESCOPO', targetResourceId: cardId };
  }

  const atual = await ctx.db.cardResponsavel.findFirst({
    where: { cardId, state: 'ACTIVE' },
    select: { id: true, membershipId: true },
  });
  if (atual && atual.membershipId === membershipId) {
    return { state: 'SUCCEEDED', errorCode: null, targetResourceId: cardId }; // idempotente
  }

  try {
    await ctx.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, ctx.contexto)) await p;
      if (atual) {
        await tx.cardResponsavel.update({
          where: { id: atual.id },
          data: { state: 'REMOVED', removedAt: new Date() },
        });
      }
      await tx.cardResponsavel.create({
        data: { orgId: ctx.contexto.orgId, cardId, membershipId, state: 'ACTIVE' },
      });
      await tx.cardHistory.create({
        data: {
          orgId: ctx.contexto.orgId,
          cardId,
          type: atual ? 'RESPONSAVEL_CHANGED' : 'RESPONSAVEL_ASSIGNED',
          summary: atual
            ? 'Responsável alterado pela Automação'
            : 'Responsável atribuído pela Automação',
          actorId: ctx.contexto.accountId ?? null,
        },
      });
    });
  } catch (err) {
    if (conflito(err))
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: cardId };
    throw err; // erro inesperado ⇒ retry do motor
  }
  return { state: 'SUCCEEDED', errorCode: null, targetResourceId: cardId };
}

/**
 * RECORD_CREATE / RECORD_CREATE_RELATED — cria ≤1 Registro no Database configurado (reusa o padrão de
 * `records.service`), validando `valores` contra o snapshot da `FormVersion` PUBLICADA (fail-closed → `DENIED`).
 * Idempotência da Ação: `idempotencyKey` DETERMINÍSTICA `${executionId}:${actionIndex}` — um retry reencontra o
 * Registro (P2002 → idempotente), garantindo "no máximo 1 Registro" (§1387). `RECORD_CREATE_RELATED` também cria
 * o vínculo `CardRecordLink` ao Card de contexto (idempotente por índice parcial ativo — 3.9).
 */
async function criarRegistro(
  ctx: ExecContext,
  acao: Acao,
  databaseId: string,
  cardIdParaVinculo: string | null,
): Promise<ResultadoExecucao> {
  const form = await ctx.db.form.findFirst({
    where: { context: 'DATABASE', databaseId },
    select: { id: true, publishedVersion: true },
  });
  if (!form || form.publishedVersion == null) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: databaseId };
  }
  const versao = await ctx.db.formVersion.findFirst({
    where: { formId: form.id, version: form.publishedVersion },
    select: { id: true, snapshot: true },
  });
  if (!versao) {
    return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: databaseId };
  }

  let valores: Record<string, unknown>;
  try {
    valores = validarSubmissao(versao.snapshot, acao.parametros.valores ?? {});
  } catch (err) {
    if (err instanceof SubmissaoInvalidaError) {
      return { state: 'DENIED', errorCode: 'ESTADO_INVALIDO', targetResourceId: databaseId };
    }
    throw err;
  }

  const idempotencyKey = `auto:${ctx.executionId}:${ctx.actionIndex}`;
  const correlationId = randomUUID();
  let recordId: string;

  try {
    recordId = await ctx.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, ctx.contexto)) await p;
      const novo = await tx.record.create({
        data: {
          orgId: ctx.contexto.orgId,
          databaseId,
          formId: form.id,
          formVersionId: versao.id,
          idempotencyKey,
          valores: valores as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      await tx.recordHistory.create({
        data: {
          orgId: ctx.contexto.orgId,
          recordId: novo.id,
          type: 'CREATED',
          summary: 'Registro criado pela Automação',
          actorId: ctx.contexto.accountId ?? null,
        },
      });
      if (cardIdParaVinculo) {
        await tx.cardRecordLink.create({
          data: {
            orgId: ctx.contexto.orgId,
            cardId: cardIdParaVinculo,
            recordId: novo.id,
            state: 'ACTIVE',
            correlationId,
            createdBy: ctx.contexto.accountId ?? null,
          },
        });
      }
      return novo.id;
    });
  } catch (err) {
    if (conflito(err)) {
      // Retry idempotente: o Registro desta Ação já existe (mesma idempotencyKey) — devolve-o, sem 2º Registro.
      const existente = await ctx.db.record.findFirst({
        where: { databaseId, idempotencyKey },
        select: { id: true },
      });
      if (existente) return { state: 'SUCCEEDED', errorCode: null, targetResourceId: existente.id };
      return { state: 'FAILED', errorCode: 'TRANSIENT_CONFLICT', targetResourceId: databaseId };
    }
    throw err;
  }
  return { state: 'SUCCEEDED', errorCode: null, targetResourceId: recordId };
}
