import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Requer } from '../kernel/authz/requer.decorator';
import {
  parseAtualizarPipe,
  parseCriarPipe,
  parseIncluirArquivados,
  validarIdPipe,
} from './dto/pipes.dto';
import { PipesService, type PipeVisao } from './pipes.service';

/**
 * Catálogo e ciclo de vida de Pipes (Story 2.1), superfície de API INTERNA. Nenhuma rota recebe
 * `orgId`: a Organização vem sempre do contexto resolvido no servidor — o cliente não escolhe o
 * tenant. Cada rota declara `@Requer`, e o `AuthzGuard` (2º guard global) nega deny-by-default;
 * em 2.1, só o ADMIN da Organização lê/administra Pipe (MEMBER/GUEST ⇒ 403).
 *
 * A checagem GROSSA (o papel pode a ação sobre Pipe nesta Org) é do guard; a FINA (o Pipe é desta
 * Org) é da RLS, aplicada pelo `withTenantContext` no serviço. Este controller só valida a entrada
 * e traduz para o serviço.
 */
@Controller('pipes')
export class PipesController {
  constructor(private readonly pipes: PipesService) {}

  @Requer('administrar', 'Pipe')
  @Post()
  async criar(@Body() body: unknown): Promise<PipeVisao> {
    const { name } = parseCriarPipe(body);
    return this.pipes.criar(name);
  }

  @Requer('ler', 'Pipe')
  @Get()
  async listar(@Query('arquivados') arquivados?: string): Promise<PipeVisao[]> {
    return this.pipes.listar(parseIncluirArquivados(arquivados));
  }

  @Requer('ler', 'Pipe')
  @Get(':id')
  async obter(@Param('id') id: string): Promise<PipeVisao> {
    return this.pipes.obter(validarIdPipe(id));
  }

  @Requer('administrar', 'Pipe')
  @Patch(':id')
  async atualizar(@Param('id') id: string, @Body() body: unknown): Promise<PipeVisao> {
    return this.pipes.atualizar(validarIdPipe(id), parseAtualizarPipe(body));
  }

  // Arquivar/restaurar são TRANSIÇÕES DE ESTADO de um Pipe que já existe — nada é criado. O Nest
  // responde 201 por padrão em `@Post`, o que aqui seria mentira de protocolo (e uma resposta a mais
  // para o cliente interpretar). São `@Post` por não serem idempotentes-por-conteúdo como um `PUT`,
  // mas devolvem 200 com o recurso atualizado.
  @Requer('administrar', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post(':id/archive')
  async arquivar(@Param('id') id: string): Promise<PipeVisao> {
    return this.pipes.arquivar(validarIdPipe(id));
  }

  @Requer('administrar', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post(':id/restore')
  async restaurar(@Param('id') id: string): Promise<PipeVisao> {
    return this.pipes.restaurar(validarIdPipe(id));
  }
}
