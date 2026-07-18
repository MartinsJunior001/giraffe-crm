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
 * Anexo geral de **Registro** (Story 3.8, Opção 1). Arquivos de um Registro são `FileObject` com
 * `resourceType=RECORD` e `resourceId=recordId`. Diferente do Card, o Registro também referencia arquivos como
 * **valor de Campo Arquivo** nos `valores` (Record.valores é editável — 3.4); estas rotas são o anexo geral,
 * independente de Formulário.
 *
 * `@Requer('ler','Database')` é a guarda GROSSA (aberta na 3.2, C3 congelado); a guarda FINA (herança de
 * permissão: ver/baixar/listar = ler; enviar/remover = operar) vive no `FilesService` via o `FileAuthzContract`
 * → `database-authz` (F1, resolve recordId→databaseId). Sem acesso → 404 não-enumerante; VIEWER ao mutar → 403.
 */
@Controller('databases/:databaseId/records/:recordId/files')
export class RecordFilesController {
  constructor(private readonly files: FilesService) {}

  /** Anexa um arquivo ao Registro (multipart). 201 com o arquivo já verificado (scan síncrono). */
  @Post()
  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: MULTER_LIMITS }))
  async enviar(
    @Param('recordId') recordId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<FileVisao> {
    if (!file) throw new BadRequestException('arquivo ausente (campo multipart "file")');
    return this.files.enviar('RECORD', recordId, {
      buffer: file.buffer,
      nomeOriginal: file.originalname,
    });
  }

  /** Lista os anexos DISPONÍVEIS do Registro (metadados; sem chave/bucket). */
  @Get()
  @Requer('ler', 'Database')
  async listar(@Param('recordId') recordId: string): Promise<FileVisao[]> {
    return this.files.listar('RECORD', recordId);
  }

  /** Download por STREAM sob a sessão. Só DISPONIVEL; o arquivo deve pertencer a ESTE Registro. */
  @Get(':fileId/download')
  @Requer('ler', 'Database')
  @Header('Content-Type', 'application/octet-stream')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async baixar(
    @Param('recordId') recordId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const { stream, nomeOriginal } = await this.files.baixarDoRecurso('RECORD', recordId, fileId);
    return new StreamableFile(stream, { disposition: contentDisposition(nomeOriginal) });
  }

  /** Remoção LÓGICA do anexo (idempotente). 200; sem exclusão física de linha (LGPD). */
  @Delete(':fileId')
  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  async remover(
    @Param('recordId') recordId: string,
    @Param('fileId') fileId: string,
  ): Promise<FileVisao> {
    return this.files.removerDoRecurso('RECORD', recordId, fileId);
  }
}
