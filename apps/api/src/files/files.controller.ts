import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService, type FileVisao } from './files.service';

/**
 * Teto de memória do multipart (bound de DoS) — ACIMA do `FILE_MAX_BYTES` configurável, que é conferido no
 * núcleo puro de validação. É a barreira dura contra upload gigante; o limite fino (e a mensagem) vêm do serviço.
 */
const MULTER_MAX_BYTES = 52_428_800; // 50 MiB (== StreamMaxLength do clamd).

/** Nome de arquivo seguro para o header (RFC 5987) — evita injeção de header via nome original (PII/controle do cliente). */
function contentDisposition(nomeOriginal: string): string {
  const asciiFallback = nomeOriginal.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const utf8 = encodeURIComponent(nomeOriginal);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8}`;
}

/**
 * Capacidade compartilhada de arquivos (Story 3.7), API INTERNA. Todas as rotas são autenticadas pelo guard
 * GLOBAL de contexto de Organização (sessão + Org resolvidas no servidor); a autz FINA por recurso vem da porta
 * `FileAuthzContract` no serviço (a 3.7 não conhece Card/Registro). Sem `@Requer` (não há subject CASL genérico).
 *
 * O `resourceType`/`resourceId` são genéricos — o consumidor (3.8/3.10) liga recursos reais. Gate `FILE_UPLOAD_ENABLED`
 * é imposto no serviço (indisponibilidade honesta quando off). A chave interna do objeto NUNCA aparece na resposta.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  /** Limites da capacidade — o cliente os consulta ANTES de enviar (US5). Sem segredo/chave. */
  @Get('limits')
  limites(): { maxBytes: number; maxPorRecurso: number; tiposPermitidos: string[] } {
    return this.files.limites();
  }

  /** Upload (multipart). 201 com o arquivo já verificado (DISPONIVEL ou BLOCKED — verificação síncrona). */
  @Post(':resourceType/:resourceId')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_MAX_BYTES } }))
  async enviar(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<FileVisao> {
    if (!file) throw new BadRequestException('arquivo ausente (campo multipart "file")');
    return this.files.enviar(resourceType, resourceId, {
      buffer: file.buffer,
      nomeOriginal: file.originalname,
    });
  }

  /**
   * Download por STREAM sob a sessão (nunca redirect a bucket; a chave nunca é autorização). Só DISPONIVEL.
   * Headers seguros: attachment + nosniff (o binário não é interpretado pelo browser); `application/octet-stream`
   * (não confiar no tipo declarado). Sem cache — o conteúdo é privado e vinculado à sessão.
   */
  @Get(':fileId/content')
  @Header('Content-Type', 'application/octet-stream')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async baixar(@Param('fileId') fileId: string): Promise<StreamableFile> {
    const { stream, nomeOriginal } = await this.files.baixar(fileId);
    return new StreamableFile(stream, {
      disposition: contentDisposition(nomeOriginal),
    });
  }

  /** Remoção LÓGICA (idempotente). 200; estado REMOVIDO_LOGICO; sem exclusão física de linha. */
  @Post(':fileId/remove')
  @HttpCode(HttpStatus.OK)
  async remover(@Param('fileId') fileId: string): Promise<FileVisao> {
    return this.files.remover(fileId);
  }

  /** Expurgo físico do binário (REMOVIDO_LOGICO → EXPURGADO). 200; a linha de metadados é preservada (LGPD). */
  @Post(':fileId/purge')
  @HttpCode(HttpStatus.OK)
  async expurgar(@Param('fileId') fileId: string): Promise<FileVisao> {
    return this.files.expurgar(fileId);
  }
}
