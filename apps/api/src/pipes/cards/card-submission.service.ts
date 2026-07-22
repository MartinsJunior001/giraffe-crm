import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import { type ContextoOrganizacional, RequestContext } from '../../kernel/context/request-context';
import { PrismaService } from '../../kernel/db/prisma.service';
import { definirContextoOrg, withTenantContext } from '../../kernel/db/tenant-context';
import { getEnv } from '../../kernel/config/env';
import { exigirOperarPipe } from '../pipe-authz';
import { snapshotExigeCapacidadeArquivo } from '../forms/file-gate';
import { registrarEntradaNaFase } from './phase-entry/card-phase-entry';
import { emitirEventoDeDominio } from '../../domain-events/domain-event-emission';
import { SubmissaoInvalidaError, validarSubmissao } from './submission';

type Db = ReturnType<typeof withTenantContext>;

/** O que um Card expõe pela API interna (`orgId` fica fora da fronteira). */
export interface CardVisao {
  id: string;
  pipeId: string;
  phaseId: string;
  formId: string;
  formVersionId: string;
  valores: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}

/** Projeção fixa do Card. */
const SELECT_CARD = {
  id: true,
  pipeId: true,
  phaseId: true,
  formId: true,
  formVersionId: true,
  valores: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Conflito de concorrência na criação do Card (→ caminho idempotente / 409), simétrico ao
 * `isConflitoDePublicacao` da 2.6:
 * - **P2002**: violação do `@@unique([orgId, formId, idempotencyKey])` — duas submissões da MESMA chave; o banco
 *   barrou a segunda. Caminho comum sob concorrência.
 * - **P2028**: a transação interativa expirou. Sob contenção no MESMO índice, a 2ª submissão BLOQUEIA esperando
 *   a 1ª comitar; se esse bloqueio estourar o timeout ANTES de a violação de unicidade se materializar, o Prisma
 *   lança P2028. Ainda é contenção de idempotência — tratá-lo como conflito (retry/Card existente) é honesto;
 *   deixá-lo virar 500 esconderia a corrida atrás de "erro interno" (a transação é minúscula: 2 inserts).
 */
function isConflitoDeSubmissao(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Submissão INTERNA do Formulário inicial (Story 2.7). Uma submissão válida **cria** um Card (nunca preenche um
 * existente — D3.3): o Card nasce na 1ª Fase ativa do Pipe, referencia a `FormVersion` publicada no ato
 * (definição congelada — AD-12) e guarda os `valores` validados (chaveados por `Field.id`). Um evento `CREATED`
 * é escrito no `CardHistory` na MESMA transação (AD-13).
 *
 * **Gate**: só Formulário PUBLICADO recebe submissão (`Form.publishedVersion` não nulo). **Autorização**:
 * OPERAR o Pipe (Admin da Org / Admin do Pipe / Membro) — Viewer não submete. **Idempotência**: `idempotencyKey`
 * + `@@unique([orgId, formId, idempotencyKey])`; um retry devolve o Card existente, não duplica.
 *
 * **Atomicidade**: como a publicação (2.6), a criação toca duas escritas (Card + CardHistory). `withTenantContext`
 * recusa `$transaction` no client estendido — usa-se a transação interativa no client raiz com contexto
 * transaction-local (`definirContextoOrg`), a mesma fonte única. Auditoria manual (FR-214), pois este caminho
 * não passa pela extensão.
 */
@Injectable()
export class CardSubmissionService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /**
   * Submete o Formulário inicial do Pipe e cria o Card. 404 se o Pipe/Formulário não existe ou sem acesso; 403
   * se só pode ler; **409** se o Formulário não está publicado; **400** se os valores são inválidos.
   */
  async submeter(
    pipeId: string,
    dto: { idempotencyKey: string; valores: unknown },
  ): Promise<CardVisao> {
    const { contexto, db } = this.db();
    await exigirOperarPipe(db, contexto, pipeId);

    // Formulário inicial materializado?
    const form = await db.form.findFirst({
      where: { orgId: contexto.orgId, context: 'PIPE_INITIAL', pipeId },
      select: { id: true, publishedVersion: true },
    });
    if (!form) throw new NotFoundException();
    if (form.publishedVersion == null) {
      throw new ConflictException('o Formulário inicial não está publicado');
    }

    // Versão publicada (definição congelada).
    const versao = await db.formVersion.findFirst({
      where: { formId: form.id, version: form.publishedVersion },
      select: { id: true, snapshot: true },
    });
    if (!versao) throw new ConflictException('versão publicada indisponível');

    // Gate de CONSUMO (Story 3.8, RF-3 / ADR AC-2): a versão publicada exige Campo Arquivo mas a capacidade
    // está desligada ⇒ 409 honesto, nunca aceite silencioso nem erro opaco (o Formulário foi publicado com a
    // capacidade ligada e ela foi desligada depois — a definição congelada ainda pede arquivo).
    if (snapshotExigeCapacidadeArquivo(versao.snapshot) && !getEnv().FILE_UPLOAD_ENABLED) {
      throw new ConflictException({ motivo: 'CAPACIDADE_ARQUIVO_INDISPONIVEL' });
    }

    // Valida os valores contra o snapshot (400 determinístico).
    let valores: Record<string, unknown>;
    try {
      valores = validarSubmissao(versao.snapshot, dto.valores);
    } catch (err) {
      if (err instanceof SubmissaoInvalidaError) throw new BadRequestException(err.message);
      throw err;
    }

    // 1ª Fase ativa do Pipe (o Card nasce nela). O Pipe garante ≥1 Fase ativa (2.3).
    const fase = await db.phase.findFirst({
      where: { pipeId, state: 'ACTIVE' },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (!fase) throw new ConflictException('o Pipe não tem Fase ativa');

    return this.criarAtomico(contexto, {
      pipeId,
      phaseId: fase.id,
      formId: form.id,
      formVersionId: versao.id,
      idempotencyKey: dto.idempotencyKey,
      valores,
    });
  }

  // ── Internos ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Cria o Card e o evento `CREATED` do Histórico numa transação interativa atômica com contexto. Idempotência:
   * se `(orgId, formId, idempotencyKey)` já existe (retry da mesma submissão), o `UNIQUE` dispara P2002, a
   * transação faz rollback e devolvemos o Card **existente** — 1 submissão lógica ≤ 1 Card.
   */
  private async criarAtomico(
    contexto: ContextoOrganizacional,
    dados: {
      pipeId: string;
      phaseId: string;
      formId: string;
      formVersionId: string;
      idempotencyKey: string;
      valores: Record<string, unknown>;
    },
  ): Promise<CardVisao> {
    let card: CardVisao;
    try {
      card = await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        const novo = await tx.card.create({
          data: {
            orgId: contexto.orgId,
            pipeId: dados.pipeId,
            phaseId: dados.phaseId,
            formId: dados.formId,
            formVersionId: dados.formVersionId,
            idempotencyKey: dados.idempotencyKey,
            valores: dados.valores as Prisma.InputJsonValue,
          },
          select: SELECT_CARD,
        });

        // Evento de criação — MESMA transação (AD-13): não há Card sem evento nem evento sem Card.
        await tx.cardHistory.create({
          data: {
            orgId: contexto.orgId,
            cardId: novo.id,
            type: 'CREATED',
            summary: 'Card criado pela submissão do Formulário inicial',
            actorId: contexto.accountId ?? null,
          },
        });

        // 1ª entrada na Fase (Story 2.12) — MESMA transação: não há Card sem sua referência temporal de entrada.
        await registrarEntradaNaFase(tx, contexto, {
          cardId: novo.id,
          phaseId: dados.phaseId,
          origin: 'SUBMISSION',
        });

        // EVENTO CANÔNICO `CARD_CREATED` (Story 4.3) — outbox opt-in pós-persistência, MESMA transação (AD-13):
        // não há Card sem seu Evento. `correlationId = novo.id` torna o `eventId` DETERMINÍSTICO (um Card é
        // criado uma vez) — um retry faz rollback INTEGRAL da tx (P2002 na `idempotencyKey` do Card), então o
        // Evento nunca duplica; o `@@unique([orgId, eventId])` é a defesa final. `payload` minimizado (AD-30).
        await emitirEventoDeDominio(tx, contexto, {
          eventType: 'CARD_CREATED',
          pipeId: dados.pipeId,
          resourceType: 'CARD',
          resourceId: novo.id,
          actorId: contexto.accountId ?? null,
          origin: 'SUBMISSION',
          occurredAt: new Date(),
          correlationId: novo.id,
          payload: { pipeId: dados.pipeId, cardId: novo.id, phaseId: dados.phaseId },
        });

        return novo;
      });
    } catch (err) {
      if (isConflitoDeSubmissao(err)) {
        // Retry da mesma submissão lógica: devolve o Card já criado (idempotente), não duplica nem erra.
        const existente = await this.acharPorChave(dados.formId, dados.idempotencyKey);
        if (existente) return existente;
        // Conflito sem Card visível ainda (P2028 esperando o vencedor comitar, ou vencedor em rollback):
        // é contenção, não erro interno — 409 (o cliente repete), NUNCA 500.
        throw new ConflictException('submissão concorrente em andamento; repita a requisição');
      }
      throw err;
    }

    this.auditar(contexto, 'create', 'Card');
    this.auditar(contexto, 'create', 'CardHistory');
    this.auditar(contexto, 'create', 'CardPhaseEntry');
    this.auditar(contexto, 'create', 'DomainEvent');
    return card;
  }

  /** Card por chave de idempotência (para o caminho de retry). */
  private async acharPorChave(formId: string, idempotencyKey: string): Promise<CardVisao | null> {
    const { db } = this.db();
    return db.card.findFirst({
      where: { formId, idempotencyKey },
      select: SELECT_CARD,
    });
  }

  /** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca os valores submetidos. */
  private auditar(contexto: ContextoOrganizacional, action: string, resource: string): void {
    this.logger.info(
      {
        event: 'audit',
        actor: contexto.accountId ?? null,
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
