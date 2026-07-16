import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { parseAlterarPapel, parseConcederPapel, validarIdRota } from './dto/database-grants.dto';
import { type ConcessaoDatabaseVisao, DatabaseGrantsService } from './database-grants.service';

/**
 * Gestão de concessões de papel por Database (Story 3.2), API INTERNA. Todas as rotas declaram
 * `@Requer('ler', 'Database')` — a guarda GROSSA (aberta a qualquer Membership ativa na 3.2, como `ler Pipe`)
 * só confirma que o principal pode ler *algum* Database na Org. A **autoridade real** é FINA e vive no serviço
 * (`database-authz.ts`): Admin da Org concede qualquer papel; Admin do Database concede só MEMBER/VIEWER; só
 * Admin da Org toca ADMIN do Database. Não usar `@Requer('administrar','Database')` aqui — isso barraria o
 * Admin do Database no guard (ele não é Admin da Org). Nenhuma rota recebe `orgId`: vem do contexto do servidor.
 */
@Controller('databases/:databaseId/grants')
export class DatabaseGrantsController {
  constructor(private readonly grants: DatabaseGrantsService) {}

  @Requer('ler', 'Database')
  @Post()
  async conceder(
    @Param('databaseId') databaseId: string,
    @Body() body: unknown,
  ): Promise<ConcessaoDatabaseVisao> {
    const { membershipId, role } = parseConcederPapel(body);
    return this.grants.conceder(validarIdRota(databaseId, 'databaseId'), membershipId, role);
  }

  @Requer('ler', 'Database')
  @Get()
  async listar(@Param('databaseId') databaseId: string): Promise<ConcessaoDatabaseVisao[]> {
    return this.grants.listar(validarIdRota(databaseId, 'databaseId'));
  }

  @Requer('ler', 'Database')
  @Patch(':grantId')
  async alterarPapel(
    @Param('databaseId') databaseId: string,
    @Param('grantId') grantId: string,
    @Body() body: unknown,
  ): Promise<ConcessaoDatabaseVisao> {
    const { role } = parseAlterarPapel(body);
    return this.grants.alterarPapel(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(grantId, 'grantId'),
      role,
    );
  }

  // Revogar é transição de estado (soft-delete), não exclusão física — devolve 200 com a concessão
  // revogada, não 204. O runtime nem tem GRANT de DELETE; `DELETE` aqui é só o verbo HTTP da revogação.
  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Delete(':grantId')
  async revogar(
    @Param('databaseId') databaseId: string,
    @Param('grantId') grantId: string,
  ): Promise<ConcessaoDatabaseVisao> {
    return this.grants.revogar(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(grantId, 'grantId'),
    );
  }
}
