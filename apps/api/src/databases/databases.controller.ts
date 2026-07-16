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
  parseCriarDatabase,
  parseIncluirArquivados,
  parseRenomearDatabase,
  validarIdDatabase,
} from './dto/databases.dto';
import { DatabasesService, type DatabaseVisao } from './databases.service';

/**
 * Catálogo e ciclo de vida de Databases (Story 3.1), superfície de API INTERNA. Twin estrutural do
 * controller de `Pipe` (2.1), recurso DISTINTO (Database ≠ Pipe — RN-061). Nenhuma rota recebe
 * `orgId`: a Organização vem sempre do contexto resolvido no servidor. Cada rota declara `@Requer`, e
 * o `AuthzGuard` nega deny-by-default; em 3.1 **só o ADMIN da Organização** lê/administra Database
 * (MEMBER/GUEST ⇒ 403 — papéis por Database são a 3.2).
 *
 * **Sem rota de exclusão:** arquivar é mudança de estado, e o runtime nem tem GRANT de DELETE em
 * `Database` (uma rota de DELETE acrescentada por engano bateria em `permission denied`).
 */
@Controller('databases')
export class DatabasesController {
  constructor(private readonly databases: DatabasesService) {}

  @Requer('administrar', 'Database')
  @Post()
  async criar(@Body() body: unknown): Promise<DatabaseVisao> {
    const { name } = parseCriarDatabase(body);
    return this.databases.criar(name);
  }

  @Requer('ler', 'Database')
  @Get()
  async listar(@Query('arquivados') arquivados?: string): Promise<DatabaseVisao[]> {
    return this.databases.listar(parseIncluirArquivados(arquivados));
  }

  @Requer('ler', 'Database')
  @Get(':id')
  async obter(@Param('id') id: string): Promise<DatabaseVisao> {
    return this.databases.obter(validarIdDatabase(id));
  }

  // Renomear é ATUALIZAÇÃO de um Database que já existe. Em `ARCHIVED` é bloqueado (409) — somente
  // leitura integral (D1). Mudança de estado NÃO é aceita aqui: é pelas rotas archive/restore.
  @Requer('administrar', 'Database')
  @Patch(':id')
  async renomear(@Param('id') id: string, @Body() body: unknown): Promise<DatabaseVisao> {
    const { name } = parseRenomearDatabase(body);
    return this.databases.renomear(validarIdDatabase(id), name);
  }

  // Arquivar/restaurar são TRANSIÇÕES DE ESTADO de um Database que já existe — nada é criado. São
  // `@Post` (não idempotentes-por-conteúdo como um PUT), mas devolvem 200 com o recurso atualizado
  // (201 seria mentira de protocolo).
  @Requer('administrar', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post(':id/archive')
  async arquivar(@Param('id') id: string): Promise<DatabaseVisao> {
    return this.databases.arquivar(validarIdDatabase(id));
  }

  @Requer('administrar', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post(':id/restore')
  async restaurar(@Param('id') id: string): Promise<DatabaseVisao> {
    return this.databases.restaurar(validarIdDatabase(id));
  }
}
