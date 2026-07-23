import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import { withTenantContext } from '../kernel/db/tenant-context';
import type { FileAuthzContract } from '../files/file-authz.contract';
import {
  exigirLerCard,
  exigirOperarCard,
  exigirOperarPipe,
  resolverPoderNoPipe,
} from '../pipes/pipe-authz';
import { exigirLerDatabase, exigirOperarDatabase } from '../databases/database-authz';

type Db = ReturnType<typeof withTenantContext>;

/** `resourceType`s concretos que a 3.8/3.10/5.1/5.2 ligam (allowlist fail-closed; tipo desconhecido → nega). */
const RESOURCE_CARD = 'CARD';
const RESOURCE_RECORD = 'RECORD';
/** Story 3.10 — avatar da própria Conta. O `resourceId` é o `accountId` dono do arquivo. */
const RESOURCE_ACCOUNT = 'ACCOUNT';
/** Story 5.1 — anexo geral de Tarefa. O `resourceId` é o `taskId`; a autz herda do Pipe dono da Tarefa. */
const RESOURCE_TASK = 'TASK';
/** Story 5.2 — anexo geral de Solicitação. O `resourceId` é o `solicitacaoId`; herda do Pipe dono. */
const RESOURCE_SOLICITACAO = 'SOLICITACAO';

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
      if (resourceType === RESOURCE_TASK) {
        // O anexo de Tarefa (Story 5.1) herda a autz do Pipe dono: ver/baixar/listar = ler o Pipe; anexar/remover
        // = operar o Pipe. Resolve o dono sob RLS; Tarefa inexistente/de outra Org ⇒ nega (404 não-enumerante).
        const task = await db.task.findUnique({
          where: { id: resourceId },
          select: { pipeId: true, archiveState: true, pipe: { select: { state: true } } },
        });
        if (!task) return false;
        if (poder === 'ler')
          await resolverPoderNoPipe(db, contexto, task.pipeId); // qualquer poder; 404 sem acesso
        else {
          await exigirOperarPipe(db, contexto, task.pipeId); // 403 se só lê (Viewer); 404 sem acesso
          this.exigirTaskMutavel(task); // read-only sob arquivamento (§1526)
        }
        return true;
      }
      if (resourceType === RESOURCE_SOLICITACAO) {
        // O anexo de Solicitação (Story 5.2) herda a autz do Pipe dono: ver/baixar/listar = ler o Pipe;
        // anexar/remover = operar o Pipe. Resolve o dono sob RLS; Solicitação inexistente/de outra Org ⇒
        // nega (404 não-enumerante).
        const solicitacao = await db.solicitacao.findUnique({
          where: { id: resourceId },
          select: { pipeId: true, archiveState: true, pipe: { select: { state: true } } },
        });
        if (!solicitacao) return false;
        if (poder === 'ler')
          await resolverPoderNoPipe(db, contexto, solicitacao.pipeId); // qualquer poder; 404 sem acesso
        else {
          await exigirOperarPipe(db, contexto, solicitacao.pipeId); // 403 se só lê; 404 sem acesso
          this.exigirSolicitacaoMutavel(solicitacao); // read-only sob arquivamento (§1546)
        }
        return true;
      }
      if (resourceType === RESOURCE_ACCOUNT) {
        // SELF-ONLY (Story 3.10): o "recurso dono" do avatar é a própria Conta, e ninguém — nem o Admin da
        // Org — envia, troca ou baixa o avatar de outra pessoa. Ler e editar são a MESMA condição: não há
        // "ler o avatar alheio" nesta Fase (roster é E8), então não se abre leitura sem consumidor (AD-11).
        //
        // Não há gate de arquivamento aqui (ao contrário de Card/Registro): a Conta não tem ciclo de vida
        // arquivável nesta Fase. E não há consulta ao banco: a decisão é uma comparação de identidade do
        // contexto já resolvido pelo servidor. A RLS de `AccountAvatar` é o backstop — mesmo que esta
        // comparação fosse burlada, a policy self-only negaria a escrita.
        return contexto.accountId === resourceId;
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

  /**
   * Tarefa ARQUIVADA (ou sob Pipe arquivado) é somente-leitura para anexo/remoção (§1526, espelha Card/Registro):
   * 409, não silêncio. Ler/baixar/listar (poder=ler) NÃO passa por aqui. Puro sobre o dado já lido — sem I/O.
   */
  private exigirTaskMutavel(task: { archiveState: string; pipe: { state: string } | null }): void {
    if (task.archiveState === 'ARQUIVADA' || task.pipe?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'TAREFA_ARQUIVADA' });
    }
  }

  /**
   * Solicitação ARQUIVADA (ou sob Pipe arquivado) é somente-leitura para anexo/remoção (§1546, espelha
   * Tarefa/Card/Registro): 409, não silêncio. Ler/baixar/listar (poder=ler) NÃO passa por aqui. Puro sobre o
   * dado já lido — sem I/O.
   */
  private exigirSolicitacaoMutavel(solicitacao: {
    archiveState: string;
    pipe: { state: string } | null;
  }): void {
    if (solicitacao.archiveState === 'ARQUIVADA' || solicitacao.pipe?.state === 'ARCHIVED') {
      throw new ConflictException({ motivo: 'SOLICITACAO_ARQUIVADA' });
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
