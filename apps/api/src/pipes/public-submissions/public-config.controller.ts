import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { type EstadoPublico, PublicConfigService } from './public-config.service';
import { parseModoPublico, validarIdRota } from './public-submissions.dto';

/**
 * Config do acesso PÚBLICO do Formulário inicial (Story 2.8), API INTERNA autenticada. Sob `pipes/:pipeId`.
 * `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (gerenciar — config do Pipe) vive no
 * `PublicConfigService`. Habilitar devolve o `publicId` da URL pública; revogar/rotacionar são mudança de estado.
 */
@Controller('pipes/:pipeId/forms/initial/public')
export class PublicConfigController {
  constructor(private readonly config: PublicConfigService) {}

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('enable')
  async habilitar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<EstadoPublico> {
    return this.config.habilitar(validarIdRota(pipeId, 'pipeId'), parseModoPublico(body));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  async revogar(@Param('pipeId') pipeId: string): Promise<EstadoPublico> {
    return this.config.revogar(validarIdRota(pipeId, 'pipeId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('rotate')
  async rotacionar(@Param('pipeId') pipeId: string): Promise<EstadoPublico> {
    return this.config.rotacionar(validarIdRota(pipeId, 'pipeId'));
  }

  @Requer('ler', 'Pipe')
  @Get()
  async estado(@Param('pipeId') pipeId: string): Promise<EstadoPublico> {
    return this.config.estado(validarIdRota(pipeId, 'pipeId'));
  }
}
