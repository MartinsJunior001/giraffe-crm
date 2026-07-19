import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Requer } from '../../kernel/authz/requer.decorator';
import { contentDisposition, MULTER_LIMITS } from '../../files/file-http.util';
import { AvatarService, type AvatarVisao } from './avatar.service';

/**
 * Avatar do PRÓPRIO usuário (Story 3.10, FR-32).
 *
 * As rotas são `me/...` e **não recebem `accountId`** — nem na URL, nem no corpo. Não é economia de digitação:
 * um `accountId` de parâmetro seria uma superfície para pedir o avatar de outra pessoa, e a defesa passaria a
 * ser "lembrar de comparar". Aqui o alvo é sempre o principal do contexto, resolvido no servidor.
 *
 * `@Requer('ler','Organizacao')` é a guarda GROSSA (toda Membership ativa a tem — o guard não é onde o
 * self-only mora, e `ability.ts` não é tocado; C3 congelado). A guarda FINA é self-only e vive em duas camadas:
 * o `FileAuthzDispatcher` (`resourceType='ACCOUNT'`, compara com o principal) e, como backstop de banco, a RLS
 * self-only de `AccountAvatar`.
 *
 * **Sem URL presigned**: o binário sai por STREAM sob a sessão, nunca por link que dispense a autorização.
 */
@Controller('me/avatar')
export class AvatarController {
  constructor(private readonly avatar: AvatarService) {}

  /** Estado do avatar vigente. `presente: false` ⇒ a UI usa as iniciais (1.11). Sem URL/chave. */
  @Get()
  @Requer('ler', 'Organizacao')
  async obter(): Promise<AvatarVisao> {
    return this.avatar.obter();
  }

  /**
   * Envia ou SUBSTITUI o próprio avatar (multipart). Um caminho só — o slot é único por (Org, Conta).
   * 200: a operação é idempotente do ponto de vista do recurso (`me/avatar` sempre existe como slot).
   * `FILE_UPLOAD_ENABLED=false` ⇒ 503 (fail-closed, via a capacidade da 3.7).
   */
  @Post()
  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: MULTER_LIMITS }))
  async enviar(
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<AvatarVisao> {
    if (!file) throw new BadRequestException('arquivo ausente (campo multipart "file")');
    return this.avatar.enviar({ buffer: file.buffer, nomeOriginal: file.originalname });
  }

  /**
   * Download do próprio avatar por stream, sob sessão. Ausente/indisponível ⇒ 404, e a UI cai nas iniciais
   * sem quebrar. `Cache-Control: no-store` porque é dado pessoal servido sob autorização — um cache
   * compartilhado poderia devolvê-lo a quem não deveria.
   */
  @Get('download')
  @Requer('ler', 'Organizacao')
  @Header('Content-Type', 'application/octet-stream')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'no-store')
  async baixar(): Promise<StreamableFile> {
    const { stream, nomeOriginal } = await this.avatar.baixar();
    return new StreamableFile(stream, { disposition: contentDisposition(nomeOriginal) });
  }

  /**
   * Remove o próprio avatar. Idempotente. **Funciona com `FILE_UPLOAD_ENABLED=false`** — retirar a própria
   * imagem não pode depender do subsistema de arquivos estar ligado (LGPD). Sem exclusão física.
   */
  @Delete()
  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  async remover(): Promise<AvatarVisao> {
    return this.avatar.remover();
  }
}
