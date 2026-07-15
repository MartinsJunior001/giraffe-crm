import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../cards.dto';
import { parseValoresDeFase } from './phase-values.dto';
import { type ValoresDeFaseVisao, PhaseValuesService } from './phase-values.service';

/**
 * Valores do Formulário de Fase por (Card, Fase) (Story 2.15), API INTERNA. Rotas sob `cards/:cardId/phases/:phaseId`.
 * `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (operar o Card para gravar; ler para consultar) vive no
 * serviço. Gravar é **salvar, NUNCA mover** (CA4): esta rota jamais dispara uma transição de Fase.
 */
@Controller('cards/:cardId/phases/:phaseId')
export class PhaseValuesController {
  constructor(private readonly valores: PhaseValuesService) {}

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('values')
  async registrar(
    @Param('cardId') cardId: string,
    @Param('phaseId') phaseId: string,
    @Body() body: unknown,
  ): Promise<ValoresDeFaseVisao> {
    const dto = parseValoresDeFase(body);
    return this.valores.registrar(
      validarIdRota(cardId, 'cardId'),
      validarIdRota(phaseId, 'phaseId'),
      dto.valores,
    );
  }

  @Requer('ler', 'Pipe')
  @Get('values')
  async ler(
    @Param('cardId') cardId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<ValoresDeFaseVisao> {
    return this.valores.ler(validarIdRota(cardId, 'cardId'), validarIdRota(phaseId, 'phaseId'));
  }
}
