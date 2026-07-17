import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import type { AlvoFormulario } from '../../pipes/forms/form-locate';
import { validarIdRota } from '../../pipes/forms/forms.dto';
import { validarVersao } from '../../pipes/forms/publication.controller';
import {
  type EstadoPublicacao,
  FormPublicationService,
  type VersaoDetalhe,
} from '../../pipes/forms/publication.service';

/**
 * Publicação do Formulário de Database (Story 3.3, ciclo de 2.6), API INTERNA. Reutiliza o
 * `FormPublicationService` canônico com o alvo `{ databaseId }`; a autorização é roteada por `form-authz` para
 * `database-authz` (gerenciar para publicar/despublicar; ler para estado/versão). `Database ≠ Pipe`: rotas sob
 * `databases/:databaseId`, subject `Database`.
 *
 * `publish` **cria** uma `FormVersion` imutável → **201** (como em E2). `unpublish` é mudança de estado → **200**.
 * Sem rota de exclusão nem de edição de versão (o banco recusa UPDATE/DELETE em `FormVersion`). Sem rota de
 * submissão/criação de Registro (3.4).
 */
@Controller('databases/:databaseId')
export class DatabaseFormPublicationController {
  constructor(private readonly publicacao: FormPublicationService) {}

  private alvo(databaseId: string): AlvoFormulario {
    return { databaseId: validarIdRota(databaseId, 'databaseId') };
  }

  @Requer('ler', 'Database')
  @Post('form/publish')
  async publicar(@Param('databaseId') databaseId: string): Promise<VersaoDetalhe> {
    return this.publicacao.publicar(this.alvo(databaseId));
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/unpublish')
  async despublicar(@Param('databaseId') databaseId: string): Promise<EstadoPublicacao> {
    return this.publicacao.despublicar(this.alvo(databaseId));
  }

  @Requer('ler', 'Database')
  @Get('form/publication')
  async estado(@Param('databaseId') databaseId: string): Promise<EstadoPublicacao> {
    return this.publicacao.estado(this.alvo(databaseId));
  }

  @Requer('ler', 'Database')
  @Get('form/versions/:version')
  async versao(
    @Param('databaseId') databaseId: string,
    @Param('version') version: string,
  ): Promise<VersaoDetalhe> {
    return this.publicacao.versao(this.alvo(databaseId), validarVersao(version));
  }
}
