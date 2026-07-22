import { ConflictException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../../../generated/prisma';
import type { PrismaService } from '../../kernel/db/prisma.service';
import {
  definirContextoOrg,
  type TenantContext,
  withTenantContext,
} from '../../kernel/db/tenant-context';
import { registrarEntradaNaFase } from '../cards/phase-entry/card-phase-entry';
import { emitirEventoDeDominio } from '../../domain-events/domain-event-emission';

/**
 * Conflito de concorrência na conversão (→ caminho idempotente / 409), idêntico ao `isConflitoDeSubmissao` da 2.7:
 * - **P2002**: violação do `@@unique([orgId, formId, idempotencyKey])` do Card com a chave `public:<submissaoId>` —
 *   duas conversões da MESMA submissão (dois aprovadores, ou DIRECT concorrente); o banco barrou a 2ª.
 * - **P2028**: a transação interativa expirou esperando a 1ª comitar no MESMO índice.
 * Tratar como conflito (devolver o Card já criado, ou 409) é honesto; deixar virar **500** esconderia a corrida
 * atrás de "erro interno". A transação é minúscula (2 inserts + 1 update).
 */
function isConflitoDeConversao(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

/**
 * Conversão atômica de uma `SubmissaoPublica` em `Card` (Story 2.8), compartilhada pela **criação direta**
 * (modo `DIRECT`) e pela **aprovação** na triagem. Numa transação interativa com contexto no client raiz (o
 * mesmo primitivo da 2.6/2.7): cria o Card (`origin=PUBLIC`, na 1ª Fase ativa, referenciando a `FormVersion`),
 * escreve o evento `CREATED` no `CardHistory` e marca a submissão `CONVERTED` com o `cardId` — **tudo junto**
 * (AD-13).
 *
 * **Idempotência da conversão (duas defesas):**
 *  1. a marcação usa `updateMany` com guarda de estado (`id` + `state: 'PENDING'`): se a submissão já foi
 *     decidida (ex.: aprovar concorrendo com rejeitar), `count=0` ⇒ rollback integral (o Card some) ⇒ 409;
 *  2. o `@@unique` do Card na chave `public:<submissaoId>`: duas conversões da MESMA submissão colidem no INSERT
 *     (P2002/P2028) — a 2ª devolve o Card já criado pela 1ª (idempotente) ou 409 se ainda em voo, **nunca 500**
 *     nem um 2º Card.
 *
 * **Auditoria manual (FR-214):** a tx raiz não passa pela extensão, então o `Card`/`CardHistory`/`SubmissaoPublica`
 * (modelos auditados) são registrados aqui, após o commit — só metadados, nunca os `valores`.
 */
export async function converterSubmissaoEmCard(
  prisma: PrismaService,
  contexto: TenantContext,
  dados: {
    submissaoId: string;
    formId: string;
    formVersionId: string;
    pipeId: string;
    phaseId: string;
    valores: Record<string, unknown>;
    /** `cardId` RESERVADO antes da conversão (Story 3.8/F6): os `FileObject` da submissão pública já foram
     *  vinculados a este id, então o Card precisa nascer com ele. Ausente ⇒ o banco gera (caminho 2.8 sem arquivos). */
    cardId?: string;
  },
  logger: PinoLogger,
): Promise<{ cardId: string }> {
  let cardId: string;
  try {
    cardId = await prisma.$transaction(async (tx) => {
      for (const p of definirContextoOrg(tx, contexto)) await p;

      const card = await tx.card.create({
        data: {
          ...(dados.cardId ? { id: dados.cardId } : {}),
          orgId: contexto.orgId,
          pipeId: dados.pipeId,
          phaseId: dados.phaseId,
          formId: dados.formId,
          formVersionId: dados.formVersionId,
          idempotencyKey: `public:${dados.submissaoId}`,
          valores: dados.valores as Prisma.InputJsonValue,
          origin: 'PUBLIC',
        },
        select: { id: true },
      });

      await tx.cardHistory.create({
        data: {
          orgId: contexto.orgId,
          cardId: card.id,
          type: 'CREATED',
          summary: 'Card criado por submissão pública',
          actorId: contexto.accountId ?? null,
        },
      });

      // 1ª entrada na Fase (Story 2.12) — MESMA transação: não há Card sem sua referência temporal de entrada.
      await registrarEntradaNaFase(tx, contexto, {
        cardId: card.id,
        phaseId: dados.phaseId,
        origin: 'SUBMISSION',
      });

      // Guarda de estado: só converte quem ainda está PENDING. count=0 ⇒ decidida por outra transação ⇒ 409.
      const marcada = await tx.submissaoPublica.updateMany({
        where: { id: dados.submissaoId, state: 'PENDING' },
        data: {
          state: 'CONVERTED',
          cardId: card.id,
          decidedBy: contexto.accountId ?? null,
          decidedAt: new Date(),
        },
      });
      if (marcada.count === 0) {
        throw new ConflictException('submissão já decidida');
      }

      // EVENTO CANÔNICO `CARD_CREATED` (Story 4.3) — outbox opt-in pós-persistência, MESMA transação (AD-13),
      // após a conversão estar confirmada. Só a conversão APROVADA (este caminho) cria Card e emite: a triagem
      // PENDING não chega aqui, então não dispara (CA2). `origin='PUBLIC'`; `correlationId = card.id` ⇒
      // `eventId` determinístico. A corrida de dupla conversão faz rollback integral (P2002 na `idempotencyKey`
      // `public:<submissaoId>`), sem duplicar o Evento (CA3). `payload` minimizado (AD-30).
      await emitirEventoDeDominio(tx, contexto, {
        eventType: 'CARD_CREATED',
        pipeId: dados.pipeId,
        resourceType: 'CARD',
        resourceId: card.id,
        actorId: contexto.accountId ?? null,
        origin: 'PUBLIC',
        occurredAt: new Date(),
        correlationId: card.id,
        payload: { pipeId: dados.pipeId, cardId: card.id, phaseId: dados.phaseId },
      });

      return card.id;
    });
  } catch (err) {
    if (isConflitoDeConversao(err)) {
      // Corrida na MESMA submissão: o vencedor já criou o Card. Devolve-o idempotente (nunca 2 Cards); se ainda
      // não visível (P2028 esperando o commit / vencedor em rollback), é contenção → 409, o cliente repete.
      const existente = await acharCardDaSubmissao(prisma, contexto, dados.submissaoId, logger);
      if (existente) return { cardId: existente };
      throw new ConflictException('conversão concorrente em andamento; repita a requisição');
    }
    throw err;
  }

  auditar(logger, contexto, 'create', 'Card');
  auditar(logger, contexto, 'create', 'CardHistory');
  auditar(logger, contexto, 'create', 'CardPhaseEntry');
  auditar(logger, contexto, 'create', 'DomainEvent');
  auditar(logger, contexto, 'update', 'SubmissaoPublica');
  return { cardId };
}

/** Card já criado para esta submissão (chave `public:<submissaoId>`), para o caminho idempotente do conflito. */
async function acharCardDaSubmissao(
  prisma: PrismaService,
  contexto: TenantContext,
  submissaoId: string,
  logger: PinoLogger,
): Promise<string | null> {
  const db = withTenantContext(prisma, contexto, logger);
  const card = await db.card.findFirst({
    where: { idempotencyKey: `public:${submissaoId}` },
    select: { id: true },
  });
  return card?.id ?? null;
}

/** Auditoria manual (FR-214) — a tx raiz não passa pela extensão. Só metadados; nunca os valores submetidos. */
function auditar(
  logger: PinoLogger,
  contexto: TenantContext,
  action: string,
  resource: string,
): void {
  logger.info(
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
