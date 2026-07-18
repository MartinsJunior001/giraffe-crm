import type { Prisma } from '../../generated/prisma';

/**
 * Porta de EVENTO de arquivo (Story 3.8) — a capacidade `files/` **não** conhece Card/Registro/histórico. Assim
 * como a autorização herda do recurso dono (`FileAuthzContract`), a TRILHA de auditoria de um anexo pertence ao
 * domínio dono: um anexo de Card vira evento no `CardHistory`; de Registro, no `RecordHistory`. Quem materializa
 * isso para um `(resourceType, resourceId)` concreto é o CONSUMIDOR (3.8), implementando esta interface.
 *
 * O evento é escrito na **MESMA transação** da mudança de estado do arquivo (promoção → DISPONIVEL; remoção
 * lógica) — AD-13: não há anexo sem seu evento. Por isso `registrar` recebe o `tx` da transação em curso. O
 * binding **default é no-op** (`FilesModule`): sem consumidor, a capacidade existe mas não emite evento de
 * domínio nenhum — nunca um evento especulativo (AD-11). Sem PII/chave: o evento só referencia o `fileId`.
 */
export type TipoEventoArquivo = 'FILE_ATTACHED' | 'FILE_REMOVED';

export interface EventoArquivo {
  resourceType: string;
  resourceId: string;
  fileId: string;
  tipo: TipoEventoArquivo;
}

export interface ContextoEvento {
  orgId: string;
  accountId?: string | null;
}

export interface FileEventSink {
  /** Registra o evento do anexo na trilha do recurso dono, DENTRO da transação `tx` da mudança de estado. */
  registrar(
    tx: Prisma.TransactionClient,
    contexto: ContextoEvento,
    evento: EventoArquivo,
  ): Promise<void>;
}

/**
 * Token de injeção. O consumidor liga a implementação real via `{ provide: FILE_EVENT_SINK, useClass: ... }`.
 * O default (`FilesModule`) é um no-op — nunca uma emissão de domínio especulativa.
 */
export const FILE_EVENT_SINK = Symbol('FILE_EVENT_SINK');
