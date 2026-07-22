import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../../generated/prisma';
import { PrismaService } from '../../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../../kernel/db/tenant-context';
import type { Acao, Condicao, Referencia } from '../automation-config';
import { avaliarCondicoes } from '../conditions/condition-eval.core';
import { PRINCIPAL_AUTOMACAO, type PrincipalAutomacao } from '../actions/automation-principal';
import { executarAcao, type ExecContext } from './action-executors';
import { proximaAcaoPendente } from './engine-dedup.core';
import { completarEstadosDeAcao, estadoFinalDaExecucao } from './execution-plan.core';
import { ehErroTransitorio, esgotou, leaseAte, proximaTentativaEm } from './retry-policy.core';
import { montarSnapshotEContexto } from './snapshot-builder';
import type { ActionResultState } from './engine-types';

type Db = ReturnType<typeof withTenantContext>;

/** A config congelada, lida do `AutomationVersion.snapshot`. */
interface ConfigCongelada {
  quando: { tipo: string; refs: Referencia[] };
  condicoes: Condicao[];
  entao: Acao[];
}

/**
 * MOTOR de disparo e avaliação (Story 4.6). Serviço SINGLETON (não `RequestContext`-scoped) — recebe o contexto
 * do EVENTO (do outbox `DomainEvent`), nunca do cliente. Consome 4.3 (outbox), 4.4 (`avaliarCondicoes`) e 4.5
 * (`resolverAlvoDeterministico`/`revalidarAcao`/principal), executando as Ações sob o **principal Automação** com
 * entrega **at-least-once** idempotente. Ver a consolidação do gate de Arquitetura em
 * `_bmad-output/implementation-artifacts/decisions/automation-engine-4-6.md`.
 *
 * **Primitivos públicos (o "drain" é invocável, não um loop escondido):**
 *  · `enfileirarParaEvento` — materializa as Execuções PENDING (dedup) para as Automações ativas inscritas no
 *    Evento (consumo do outbox);
 *  · `drenarOrg` — reivindica Execuções PENDING/lease-vencida (`FOR UPDATE SKIP LOCKED`) e as processa
 *    (concorrência-segura + recuperação de crash);
 *  · `processarEventoAgora` — conveniência (enfileirar + drenar) para o caminho síncrono/testes.
 *
 * O DISPATCHER contínuo (opt-in, gated por env) fica na composição do módulo; o loop robusto multi-réplica é
 * 4.7/deployment (AD-11 — não antecipado aqui).
 */
@Injectable()
export class AutomationEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(orgId: string): Db {
    return withTenantContext(this.prisma, { orgId }, this.logger);
  }

  /** Lê a config congelada da versão ativa de uma Automação; `null` se a versão não existe (Automação inerte). */
  private lerConfig(snapshot: Prisma.JsonValue): ConfigCongelada | null {
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
    const s = snapshot as Record<string, unknown>;
    const quando = s.quando as ConfigCongelada['quando'] | undefined;
    const entao = s.entao as Acao[] | undefined;
    if (!quando || typeof quando.tipo !== 'string' || !Array.isArray(entao)) return null;
    return {
      quando: { tipo: quando.tipo, refs: Array.isArray(quando.refs) ? quando.refs : [] },
      condicoes: Array.isArray(s.condicoes) ? (s.condicoes as Condicao[]) : [],
      entao,
    };
  }

  /** Constrói o principal Automação da definição VERSIONADA (escopo restrito; deny-by-default — não do criador). */
  private montarPrincipal(
    orgId: string,
    pipeId: string,
    automationId: string,
    versao: number,
    config: ConfigCongelada,
  ): PrincipalAutomacao {
    const refs: Referencia[] = [
      ...config.quando.refs,
      ...config.condicoes.flatMap((c) => c.refs ?? []),
      ...config.entao.flatMap((a) => a.refs ?? []),
    ];
    return {
      tipo: PRINCIPAL_AUTOMACAO,
      orgId,
      pipeId,
      automationId,
      automationVersionId: String(versao),
      recursosAutorizados: new Set<string>([pipeId, ...refs.map((r) => r.id)]),
      capacidades: new Set<string>(config.entao.map((a) => a.tipo)),
    };
  }

  /**
   * Materializa as Execuções PENDING (dedup) para as Automações ATIVAS inscritas num Evento. Consumo do outbox:
   * Card/vínculo ⇒ Automações do Pipe do Evento; Registro (sem Pipe) ⇒ Automações ativas da Org cujo gatilho casa
   * (o CONTAINMENT M-1 do snapshot-builder resolve o alcance por-Automação no processamento). Idempotente: o
   * `@@unique(orgId,eventId,automationId,automationVersionId)` faz o 2º enfileiramento colidir (P2002) — ignorado.
   */
  async enfileirarParaEvento(orgId: string, eventId: string): Promise<number> {
    const db = this.db(orgId);
    const evento = await db.domainEvent.findFirst({
      where: { eventId },
      select: {
        eventId: true,
        eventType: true,
        pipeId: true,
        actorId: true,
        correlationId: true,
        executionChainId: true,
      },
    });
    if (!evento) return 0;

    const automacoes = await db.automation.findMany({
      where: { state: 'ACTIVE', ...(evento.pipeId ? { pipeId: evento.pipeId } : {}) },
      select: { id: true, pipeId: true, activeVersion: true },
    });

    let criadas = 0;
    for (const auto of automacoes) {
      if (auto.activeVersion == null) continue; // ACTIVE sem versão não deveria ocorrer (invariante 4.2) — defesa
      const versao = await db.automationVersion.findFirst({
        where: { automationId: auto.id, version: auto.activeVersion },
        select: { snapshot: true, revision: true },
      });
      if (!versao) continue;
      const config = this.lerConfig(versao.snapshot);
      if (!config) continue;
      if (config.quando.tipo !== evento.eventType) continue; // gatilho não casa ⇒ não enfileira

      try {
        await db.automationExecution.create({
          data: {
            orgId,
            eventId: evento.eventId,
            automationId: auto.id,
            automationVersionId: auto.activeVersion,
            configSnapshotRevision: versao.revision,
            pipeId: auto.pipeId,
            state: 'PENDING',
            initiatorType: evento.actorId ? 'HUMANO' : 'SISTEMA',
            initiatorAccountId: evento.actorId,
            correlationId: evento.correlationId,
            executionChainId: evento.executionChainId,
          },
        });
        criadas++;
      } catch (err) {
        if (!isP2002(err)) throw err; // já enfileirada (dedup) ⇒ idempotente; qualquer outro erro propaga
      }
    }
    return criadas;
  }

  /**
   * Reivindica Execuções PENDING/lease-vencida via `FOR UPDATE SKIP LOCKED` (concorrência-segura: dois workers
   * nunca pegam a mesma linha) e as processa. Uma Execução `RUNNING` de lease VENCIDO é retomada (recuperação de
   * crash — §1406); o dedup por Ação garante que efeitos já concluídos não repetem. Devolve quantas processou.
   */
  async drenarOrg(orgId: string, limite = 20): Promise<number> {
    const ids = await this.reivindicar(orgId, limite);
    for (const id of ids) {
      await this.processarReivindicada(orgId, id);
    }
    return ids.length;
  }

  /** Conveniência síncrona (testes / caminho direto): enfileira e drena o próprio Evento. */
  async processarEventoAgora(orgId: string, eventId: string): Promise<void> {
    await this.enfileirarParaEvento(orgId, eventId);
    await this.drenarOrg(orgId);
  }

  /** Reivindica atômica: seleciona PENDING/lease-vencida com `FOR UPDATE SKIP LOCKED` e marca RUNNING+lease. */
  private async reivindicar(orgId: string, limite: number): Promise<string[]> {
    const owner = randomUUID();
    const lease = leaseAte(new Date());
    return this.prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, { orgId })) await p;
      const linhas = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "AutomationExecution"
        WHERE "orgId" = ${orgId}::uuid
          AND (
            ("state" = 'PENDING' AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= now()))
            OR ("state" = 'RUNNING' AND "leaseExpiresAt" IS NOT NULL AND "leaseExpiresAt" <= now())
          )
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT ${limite}
      `);
      const ids = linhas.map((l) => l.id);
      if (ids.length > 0) {
        await tx.automationExecution.updateMany({
          where: { id: { in: ids } },
          data: {
            state: 'RUNNING',
            leaseOwner: owner,
            leaseExpiresAt: lease,
            startedAt: new Date(),
          },
        });
      }
      return ids;
    });
  }

  /** Processa uma Execução já REIVINDICADA (RUNNING). Idempotente por Ação; trata transitório com backoff. */
  private async processarReivindicada(orgId: string, execId: string): Promise<void> {
    const db = this.db(orgId);
    const exec = await db.automationExecution.findUnique({
      where: { id: execId },
      select: {
        id: true,
        eventId: true,
        automationId: true,
        automationVersionId: true,
        pipeId: true,
        attempt: true,
        correlationId: true,
        executionChainId: true,
        initiatorType: true,
        initiatorAccountId: true,
      },
    });
    if (!exec) return;

    try {
      await this.executarPipeline(orgId, db, exec);
    } catch (err) {
      if (ehErroTransitorio(err)) {
        await this.agendarRetry(orgId, execId, exec.attempt);
        return;
      }
      // Erro inesperado (não transitório): estado final explícito FAILED — nenhuma falha desaparece (§1405).
      await this.finalizar(orgId, execId, 'FAILED', 'EXECUTOR_ERROR');
      this.logger.warn(
        { event: 'automation.engine.error', orgId, execId },
        'falha não-transitória na Execução',
      );
    }
  }

  /** O núcleo: monta snapshot → avalia Condições → executa Ações em ordem (efeitos parciais) → estado final. */
  private async executarPipeline(
    orgId: string,
    db: Db,
    exec: {
      id: string;
      eventId: string;
      automationId: string;
      automationVersionId: number;
      pipeId: string;
    },
  ): Promise<void> {
    const evento = await db.domainEvent.findFirst({
      where: { eventId: exec.eventId },
      select: {
        orgId: true,
        eventType: true,
        pipeId: true,
        resourceType: true,
        resourceId: true,
        occurredAt: true,
      },
    });
    const versao = await db.automationVersion.findFirst({
      where: { automationId: exec.automationId, version: exec.automationVersionId },
      select: { snapshot: true },
    });
    const config = versao ? this.lerConfig(versao.snapshot) : null;
    if (!evento || !config) {
      await this.finalizar(orgId, exec.id, 'FAILED', 'EXECUTOR_ERROR');
      return;
    }

    const principal = this.montarPrincipal(
      orgId,
      exec.pipeId,
      exec.automationId,
      exec.automationVersionId,
      config,
    );
    const { snapshot, contexto } = await montarSnapshotEContexto(db, evento, exec.pipeId);

    // Condições AND (4.4) — não satisfeita ⇒ nenhuma Ação (§1408/§1411).
    const avaliacao = avaliarCondicoes(config.condicoes, snapshot);
    if (!avaliacao.aprovado) {
      await this.finalizar(orgId, exec.id, 'SKIPPED_CONDITIONS', 'CONDITION_NOT_MET');
      return;
    }

    // Ações em ORDEM. Retomada idempotente: pula índices JÁ gravados (dedup por Ação — §1403).
    const jaGravados = await db.automationActionResult.findMany({
      where: { executionId: exec.id },
      select: { actionIndex: true, state: true },
    });
    const indices = new Set(jaGravados.map((r) => r.actionIndex));
    const executados: ActionResultState[] = [];
    // Preserva o desfecho já gravado das Ações anteriores (para o estado final correto após retomada).
    for (const r of [...jaGravados].sort((a, b) => a.actionIndex - b.actionIndex)) {
      executados[r.actionIndex] = r.state as ActionResultState;
    }

    let encerrou = executados.some(
      (s) => s === 'FAILED' || s === 'DENIED' || s === 'BLOCKED_CONFIRMATION',
    );

    for (
      let i = proximaAcaoPendente(config.entao.length, indices) ?? config.entao.length;
      i < config.entao.length;
      i++
    ) {
      if (indices.has(i)) continue;
      if (encerrou) {
        await this.gravarResultado(
          orgId,
          exec.id,
          i,
          config.entao[i]!.tipo,
          'BLOCKED_PRIOR_FAILURE',
          'PRIOR_ACTION_BLOCKED',
          null,
        );
        executados[i] = 'BLOCKED_PRIOR_FAILURE';
        continue;
      }
      const ctx: ExecContext = {
        prisma: this.prisma,
        db,
        contexto: { orgId },
        principal,
        executionId: exec.id,
        actionIndex: i,
      };
      const r = await executarAcao(ctx, config.entao[i]!, contexto);
      await this.gravarResultado(
        orgId,
        exec.id,
        i,
        config.entao[i]!.tipo,
        r.state,
        r.errorCode,
        r.targetResourceId,
      );
      executados[i] = r.state;
      if (r.state === 'FAILED' || r.state === 'DENIED' || r.state === 'BLOCKED_CONFIRMATION')
        encerrou = true;
    }

    const completos = completarEstadosDeAcao(
      config.entao.map((_, i) => executados[i] ?? 'BLOCKED_PRIOR_FAILURE'),
      config.entao.length,
    );
    const estadoFinal = estadoFinalDaExecucao(completos);
    await this.finalizar(orgId, exec.id, estadoFinal, null);
  }

  /** Grava o resultado de UMA Ação (append-only, dedup por índice). Colisão P2002 = já gravado ⇒ ignora. */
  private async gravarResultado(
    orgId: string,
    executionId: string,
    actionIndex: number,
    actionType: string,
    state: ActionResultState,
    errorCode: string | null,
    targetResourceId: string | null,
  ): Promise<void> {
    const db = this.db(orgId);
    try {
      await db.automationActionResult.create({
        data: { orgId, executionId, actionIndex, actionType, state, errorCode, targetResourceId },
      });
    } catch (err) {
      if (!isP2002(err)) throw err; // dedup por Ação: já gravado ⇒ idempotente
    }
  }

  /** Fecha a Execução num estado final (guarda otimista: só de RUNNING → não re-fecha uma corrida). */
  private async finalizar(
    orgId: string,
    execId: string,
    state: 'SUCCEEDED' | 'PARTIAL' | 'FAILED' | 'SKIPPED_CONDITIONS' | 'BLOCKED_CONFIRMATION',
    lastErrorCode: string | null,
  ): Promise<void> {
    const db = this.db(orgId);
    await db.automationExecution.updateMany({
      where: { id: execId, state: 'RUNNING' },
      data: {
        state,
        finishedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode,
      },
    });
  }

  /** Falha transitória: volta a PENDING com backoff, ou FAILED definitivo se esgotou as tentativas (§1405). */
  private async agendarRetry(orgId: string, execId: string, attemptAtual: number): Promise<void> {
    const db = this.db(orgId);
    const proximo = attemptAtual + 1;
    if (esgotou(proximo)) {
      await db.automationExecution.updateMany({
        where: { id: execId, state: 'RUNNING' },
        data: {
          state: 'FAILED',
          finishedAt: new Date(),
          attempt: proximo,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: 'MAX_ATTEMPTS_EXCEEDED',
        },
      });
      return;
    }
    await db.automationExecution.updateMany({
      where: { id: execId, state: 'RUNNING' },
      data: {
        state: 'PENDING',
        attempt: proximo,
        nextAttemptAt: proximaTentativaEm(new Date(), proximo),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: 'TRANSIENT_CONFLICT',
      },
    });
  }
}

/** P2002 (unique violation) — usado nos caminhos idempotentes (enfileirar/gravarResultado). */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}
