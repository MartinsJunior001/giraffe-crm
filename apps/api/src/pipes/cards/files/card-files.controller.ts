import {
  BadRequestException,
  Controller,
  Delete,
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
import { Requer } from '../../../kernel/authz/requer.decorator';
import { contentDisposition, MULTER_LIMITS } from '../../../files/file-http.util';
import { FilesService, type FileVisao } from '../../../files/files.service';

/**
 * Anexo geral de **Card** (Story 3.8, Opção 1). Arquivos autenticados de um Card são `FileObject` com
 * `resourceType=CARD` e `resourceId=cardId` — **anexos gerais**, NUNCA valor em `Card.valores` (o modelo
 * append-only do Card é preservado: nenhuma escrita em `valores`, nenhum GRANT novo).
 *
 * `@Requer('ler','Pipe')` é a guarda GROSSA (C3 congelado); a guarda FINA (herança de permissão do Card:
 * ver/baixar/listar = ler; enviar/remover = operar) vive no `FilesService` via o `FileAuthzContract` →
 * `pipe-authz` (F1). Sem acesso → 404 não-enumerante; ler-sem-operar ao mutar → 403. A chave do objeto nunca
 * aparece na resposta; download só por stream sob a sessão (nunca redirect a bucket).
 */
@Controller('cards/:cardId/files')
export class CardFilesController {
  constructor(private readonly files: FilesService) {}

  /** Anexa um arquivo ao Card (multipart). 201 com o arquivo já verificado (DISPONIVEL/BLOCKED — scan síncrono). */
  @Post()
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: MULTER_LIMITS }))
  async enviar(
    @Param('cardId') cardId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<FileVisao> {
    if (!file) throw new BadRequestException('arquivo ausente (campo multipart "file")');
    return this.files.enviar('CARD', cardId, {
      buffer: file.buffer,
      nomeOriginal: file.originalname,
    });
  }

  /** Lista os anexos DISPONÍVEIS do Card (metadados; sem chave/bucket). */
  @Get()
  @Requer('ler', 'Pipe')
  async listar(@Param('cardId') cardId: string): Promise<FileVisao[]> {
    return this.files.listar('CARD', cardId);
  }

  /** Download por STREAM sob a sessão. Só DISPONIVEL; o arquivo deve pertencer a ESTE Card. */
  @Get(':fileId/download')
  @Requer('ler', 'Pipe')
  @Header('Content-Type', 'application/octet-stream')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async baixar(
    @Param('cardId') cardId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const { stream, nomeOriginal } = await this.files.baixarDoRecurso('CARD', cardId, fileId);
    return new StreamableFile(stream, { disposition: contentDisposition(nomeOriginal) });
  }

  /** Remoção LÓGICA do anexo (idempotente). 200; sem exclusão física de linha (LGPD). */
  @Delete(':fileId')
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  async remover(
    @Param('cardId') cardId: string,
    @Param('fileId') fileId: string,
  ): Promise<FileVisao> {
    return this.files.removerDoRecurso('CARD', cardId, fileId);
  }
}
