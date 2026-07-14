import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { parseConfigMarcos, validarIdRota } from './phase-milestones.dto';
import { type ConfigMarcosVisao, PhaseMilestonesService } from './phase-milestones.service';

/**
 * Config de marcos por Fase (Story 2.12), API INTERNA. Rotas sob `phases/:phaseId` — o Pipe dono é resolvido da
 * Fase no servidor (nenhuma rota recebe `orgId` nem `pipeId` do cliente para autorização). `@Requer('ler','Pipe')`
 * é a guarda GROSSA (o tipo é acessível a qualquer Membership ativa); a guarda FINA (gerenciar o Pipe para
 * configurar; qualquer poder para ler) vive no `PhaseMilestonesService` (DBT-AUTHZ-01).
 *
 * `PUT` = SUBSTITUIÇÃO idempotente da config → **200** (não cria recurso; a Fase já existe).
 */
@Controller('phases/:phaseId/milestones')
export class PhaseMilestonesController {
  constructor(private readonly marcos: PhaseMilestonesService) {}

  @Requer('ler', 'Pipe')
  @Get()
  obter(@Param('phaseId') phaseId: string): Promise<ConfigMarcosVisao> {
    return this.marcos.obterConfig(validarIdRota(phaseId, 'phaseId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put()
  configurar(@Param('phaseId') phaseId: string, @Body() body: unknown): Promise<ConfigMarcosVisao> {
    return this.marcos.configurar(validarIdRota(phaseId, 'phaseId'), parseConfigMarcos(body));
  }
}
