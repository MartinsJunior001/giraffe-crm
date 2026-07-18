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
import { definirContextoOrg, withTenantContext } from '../kernel/db/tenant-context';
import { getEnv } from '../kernel/config/env';
import { ScanSlotSemaphore } from '../kernel/antiabuso/scan-slot';
import { StorageService } from '../kernel/storage/storage.service';
import { chaveQuarentena, montarChave, pertenceAoTenant } from '../kernel/storage/storage-key';
import { ClamavService } from '../kernel/scanner/clamav.service';
import { FILE_AUTHZ_CONTRACT, type FileAuthzContract } from './file-authz.contract';
import { estaDisponivel, planejarTransicao, type EstadoFile } from './file-states.core';
import { validarUpload } from './file-validation.core';
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
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
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
        baseClamAVFresca: canarioOk && baseFresca(dataBase, env.CLAMAV_DB_MAX_AGE_HOURS, new Date()),
        ifMatchOk: true, // a prova do if-match é a etapa seguinte; aqui não bloqueia.
      });

      let veredito: 'CLEAN' | 'BLOCKED' = pre.veredito;
      if (pre.veredito === 'CLEAN') {
        // 4) Promoção if-match: copia quarentena → chave final SÓ se o ETag não mudou (byte-a-byte o verificado).
        const copiou = await this.storage.copyIfMatch(qKey, bucketKey, etag ?? '');
        if (!copiou) veredito = 'BLOCKED';
      }

      // 5) Persiste o FATO (FileScan) + o estado do FileObject na MESMA transação atômica (AD-13).
      await this.promover(contexto, {
        fileId: criado.id,
        tamanhoBytes: releitura.length,
        mimeDetectado: validacao.mime,
        sha256Ingest,
        sha256Releitura,
        veredito,
      });

      // 6) Limpa o objeto de quarentena (o binário válido já foi copiado para a chave final; o inválido não fica).
      await this.storage.remove(qKey);

      const visao = await db.fileObject.findUnique({ where: { id: criado.id }, select: SELECT_FILE });
      if (!visao) throw new NotFoundException();
      return visao as FileVisao;
    } finally {
      await this.semaphore.liberar(token);
    }
  }

  /**
   * Promoção/bloqueio atômico: INSERT FileScan + UPDATE FileObject.state numa transação interativa no client RAIZ
   * (com contexto — `definirContextoOrg`), como a publicação (2.6)/submissão (2.7). CLEAN→DISPONIVEL; senão BLOCKED.
   */
  private async promover(
    contexto: ContextoOrganizacional,
    dados: {
      fileId: string;
      tamanhoBytes: number;
      mimeDetectado: string;
      sha256Ingest: string;
      sha256Releitura: string;
      veredito: 'CLEAN' | 'BLOCKED';
    },
  ): Promise<void> {
    const alvo: EstadoFile = dados.veredito === 'CLEAN' ? 'DISPONIVEL' : 'BLOCKED';
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const p of definirContextoOrg(tx, contexto)) await p;

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

        // Guarda otimista: só promove/bloqueia a partir de QUARENTENA (uma vez).
        await tx.fileObject.updateMany({
          where: { id: dados.fileId, state: 'QUARENTENA' },
          data: { state: alvo },
        });
      });
    } catch (err) {
      if (isConflito(err)) throw new ConflictException('verificação concorrente; repita a requisição');
      throw err;
    }
    this.auditar(contexto, 'create', 'FileScan');
    this.auditar(contexto, 'update', 'FileObject');
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
    if (!(await this.authz.podeLer(file.resourceType, file.resourceId))) throw new NotFoundException();
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
    const { contexto, db } = this.db();
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
    const { db } = this.db();
    const file = await this.carregarParaEditar(db, fileId);

    const plano = planejarTransicao(acao, file.state as EstadoFile);
    if (plano.tipo === 'idempotente') return this.projetar(db, fileId);
    if (plano.tipo === 'invalido') throw new ConflictException(plano.motivo);

    const origem = file.state as EstadoFile;
    const r = await db.fileObject.updateMany({
      where: { id: fileId, state: origem },
      data: { state: plano.target },
    });
    if (r.count === 0) {
      const atual = await this.projetar(db, fileId);
      if (atual.state === plano.target) return atual; // corrida idempotente.
      throw new ConflictException('estado mudou durante a transição; repita a requisição');
    }
    return this.projetar(db, fileId);
  }

  /** Carrega o arquivo exigindo autz de EDIÇÃO do recurso (404 sem acesso — não-enumerante). */
  private async carregarParaEditar(
    db: Db,
    fileId: string,
  ): Promise<{ id: string; state: string; bucketKey: string; resourceType: string; resourceId: string }> {
    const file = await db.fileObject.findUnique({
      where: { id: fileId },
      select: { id: true, state: true, bucketKey: true, resourceType: true, resourceId: true },
    });
    if (!file) throw new NotFoundException();
    if (!(await this.authz.podeEditar(file.resourceType, file.resourceId))) throw new NotFoundException();
    return file;
  }

  private async projetar(db: Db, fileId: string): Promise<FileVisao> {
    const visao = await db.fileObject.findUnique({ where: { id: fileId }, select: SELECT_FILE });
    if (!visao) throw new NotFoundException();
    return visao as FileVisao;
  }

  /** Limites da capacidade (para "exibir antes do envio" — US5). Sem segredo/chave; só números e tipos. */
  limites(): { maxBytes: number; maxPorRecurso: number; tiposPermitidos: string[] } {
    const env = getEnv();
    return {
      maxBytes: env.FILE_MAX_BYTES,
      maxPorRecurso: env.FILE_MAX_PER_RESOURCE,
      tiposPermitidos: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'],
    };
  }
}
