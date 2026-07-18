import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { PinoLogger } from 'nestjs-pino';
import { type ContextoOrganizacional, RequestContext } from '../kernel/context/request-context';
import { PrismaService } from '../kernel/db/prisma.service';
import {
  definirContextoOrg,
  type TenantContext,
  withTenantContext,
} from '../kernel/db/tenant-context';
import { getEnv } from '../kernel/config/env';
import { ScanSlotSemaphore } from '../kernel/antiabuso/scan-slot';
import { StorageService } from '../kernel/storage/storage.service';
import { chaveQuarentena, montarChave, pertenceAoTenant } from '../kernel/storage/storage-key';
import { ClamavService } from '../kernel/scanner/clamav.service';
import { FILE_AUTHZ_CONTRACT, type FileAuthzContract } from './file-authz.contract';
import { FILE_EVENT_SINK, type FileEventSink } from './file-event-sink';
import { estaDisponivel, planejarTransicao, type EstadoFile } from './file-states.core';
import { MIMES_PERMITIDOS, validarUpload } from './file-validation.core';
import { baseFresca, computarVeredito } from './file-verdict.core';

type Db = ReturnType<typeof withTenantContext>;

/** Projeção do arquivo pela fronteira. `bucketKey`/`orgId` NUNCA saem (SC-003: sem chave de objeto na resposta). */
export interface FileVisao {
  id: string;
  resourceType: string;
  resourceId: string;
  state: EstadoFile;
  nomeOriginal: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Entrega de download: stream sob sessão + metadados para os headers (nunca a chave). */
export interface DownloadArquivo {
  stream: Readable;
  nomeOriginal: string;
}

const SELECT_FILE = {
  id: true,
  resourceType: true,
  resourceId: true,
  state: true,
  nomeOriginal: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Estados que CONTAM para o teto por recurso (um pendente/disponível ocupa vaga; removido/expurgado/bloqueado não). */
const ESTADOS_QUE_CONTAM: EstadoFile[] = ['QUARENTENA', 'DISPONIVEL'];

/** Conflito de concorrência na promoção (→ 409, nunca 500): P2002/P2028, como em Card (2.7)/Registro (3.4). */
function isConflito(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  return code === 'P2002' || code === 'P2028';
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Serviço da capacidade compartilhada de arquivos (Story 3.7, ADR-001). Orquestra upload→quarentena→verificação
 * composta fail-closed→promoção atômica, download por stream sob sessão, remoção lógica e expurgo. **Desacoplado**
 * de Card/Registro: a autz por recurso vem da porta `FileAuthzContract` (3.8/3.10 ligam recursos reais).
 *
 * Verificação SÍNCRONA (sem agendador — decisão de arquitetura do projeto): o scan roda dentro da requisição, sob
 * um slot do semáforo (`ScanSlot`), e o arquivo transita de QUARENTENA para DISPONIVEL ou BLOCKED antes da resposta.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly requestContext: RequestContext,
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
    private readonly storage: StorageService,
    private readonly scanner: ClamavService,
    private readonly semaphore: ScanSlotSemaphore,
    @Inject(FILE_AUTHZ_CONTRACT) private readonly authz: FileAuthzContract,
    @Inject(FILE_EVENT_SINK) private readonly eventSink: FileEventSink,
  ) {}

  private db(): { contexto: ContextoOrganizacional; db: Db } {
    const contexto = this.requestContext.obter();
    return { contexto, db: withTenantContext(this.prisma, contexto, this.logger) };
  }

  /** Gate AD-28: a capacidade só existe com `FILE_UPLOAD_ENABLED`. Desligada ⇒ indisponibilidade honesta (503). */
  private exigirCapacidade(): void {
    if (!getEnv().FILE_UPLOAD_ENABLED) {
      throw new ServiceUnavailableException('capacidade de arquivos indisponível');
    }
  }

  private auditar(contexto: TenantContext, action: string, resource: string): void {
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

  /**
   * Envia um arquivo para um recurso. Fluxo fail-closed: gate → autz(editar) → validação server-side (magic bytes
   * /tamanho/contagem) → slot do semáforo → quarentena → verificação composta → promoção atômica ou bloqueio.
   */
  async enviar(
    resourceType: string,
    resourceId: string,
    arquivo: { buffer: Buffer; nomeOriginal: string },
  ): Promise<FileVisao> {
    this.exigirCapacidade();
    if (!(await this.authz.podeEditar(resourceType, resourceId))) {
      throw new NotFoundException(); // 404 não-enumerante (sem acesso ⇒ nem confirma existência).
    }
    const { contexto, db } = this.db();
    return this.enviarNoContexto(contexto, db, resourceType, resourceId, arquivo);
  }

  /**
   * Upload no canal **PÚBLICO** (não autenticado, Story 3.8/F6). A autorização aqui **não** passa pelo
   * `FileAuthzContract` (que exige um principal no `RequestContext`, ausente no público): quem autoriza é o
   * chamador — a submissão pública já validou o `publicId`, aplicou o rate limit e **reservou o `cardId`** a que
   * estes arquivos se vinculam. O contexto de tenant é **explícito** (do `publicId` resolvido), nunca do cliente.
   * Reusa integralmente a verificação composta fail-closed e a compensação do caminho autenticado.
   *
   * @internal **Só** para `PublicSubmissionService.submeterComArquivos`, que já autorizou pelo canal. NÃO chame de
   * um fluxo autenticado (use `enviar`, que aplica a autz de recurso) — este método pula a guarda de propósito.
   */
  async enviarPublico(
    contexto: TenantContext,
    resourceType: string,
    resourceId: string,
    arquivo: { buffer: Buffer; nomeOriginal: string },
  ): Promise<FileVisao> {
    this.exigirCapacidade();
    const db = withTenantContext(this.prisma, contexto, this.logger);
    // Sem evento no upload: no fluxo público o `resourceId` é um `cardId` RESERVADO cujo Card ainda NÃO existe —
    // um `CardHistory` agora violaria a FK. A criação do anexo é registrada pelo evento `CREATED` do Card.
    return this.enviarNoContexto(contexto, db, resourceType, resourceId, arquivo, {
      emitirEvento: false,
    });
  }

  /**
   * Núcleo do upload — contagem por recurso, validação (tamanho/magic-bytes), slot do semáforo, aceite em
   * quarentena, verificação composta fail-closed, promoção atômica (com evento) e **compensação**. Compartilhado
   * pelo caminho autenticado (`enviar`, com autz de recurso) e pelo público (`enviarPublico`, autz pelo canal). O
   * `contexto`/`db` são recebidos prontos — a fronteira de autorização é decidida por quem chama. `emitirEvento`
   * controla o `FILE_ATTACHED` na promoção (desligado no público, onde o Card ainda não existe).
   */
  private async enviarNoContexto(
    contexto: TenantContext,
    db: Db,
    resourceType: string,
    resourceId: string,
    arquivo: { buffer: Buffer; nomeOriginal: string },
    opts: { emitirEvento?: boolean } = {},
  ): Promise<FileVisao> {
    const emitirEvento = opts.emitirEvento !== false;
    const env = getEnv();

    // Teto por recurso: conta os que ocupam vaga (QUARENTENA/DISPONIVEL).
    const contagemAtual = await db.fileObject.count({
      where: { resourceType, resourceId, state: { in: ESTADOS_QUE_CONTAM } },
    });

    const validacao = validarUpload({
      bytes: arquivo.buffer,
      tamanhoBytes: arquivo.buffer.length,
      maxBytes: env.FILE_MAX_BYTES,
      contagemAtual,
      maxPorRecurso: env.FILE_MAX_PER_RESOURCE,
    });
    if (!validacao.ok) {
      throw new BadRequestException({ codigo: validacao.codigo, motivo: validacao.motivo });
    }

    // Slot do semáforo ANTES de tocar storage: satura fail-closed (429), sem fila infinita.
    const slotKey = `scan:${contexto.orgId}`;
    const token = await this.semaphore.adquirir(
      slotKey,
      env.SCAN_MAX_CONCURRENT_PER_ORG,
      env.SCAN_SLOT_TTL_SECONDS,
    );
    if (token === null) {
      throw new ServiceUnavailableException('verificação saturada; tente novamente em instantes'); // 503 fail-closed
    }

    const bucketKey = montarChave(contexto.orgId);
    const qKey = chaveQuarentena(bucketKey);
    // Rastreia a linha criada para a COMPENSAÇÃO fail-closed: qualquer throw entre criar e promover não pode
    // deixar o FileObject preso em QUARENTENA (que conta para o teto — DoS de cota) nem binário órfão no storage.
    let criadoId: string | undefined;

    try {
      const sha256Ingest = sha256(arquivo.buffer);

      // 1) Aceita o binário na QUARENTENA (objeto físico separado da chave final).
      const { etag } = await this.storage.put(qKey, arquivo.buffer);

      // 2) Cria o FileObject em QUARENTENA (auto-auditado por withTenantContext).
      const criado = await db.fileObject.create({
        data: {
          orgId: contexto.orgId,
          bucketKey,
          nomeOriginal: arquivo.nomeOriginal,
          resourceType,
          resourceId,
          state: 'QUARENTENA',
        },
        select: { id: true },
      });
      criadoId = criado.id;

      // 3) Verificação composta fail-closed sobre a RELEITURA (anti-troca-de-bytes).
      const releitura = Buffer.from(await this.storage.getBytes(qKey));
      const sha256Releitura = sha256(releitura);
      const clamav = await this.scanner.escanear(releitura);
      const dataBase = await this.scanner.dataDaBase();
      const canarioOk = await this.scanner.canarioDetecta();

      const pre = computarVeredito({
        tipoDetectado: validacao.mime,
        tamanhoOk: true, // já validado acima.
        sha256Ingest,
        sha256Releitura,
        clamav,
        // Base fresca EXIGE data válida dentro do teto E o canário detectando (scanner não cego AGORA).
        baseClamAVFresca:
          canarioOk && baseFresca(dataBase, env.CLAMAV_DB_MAX_AGE_HOURS, new Date()),
        ifMatchOk: true, // a prova do if-match é a etapa seguinte; aqui não bloqueia.
      });

      let veredito: 'CLEAN' | 'BLOCKED' = pre.veredito;
      if (pre.veredito === 'CLEAN') {
        // 4) Promoção if-match: copia quarentena → chave final SÓ se o ETag não mudou (byte-a-byte o verificado).
        // ETag ausente ⇒ NÃO dá para provar integridade ⇒ fail-closed BLOCKED (nunca if-match vazio, que alguns
        // servidores S3 tratam como "sem condição" e copiariam incondicionalmente).
        if (!etag) {
          veredito = 'BLOCKED';
        } else {
          const copiou = await this.storage.copyIfMatch(qKey, bucketKey, etag);
          if (!copiou) veredito = 'BLOCKED';
        }
      }

      // 5) Persiste o FATO (FileScan) + o estado do FileObject + o evento de anexo na MESMA transação (AD-13).
      await this.promover(contexto, {
        fileId: criado.id,
        resourceType,
        resourceId,
        tamanhoBytes: releitura.length,
        mimeDetectado: validacao.mime,
        sha256Ingest,
        sha256Releitura,
        veredito,
        emitirEvento,
      });
      criadoId = undefined; // promovido/bloqueado com sucesso — não há mais o que compensar.

      // 6) Limpa o objeto de quarentena — BEST-EFFORT: a promoção já é o ponto de verdade; um qKey remanescente é
      // lixo, não uma falha da operação (não pode virar 500 com o arquivo já DISPONIVEL).
      await this.removerSilencioso(qKey);

      const visao = await db.fileObject.findUnique({
        where: { id: criado.id },
        select: SELECT_FILE,
      });
      if (!visao) throw new NotFoundException();
      return visao as FileVisao;
    } catch (err) {
      // Compensação fail-closed: sem linha presa em QUARENTENA (libera a cota) e sem binário órfão.
      await this.compensarFalha(contexto, criadoId, qKey, bucketKey);
      throw err;
    } finally {
      await this.semaphore.liberar(token);
    }
  }

  /**
   * Compensação do canal PÚBLICO (Story 3.8/F6): quando a orquestração falha DEPOIS de promover arquivos mas
   * antes de o Card nascer, os `FileObject` ficam vinculados a um `cardId` que não existirá — órfãos. Marca cada
   * um DISPONIVEL/QUARENTENA → REMOVIDO_LOGICO (some do estado disponível — "sem órfão DISPONIVEL") e remove o
   * binário. **Best-effort e nunca lança**: a falha original é o que importa; a compensação só evita o órfão. Sem
   * authz (o canal público autorizou por `publicId`/rate-limit e é dono do `cardId` reservado).
   */
  async compensarPublico(contexto: TenantContext, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    try {
      const db = withTenantContext(this.prisma, contexto, this.logger);
      const arquivos = await db.fileObject.findMany({
        where: { id: { in: fileIds }, state: { in: ['DISPONIVEL', 'QUARENTENA'] } },
        select: { id: true, bucketKey: true },
      });
      for (const a of arquivos) {
        await db.fileObject
          .updateMany({
            where: { id: a.id, state: { in: ['DISPONIVEL', 'QUARENTENA'] } },
            data: { state: 'REMOVIDO_LOGICO' },
          })
          .catch(() => {});
        await this.removerSilencioso(a.bucketKey);
      }
    } catch {
      /* best-effort: se a compensação falhar, o órfão fica REMOVIDO_LOGICO/… mas nunca DISPONIVEL utilizável */
    }
  }

  /** Remove um objeto do storage best-effort — nunca lança (usado em limpeza/compensação). */
  private async removerSilencioso(key: string): Promise<void> {
    try {
      await this.storage.remove(key);
    } catch {
      /* lixo remanescente é aceitável; não pode mascarar o resultado real da operação */
    }
  }

  /**
   * Compensa uma falha no meio do upload: marca a linha órfã QUARENTENA→BLOCKED (some do teto por recurso) e
   * remove os binários (quarentena + eventual final, se o if-match já copiou). Best-effort e nunca lança — a
   * exceção original é o que importa; a compensação só evita o estado preso.
   */
  private async compensarFalha(
    contexto: TenantContext,
    criadoId: string | undefined,
    qKey: string,
    bucketKey: string,
  ): Promise<void> {
    await this.removerSilencioso(qKey);
    await this.removerSilencioso(bucketKey);
    if (!criadoId) return;
    try {
      const db = withTenantContext(this.prisma, contexto, this.logger);
      await db.fileObject.updateMany({
        where: { id: criadoId, state: 'QUARENTENA' },
        data: { state: 'BLOCKED' },
      });
    } catch {
      /* best-effort: se nem isto der, a linha fica em QUARENTENA, mas nunca vira DISPONIVEL (fail-closed) */
    }
  }

  /**
   * Promoção/bloqueio atômico: INSERT FileScan + UPDATE FileObject.state numa transação interativa no client RAIZ
   * (com contexto — `definirContextoOrg`), como a publicação (2.6)/submissão (2.7). CLEAN→DISPONIVEL; senão BLOCKED.
   */
  private async promover(
    contexto: TenantContext,
    dados: {
      fileId: string;
      resourceType: string;
      resourceId: string;
      tamanhoBytes: number;
      mimeDetectado: string;
      sha256Ingest: string;
      sha256Releitura: string;
      veredito: 'CLEAN' | 'BLOCKED';
      emitirEvento: boolean;
    },
  ): Promise<void> {
    const alvo: EstadoFile = dados.veredito === 'CLEAN' ? 'DISPONIVEL' : 'BLOCKED';
    let promovido = false;
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

        // Guarda otimista PRIMEIRO: só promove/bloqueia a partir de QUARENTENA (uma vez). Se o estado já não é
        // QUARENTENA (não deveria acontecer — id recém-criado), NÃO grava FileScan nem audita (evita fato/auditoria
        // falsos); a transação faz rollback e o chamador compensa (409).
        const upd = await tx.fileObject.updateMany({
          where: { id: dados.fileId, state: 'QUARENTENA' },
          data: { state: alvo },
        });
        if (upd.count === 0) {
          throw new ConflictException('estado mudou durante a verificação; repita a requisição');
        }

        await tx.fileScan.create({
          data: {
            orgId: contexto.orgId,
            fileId: dados.fileId,
            tamanhoBytes: BigInt(dados.tamanhoBytes),
            mimeDetectado: dados.mimeDetectado,
            sha256Ingest: dados.sha256Ingest,
            sha256Releitura: dados.sha256Releitura,
            veredito: dados.veredito,
          },
        });

        // Evento de anexo na MESMA transação (AD-13): só o arquivo que ficou DISPONIVEL vira FILE_ATTACHED na
        // trilha do recurso dono. Um veredito BLOCKED não anexa nada — não emite. O sink (no-op por padrão)
        // roteia CARD→CardHistory / RECORD→RecordHistory; `resourceType` sem trilha ⇒ silêncio, sem falhar.
        if (alvo === 'DISPONIVEL' && dados.emitirEvento) {
          await this.eventSink.registrar(tx, contexto, {
            resourceType: dados.resourceType,
            resourceId: dados.resourceId,
            fileId: dados.fileId,
            tipo: 'FILE_ATTACHED',
          });
        }
        promovido = true;
      });
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      if (isConflito(err))
        throw new ConflictException('verificação concorrente; repita a requisição');
      throw err;
    }
    if (promovido) {
      this.auditar(contexto, 'update', 'FileObject');
      this.auditar(contexto, 'create', 'FileScan');
    }
  }

  /** Download por stream sob sessão. Só DISPONIVEL; autz de LEITURA; a chave nunca é autorização. */
  async baixar(fileId: string): Promise<DownloadArquivo> {
    this.exigirCapacidade();
    const { contexto, db } = this.db();
    const file = await db.fileObject.findUnique({
      where: { id: fileId },
      select: { ...SELECT_FILE, bucketKey: true },
    });
    // 404 não-enumerante: não existe, ou não é da Org (RLS), ou sem acesso ao recurso.
    if (!file) throw new NotFoundException();
    if (!(await this.authz.podeLer(file.resourceType, file.resourceId)))
      throw new NotFoundException();
    if (!estaDisponivel(file.state as EstadoFile)) throw new NotFoundException(); // indisponível = 404 honesto.
    // Defesa em profundidade: a chave pertence a ESTA Org por SEGMENTO (a RLS já garante; belt-and-suspenders US3).
    if (!pertenceAoTenant(file.bucketKey, contexto.orgId)) throw new NotFoundException();

    const stream = await this.storage.getStream(file.bucketKey);
    return { stream, nomeOriginal: file.nomeOriginal };
  }

  /** Remoção LÓGICA (DISPONIVEL → REMOVIDO_LOGICO). Autz de EDIÇÃO. Idempotente; sem exclusão física de linha. */
  async remover(fileId: string): Promise<FileVisao> {
    return this.transicionar(fileId, 'remover');
  }

  /**
   * Expurgo físico do binário (REMOVIDO_LOGICO → EXPURGADO). Autz de EDIÇÃO. Remove o objeto do storage e marca
   * `purgedAt`; a LINHA de metadados é preservada (LGPD; sem GRANT de DELETE). Idempotente.
   */
  async expurgar(fileId: string): Promise<FileVisao> {
    this.exigirCapacidade();
    const { db } = this.db();
    const file = await this.carregarParaEditar(db, fileId);

    const plano = planejarTransicao('expurgar', file.state as EstadoFile);
    if (plano.tipo === 'idempotente') return this.projetar(db, fileId);
    if (plano.tipo === 'invalido') throw new ConflictException(plano.motivo);

    // Expurga o binário ANTES de marcar EXPURGADO (se o storage falhar, o estado não mente).
    await this.storage.remove(file.bucketKey);

    const r = await db.fileObject.updateMany({
      where: { id: fileId, state: 'REMOVIDO_LOGICO' },
      data: { state: 'EXPURGADO', purgedAt: new Date() },
    });
    if (r.count === 0) {
      const atual = await this.projetar(db, fileId);
      if (atual.state === 'EXPURGADO') return atual;
      throw new ConflictException('estado mudou durante o expurgo; repita a requisição');
    }
    return this.projetar(db, fileId);
  }

  /** Núcleo comum das transições com guarda otimista (remover). Autz de EDIÇÃO; idempotente sem falsear auditoria. */
  private async transicionar(fileId: string, acao: 'remover'): Promise<FileVisao> {
    this.exigirCapacidade();
    const { contexto, db } = this.db();
    const file = await this.carregarParaEditar(db, fileId);

    const plano = planejarTransicao(acao, file.state as EstadoFile);
    if (plano.tipo === 'idempotente') return this.projetar(db, fileId);
    if (plano.tipo === 'invalido') throw new ConflictException(plano.motivo);

    const origem = file.state as EstadoFile;
    // UPDATE de estado + evento FILE_REMOVED na MESMA transação (AD-13), na tx raiz com contexto (como a
    // promoção): a remoção lógica de um anexo vira um evento na trilha do recurso dono. Guarda otimista: só
    // transiciona a partir do estado LIDO; `count === 0` é corrida (resolvida fora, sem evento nem auditoria).
    let contagem = 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;
        const r = await tx.fileObject.updateMany({
          where: { id: fileId, state: origem },
          data: { state: plano.target },
        });
        contagem = r.count;
        if (contagem === 0) return; // corrida — nada mudou, sem evento; resolve-se após o rollback.
        await this.eventSink.registrar(tx, contexto, {
          resourceType: file.resourceType,
          resourceId: file.resourceId,
          fileId,
          tipo: 'FILE_REMOVED',
        });
      });
    } catch (err) {
      if (isConflito(err))
        throw new ConflictException('transição concorrente; repita a requisição');
      throw err;
    }

    if (contagem === 0) {
      const atual = await this.projetar(db, fileId);
      if (atual.state === plano.target) return atual; // corrida idempotente.
      throw new ConflictException('estado mudou durante a transição; repita a requisição');
    }
    this.auditar(contexto, 'update', 'FileObject');
    return this.projetar(db, fileId);
  }

  /** Carrega o arquivo exigindo autz de EDIÇÃO do recurso (404 sem acesso — não-enumerante). */
  private async carregarParaEditar(
    db: Db,
    fileId: string,
  ): Promise<{
    id: string;
    state: string;
    bucketKey: string;
    resourceType: string;
    resourceId: string;
  }> {
    const file = await db.fileObject.findUnique({
      where: { id: fileId },
      select: { id: true, state: true, bucketKey: true, resourceType: true, resourceId: true },
    });
    if (!file) throw new NotFoundException();
    if (!(await this.authz.podeEditar(file.resourceType, file.resourceId)))
      throw new NotFoundException();
    return file;
  }

  private async projetar(db: Db, fileId: string): Promise<FileVisao> {
    const visao = await db.fileObject.findUnique({ where: { id: fileId }, select: SELECT_FILE });
    if (!visao) throw new NotFoundException();
    return visao as FileVisao;
  }

  /**
   * Lista os anexos **DISPONÍVEIS** de um recurso (Story 3.8, anexo geral). Autz de LEITURA (sem acesso →
   * 404 não-enumerante). Só metadados — `bucketKey`/`orgId` nunca saem. QUARENTENA/BLOCKED/REMOVIDO/EXPURGADO
   * ficam fora da lista (o anexo útil é o disponível; a verificação é síncrona, então QUARENTENA é transitório).
   */
  async listar(resourceType: string, resourceId: string): Promise<FileVisao[]> {
    this.exigirCapacidade();
    if (!(await this.authz.podeLer(resourceType, resourceId))) throw new NotFoundException();
    const { db } = this.db();
    const files = await db.fileObject.findMany({
      where: { resourceType, resourceId, state: 'DISPONIVEL' },
      select: SELECT_FILE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return files as FileVisao[];
  }

  /** Download de um anexo escopado ao recurso da rota: exige que o arquivo pertença a `(resourceType, resourceId)`. */
  async baixarDoRecurso(
    resourceType: string,
    resourceId: string,
    fileId: string,
  ): Promise<DownloadArquivo> {
    await this.exigirPertence(resourceType, resourceId, fileId);
    return this.baixar(fileId);
  }

  /** Remoção lógica de um anexo escopado ao recurso da rota. Autz de EDIÇÃO (via `remover`). Idempotente. */
  async removerDoRecurso(
    resourceType: string,
    resourceId: string,
    fileId: string,
  ): Promise<FileVisao> {
    await this.exigirPertence(resourceType, resourceId, fileId);
    return this.remover(fileId);
  }

  /**
   * Garante que o `fileId` pertence a ESTE recurso `(resourceType, resourceId)` — a rota escopa o arquivo ao seu
   * dono. 404 não-enumerante se não pertence, não existe ou é de outra Org (RLS). A autz de acesso propriamente
   * dita fica com `baixar`/`remover` (pela herança do recurso dono); aqui só se impede o cruzamento de rota.
   */
  private async exigirPertence(
    resourceType: string,
    resourceId: string,
    fileId: string,
  ): Promise<void> {
    const { db } = this.db();
    const file = await db.fileObject.findUnique({
      where: { id: fileId },
      select: { resourceType: true, resourceId: true },
    });
    if (!file || file.resourceType !== resourceType || file.resourceId !== resourceId) {
      throw new NotFoundException();
    }
  }

  /** Limites da capacidade (para "exibir antes do envio" — US5). Sem segredo/chave; só números e tipos. */
  limites(): { maxBytes: number; maxPorRecurso: number; tiposPermitidos: string[] } {
    const env = getEnv();
    return {
      maxBytes: env.FILE_MAX_BYTES,
      maxPorRecurso: env.FILE_MAX_PER_RESOURCE,
      // Derivado da allowlist real (fonte única) — o que o cliente vê aqui é exatamente o que a validação aceita.
      tiposPermitidos: [...MIMES_PERMITIDOS],
    };
  }
}
