import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';
import type { FileAuthzContract } from '../files/file-authz.contract';
import { exigirLerCard, exigirOperarCard } from '../pipes/pipe-authz';
import { exigirLerDatabase, exigirOperarDatabase } from '../databases/database-authz';

type Db = ReturnType<typeof withTenantContext>;

/** `resourceType`s concretos que a 3.8 liga (allowlist fail-closed; tipo desconhecido → nega). */
const RESOURCE_CARD = 'CARD';
const RESOURCE_RECORD = 'RECORD';

/**
 * Implementação REAL da porta `FileAuthzContract` da 3.7 (Story 3.8, frente F1). A 3.7 é agnóstica de domínio;
 * este dispatcher — que vive **fora** de `files/` — roteia `(resourceType, resourceId)` para as guardas FINAS
 * puras do recurso dono (DBT-AUTHZ-01): `pipe-authz` para Card, `database-authz` para Registro. As guardas são
 * **funções puras** (não módulos Nest), então importá-las aqui **não cria ciclo de módulo**; este provider é
 * injetado no `FilesModule` via `FilesModule.register(...)` a partir do `AppModule` (o `files/` não importa
 * `pipes/`/`databases/`).
 *
 * Herança de permissão (INV-FILE-03): ver/baixar = **ler** o recurso; enviar/substituir/remover = **operar**.
 * Deny-by-default e **fail-closed**: qualquer negativa (404/403 das guardas) ou `resourceType` desconhecido ⇒
 * `false`. O `FilesService` traduz `false` em 404 não-enumerante (leitura) ou nega a mutação — nunca vaza
 * existência do arquivo/recurso.
 */
@Injectable()
export class FileAuthzDispatcher implements FileAuthzContract {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {}

  private ctx(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  async podeLer(resourceType: string, resourceId: string): Promise<boolean> {
    return this.decidir(resourceType, resourceId, 'ler');
  }

  async podeEditar(resourceType: string, resourceId: string): Promise<boolean> {
    return this.decidir(resourceType, resourceId, 'operar');
  }

  /**
   * Núcleo do roteamento. Traduz a guarda fina (que **lança** 404/403) em booleano fail-closed. Um erro de
   * acesso é negativa legítima (deny); qualquer outro erro também nega (fail-closed) — o `FilesService` decide
   * o código HTTP. `resourceType` fora da allowlist ⇒ nega (não há recurso dono conhecido).
   */
  private async decidir(
    resourceType: string,
    resourceId: string,
    poder: 'ler' | 'operar',
  ): Promise<boolean> {
    const { contexto, db } = this.ctx();
    try {
      if (resourceType === RESOURCE_CARD) {
        if (poder === 'ler') await exigirLerCard(db, contexto, resourceId);
        else {
          await exigirOperarCard(db, contexto, resourceId);
          await this.exigirCardMutavel(db, resourceId); // read-only sob arquivamento (RF-7/AC7)
        }
        return true;
      }
      if (resourceType === RESOURCE_RECORD) {
        // O arquivo de Registro é vinculado por `recordId`; a autz do Registro é por `databaseId` (3.4). Resolve
        // o dono sob RLS; Registro inexistente/de outra Org ⇒ nega (404 não-enumerante).
        const record = await db.record.findUnique({
          where: { id: resourceId },
          select: { databaseId: true, lifecycleState: true },
        });
        if (!record) return false;
        if (poder === 'ler') await exigirLerDatabase(db, contexto, record.databaseId);
        else {
          await exigirOperarDatabase(db, contexto, record.databaseId);
          await this.exigirRecordMutavel(db, record.databaseId, record.lifecycleState); // RF-7/AC7
        }
        return true;
      }
      return false; // resourceType desconhecido: deny-by-default.
    } catch (err) {
      // Recurso arquivado ⇒ 409 explícito (read-only sob arquivamento), propaga. Negativa das guardas (404/403)
      // ou qualquer outra falha ⇒ nega (fail-closed, nunca vaza o motivo).
      if (err instanceof ConflictException) throw err;
      return false;
    }
  }

  /**
   * Anexar/remover arquivo é MUTAÇÃO — bloqueada sob arquivamento (RF-7/AC7). O Card ARQUIVADO (ou sob Pipe
   * arquivado) é somente-leitura: 409, não silêncio. Ler/baixar/listar (poder=ler) NÃO passa por aqui.
   */
  private async exigirCardMutavel(db: Db, cardId: string): Promise<void> {
    const card = await db.card.findUnique({
      where: { id: cardId },
      select: { lifecycleState: true, pipe: { select: { state: true } } },
    });
    if (card?.lifecycleState === 'ARQUIVADO' || card?.pipe?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'CARD_ARQUIVADO' });
    }
  }

  /** Registro ARQUIVADO (ou sob Database arquivado) é somente-leitura para anexo/remoção (RF-7/AC7): 409. */
  private async exigirRecordMutavel(
    db: Db,
    databaseId: string,
    lifecycleState: string,
  ): Promise<void> {
    if (lifecycleState === 'ARQUIVADO') {
      throw new ConflictException({ motivo: 'RECORD_ARQUIVADO' });
    }
    const database = await db.database.findUnique({
      where: { id: databaseId },
      select: { state: true },
    });
    if (database?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'DATABASE_ARQUIVADO' });
    }
  }
}
