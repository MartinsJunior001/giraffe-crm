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
import { parseAlterarPapel, parseConcederPapel, validarIdRota } from './pipe-grants.dto';
import { type ConcessaoVisao, PipeGrantsService } from './pipe-grants.service';

/**
 * Gestão de concessões de papel por Pipe (Story 2.2), API INTERNA. Em 2.2, **só o Admin da Organização**
 * administra concessões: todas as rotas declaram `@Requer('administrar','Pipe')`, e em 2.2 apenas o
 * papel ADMIN da Org recebe essa ability (o guard nega MEMBER/GUEST — deny-by-default). Ampliar a
 * concessão ao Admin do Pipe é evolução futura (fora do escopo congelado).
 *
 * A checagem GROSSA (o papel pode `administrar` Pipe nesta Org) é do guard; a FINA (o Pipe/Membership é
 * desta Org) é da RLS + validação no serviço. Nenhuma rota recebe `orgId`: vem do contexto do servidor.
 */
@Controller('pipes/:pipeId/grants')
export class PipeGrantsController {
  constructor(private readonly grants: PipeGrantsService) {}

  @Requer('administrar', 'Pipe')
  @Post()
  async conceder(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<ConcessaoVisao> {
    const { membershipId, role, reviewPublicSubmissions } = parseConcederPapel(body);
    return this.grants.conceder(
      validarIdRota(pipeId, 'pipeId'),
      membershipId,
      role,
      reviewPublicSubmissions,
    );
  }

  @Requer('administrar', 'Pipe')
  @Get()
  async listar(@Param('pipeId') pipeId: string): Promise<ConcessaoVisao[]> {
    return this.grants.listar(validarIdRota(pipeId, 'pipeId'));
  }

  @Requer('administrar', 'Pipe')
  @Patch(':grantId')
  async alterarPapel(
    @Param('pipeId') pipeId: string,
    @Param('grantId') grantId: string,
    @Body() body: unknown,
  ): Promise<ConcessaoVisao> {
    const { role, reviewPublicSubmissions } = parseAlterarPapel(body);
    return this.grants.alterarPapel(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(grantId, 'grantId'),
      role,
      reviewPublicSubmissions,
    );
  }

  // Revogar é transição de estado (soft-delete), não exclusão física — devolve 200 com a concessão
  // revogada, não 204. O runtime nem tem GRANT de DELETE; `DELETE` aqui é só o verbo HTTP da revogação.
  @Requer('administrar', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Delete(':grantId')
  async revogar(
    @Param('pipeId') pipeId: string,
    @Param('grantId') grantId: string,
  ): Promise<ConcessaoVisao> {
    return this.grants.revogar(validarIdRota(pipeId, 'pipeId'), validarIdRota(grantId, 'grantId'));
  }
}
