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
import { Requer } from '../../kernel/authz/requer.decorator';
import {
  parseCriarFase,
  parseIncluirArquivadas,
  parseRenomearFase,
  parseReordenarFase,
  validarIdRota,
} from './phases.dto';
import { type FaseVisao, PhasesService } from './phases.service';

/**
 * Gerenciamento de Fases de um Pipe (Story 2.3), API INTERNA. Nenhuma rota recebe `orgId` (vem do
 * contexto do servidor) nem troca `pipeId` (RN-030 — Fase não migra entre Pipes).
 *
 * Todas as rotas declaram `@Requer('ler','Pipe')` — a guarda GROSSA só confere que o tipo é acessível a
 * qualquer Membership ativa. **Não** se usa `@Requer('administrar','Pipe')` em gerenciar Fases: essa
 * ability só existe para o Admin da Org e barraria o **Admin do Pipe** na porta grossa. A guarda FINA
 * (Admin da Org **ou** Admin do Pipe gerencia; MEMBER/VIEWER só leem; sem acesso → 404) vive no
 * `PhasesService` (DBT-AUTHZ-01), onde ativa o poder diferencial por papel de Pipe.
 */
@Controller('pipes/:pipeId/phases')
export class PhasesController {
  constructor(private readonly phases: PhasesService) {}

  @Requer('ler', 'Pipe')
  @Get()
  async listar(
    @Param('pipeId') pipeId: string,
    @Query('arquivadas') arquivadas?: string,
  ): Promise<FaseVisao[]> {
    return this.phases.listar(validarIdRota(pipeId, 'pipeId'), parseIncluirArquivadas(arquivadas));
  }

  @Requer('ler', 'Pipe')
  @Post()
  async criar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<FaseVisao> {
    const { name } = parseCriarFase(body);
    return this.phases.criar(validarIdRota(pipeId, 'pipeId'), name);
  }

  @Requer('ler', 'Pipe')
  @Patch(':phaseId')
  async renomear(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Body() body: unknown,
  ): Promise<FaseVisao> {
    const { name } = parseRenomearFase(body);
    return this.phases.renomear(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(phaseId, 'phaseId'),
      name,
    );
  }

  // Reordenar é UPDATE de posição de uma Fase existente — devolve 200 com a Fase, não cria nada.
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('reorder')
  async reordenar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<FaseVisao> {
    const { phaseId, afterPhaseId } = parseReordenarFase(body);
    return this.phases.mover(validarIdRota(pipeId, 'pipeId'), phaseId, afterPhaseId);
  }

  // Arquivar/restaurar são TRANSIÇÕES DE ESTADO de uma Fase existente — 200, não 201 (nada é criado).
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post(':phaseId/archive')
  async arquivar(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<FaseVisao> {
    return this.phases.arquivar(validarIdRota(pipeId, 'pipeId'), validarIdRota(phaseId, 'phaseId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post(':phaseId/restore')
  async restaurar(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<FaseVisao> {
    return this.phases.restaurar(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(phaseId, 'phaseId'),
    );
  }
}
