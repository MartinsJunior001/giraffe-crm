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
import { Requer } from '../../kernel/authz/requer.decorator';
import { contentDisposition, MULTER_LIMITS } from '../../files/file-http.util';
import { FilesService, type FileVisao } from '../../files/files.service';
import { validarIdRota } from '../tasks.dto';

/**
 * Anexo geral de **Tarefa** (Story 5.1), consumindo a capacidade compartilhada de arquivos (3.7) pelo mesmo
 * padrão do anexo de Card (3.8): um arquivo autenticado da Tarefa é um `FileObject` com `resourceType='TASK'` e
 * `resourceId=taskId` — **anexo geral**, herdando a autorização da Tarefa (nada em `Task`; sem migration/GRANT novo).
 *
 * `@Requer('ler','Pipe')` é a guarda GROSSA (C3 congelado); a guarda FINA (herança de permissão da Tarefa:
 * ver/baixar/listar = ler o Pipe; enviar/remover = operar o Pipe) vive no `FilesService` via o `FileAuthzContract`
 * → `FileAuthzDispatcher` (branch TASK → `pipe-authz`). Sem acesso → 404 não-enumerante; ler-sem-operar ao mutar →
 * 403; Tarefa arquivada → 409 `TAREFA_ARQUIVADA`; gate AD-28 (`FILE_UPLOAD_ENABLED`) barra a capacidade quando
 * desligada. A chave do objeto nunca aparece na resposta; download só por stream sob a sessão.
 */
@Controller('tasks/:taskId/files')
export class TaskFilesController {
  constructor(private readonly files: FilesService) {}

  /** Anexa um arquivo à Tarefa (multipart). 201 com o arquivo já verificado (DISPONIVEL/BLOCKED — scan síncrono). */
  @Post()
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: MULTER_LIMITS }))
  async enviar(
    @Param('taskId') taskId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<FileVisao> {
    if (!file) throw new BadRequestException('arquivo ausente (campo multipart "file")');
    return this.files.enviar('TASK', validarIdRota(taskId, 'taskId'), {
      buffer: file.buffer,
      nomeOriginal: file.originalname,
    });
  }

  /** Lista os anexos DISPONÍVEIS da Tarefa (metadados; sem chave/bucket). */
  @Get()
  @Requer('ler', 'Pipe')
  async listar(@Param('taskId') taskId: string): Promise<FileVisao[]> {
    return this.files.listar('TASK', validarIdRota(taskId, 'taskId'));
  }

  /** Download por STREAM sob a sessão. Só DISPONIVEL; o arquivo deve pertencer a ESTA Tarefa. */
  @Get(':fileId/download')
  @Requer('ler', 'Pipe')
  @Header('Content-Type', 'application/octet-stream')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async baixar(
    @Param('taskId') taskId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const { stream, nomeOriginal } = await this.files.baixarDoRecurso(
      'TASK',
      validarIdRota(taskId, 'taskId'),
      validarIdRota(fileId, 'fileId'),
    );
    return new StreamableFile(stream, { disposition: contentDisposition(nomeOriginal) });
  }

  /** Remoção LÓGICA do anexo (idempotente). 200; sem exclusão física de linha (LGPD). */
  @Delete(':fileId')
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  async remover(
    @Param('taskId') taskId: string,
    @Param('fileId') fileId: string,
  ): Promise<FileVisao> {
    return this.files.removerDoRecurso(
      'TASK',
      validarIdRota(taskId, 'taskId'),
      validarIdRota(fileId, 'fileId'),
    );
  }
}
