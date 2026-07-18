import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import type { ContextoEvento, EventoArquivo, FileEventSink } from '../files/file-event-sink';

/** `resourceType`s concretos que a 3.8 liga (allowlist; tipo desconhecido → não emite, sem falhar a operação). */
const RESOURCE_CARD = 'CARD';
const RESOURCE_RECORD = 'RECORD';

/** Resumos legíveis por tipo de evento (sem PII/chave — só a referência ao `fileId` vai no summary). */
const RESUMO: Record<EventoArquivo['tipo'], string> = {
  FILE_ATTACHED: 'Arquivo anexado',
  FILE_REMOVED: 'Arquivo removido',
};

/**
 * Implementação REAL da porta `FileEventSink` da 3.7 (Story 3.8, frente F5). Vive **fora** de `files/` (que é
 * agnóstico de domínio) e roteia o evento do anexo para a trilha do recurso dono: `CardHistory` (CARD) ou
 * `RecordHistory` (RECORD). Escreve na MESMA transação `tx` da mudança de estado do arquivo (AD-13) — recebe o
 * `tx` já com o contexto de Organização definido (o `FilesService` chama dentro do `$transaction` de promoção/
 * remoção). Puro em domínio (não é módulo Nest) — importável sem ciclo; injetado via `FilesModule.register(...)`.
 *
 * `resourceType` fora da allowlist ⇒ **não emite** e **não falha** a operação (um recurso futuro sem trilha não
 * pode quebrar o upload). O `summary` não carrega PII nem `bucketKey` — só a referência ao `fileId`.
 */
@Injectable()
export class FileEventDispatcher implements FileEventSink {
  async registrar(
    tx: Prisma.TransactionClient,
    contexto: ContextoEvento,
    evento: EventoArquivo,
  ): Promise<void> {
    const base = {
      orgId: contexto.orgId,
      type: evento.tipo,
      summary: `${RESUMO[evento.tipo]} (${evento.fileId})`,
      actorId: contexto.accountId ?? null,
    };
    if (evento.resourceType === RESOURCE_CARD) {
      await tx.cardHistory.create({ data: { ...base, cardId: evento.resourceId } });
      return;
    }
    if (evento.resourceType === RESOURCE_RECORD) {
      await tx.recordHistory.create({ data: { ...base, recordId: evento.resourceId } });
      return;
    }
    // resourceType sem trilha conhecida: silêncio (não emite, não falha a operação do arquivo).
  }
}
