import { Prisma } from '../../generated/prisma';
import { obterEventoCatalogo } from './event-catalog';
import { type DadosEvento, montarEnvelope } from './event-envelope';

/**
 * Write-side da EMISSÃO opt-in pós-persistência de um Evento canônico (Story 4.3 — AD-13). Contrato ÚNICO que
 * insere uma linha `DomainEvent` (outbox append-only, imutável) DENTRO de uma transação já existente com
 * contexto — recebe o `tx` do chamador (nunca abre transação própria), para nascer ATÔMICO com o fato de
 * domínio que o originou. Espelha o desenho de `registrarEntradaNaFase` (2.12) e `montarEnvelope`+`create` da
 * movimentação (2.16).
 *
 * **Opt-in (Story §1339):** o produtor CHAMA este helper deliberadamente, DEPOIS de persistir a mudança, na
 * MESMA transação. Não há emissão automática/implícita. A linha é INERTE: não dispara Automação/Notificação
 * (isso é o motor, 4.6) — só persiste o fato de integração.
 *
 * **Não há Evento sem o fato (AD-13):** como a inserção vive na transação do produtor, o rollback do fato
 * reverte o Evento por construção. E não há fato sem Evento onde o contrato exige, porque o produtor chama
 * este helper na mesma tx da criação.
 *
 * **Idempotência:** o `eventId` é DETERMINÍSTICO (uuidv5 do envelope). Um reprocessamento do mesmo fato
 * reproduz o `eventId`; o `@@unique([orgId, eventId])` faz o 2º INSERT colidir (P2002) — o chamador trata a
 * colisão como idempotente/409, NUNCA 500 (mesmo padrão de 2.7/2.16).
 *
 * **Minimização (AD-30):** o `montarEnvelope` já reduz o `payload` à allowlist; `valores`/PII/segredo nunca
 * chegam à linha, mesmo se o produtor passar dado a mais por engano.
 */
export async function emitirEventoDeDominio(
  tx: Prisma.TransactionClient,
  contexto: { orgId: string },
  dados: Omit<DadosEvento, 'orgId'>,
): Promise<{ eventId: string }> {
  // Fail-closed: emitir um tipo fora do catálogo é erro de programação do produtor, não uma linha silenciosa.
  if (!obterEventoCatalogo(dados.eventType)) {
    throw new Error(`emitirEventoDeDominio: eventType fora do catálogo (${dados.eventType})`);
  }

  const envelope = montarEnvelope({ ...dados, orgId: contexto.orgId });

  await tx.domainEvent.create({
    data: {
      orgId: envelope.organizationId,
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      schemaVersion: envelope.schemaVersion,
      pipeId: envelope.pipeId,
      resourceType: envelope.resourceType,
      resourceId: envelope.resourceId,
      actorId: envelope.actorId,
      origin: envelope.origin,
      occurredAt: envelope.occurredAt,
      correlationId: envelope.correlationId,
      causationId: envelope.causationId,
      executionChainId: envelope.executionChainId,
      payload: envelope.payload as Prisma.InputJsonValue,
    },
  });

  return { eventId: envelope.eventId };
}
