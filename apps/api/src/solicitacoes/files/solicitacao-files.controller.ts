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
import { validarIdRota } from '../solicitacoes.dto';

/**
 * Anexo geral de **Solicitação** (Story 5.2), consumindo a capacidade compartilhada de arquivos (3.7) pelo
 * mesmo padrão do anexo de Tarefa (5.1) e Card (3.8): um arquivo autenticado da Solicitação é um `FileObject`
 * com `resourceType='SOLICITACAO'` e `resourceId=solicitacaoId` — **anexo geral**, herdando a autorização da
 * Solicitação (nada em `Solicitacao`; sem migration/GRANT novo).
 *
 * `@Requer('ler','Pipe')` é a guarda GROSSA (C3 congelado); a guarda FINA (herança de permissão da
 * Solicitação: ver/baixar/listar = ler o Pipe; enviar/remover = operar o Pipe) vive no `FilesService` via o
 * `FileAuthzContract` → `FileAuthzDispatcher` (branch SOLICITACAO → `pipe-authz`). Sem acesso → 404
 * não-enumerante; ler-sem-operar ao mutar → 403 (traduzido em 404 no upload — padrão 3.8); Solicitação
 * arquivada → 409 `SOLICITACAO_ARQUIVADA`; gate AD-28 (`FILE_UPLOAD_ENABLED`) barra a capacidade quando
 * desligada. A chave do objeto nunca aparece na resposta; download só por stream sob a sessão.
 */
@Controller('solicitacoes/:solicitacaoId/files')
export class SolicitacaoFilesController {
  constructor(private readonly files: FilesService) {}

  /** Anexa um arquivo à Solicitação (multipart). 201 com o arquivo já verificado (DISPONIVEL/BLOCKED). */
  @Post()
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { limits: MULTER_LIMITS }))
  async enviar(
    @Param('solicitacaoId') solicitacaoId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<FileVisao> {
    if (!file) throw new BadRequestException('arquivo ausente (campo multipart "file")');
    return this.files.enviar('SOLICITACAO', validarIdRota(solicitacaoId, 'solicitacaoId'), {
      buffer: file.buffer,
      nomeOriginal: file.originalname,
    });
  }

  /** Lista os anexos DISPONÍVEIS da Solicitação (metadados; sem chave/bucket). */
  @Get()
  @Requer('ler', 'Pipe')
  async listar(@Param('solicitacaoId') solicitacaoId: string): Promise<FileVisao[]> {
    return this.files.listar('SOLICITACAO', validarIdRota(solicitacaoId, 'solicitacaoId'));
  }

  /** Download por STREAM sob a sessão. Só DISPONIVEL; o arquivo deve pertencer a ESTA Solicitação. */
  @Get(':fileId/download')
  @Requer('ler', 'Pipe')
  @Header('Content-Type', 'application/octet-stream')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async baixar(
    @Param('solicitacaoId') solicitacaoId: string,
    @Param('fileId') fileId: string,
  ): Promise<StreamableFile> {
    const { stream, nomeOriginal } = await this.files.baixarDoRecurso(
      'SOLICITACAO',
      validarIdRota(solicitacaoId, 'solicitacaoId'),
      validarIdRota(fileId, 'fileId'),
    );
    return new StreamableFile(stream, { disposition: contentDisposition(nomeOriginal) });
  }

  /** Remoção LÓGICA do anexo (idempotente). 200; sem exclusão física de linha (LGPD). */
  @Delete(':fileId')
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  async remover(
    @Param('solicitacaoId') solicitacaoId: string,
    @Param('fileId') fileId: string,
  ): Promise<FileVisao> {
    return this.files.removerDoRecurso(
      'SOLICITACAO',
      validarIdRota(solicitacaoId, 'solicitacaoId'),
      validarIdRota(fileId, 'fileId'),
    );
  }
}
