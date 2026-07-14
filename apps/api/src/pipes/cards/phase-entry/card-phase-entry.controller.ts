import { Controller, Get, Param } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../cards.dto';
import { type BaseTemporalVisao, CardPhaseEntryReadService } from './card-phase-entry-read.service';

/**
 * Base temporal do Card (Story 2.12), API INTERNA — SOMENTE LEITURA. Rota sob `cards/:cardId`; o Pipe/Card dono é
 * resolvido no servidor. `@Requer('ler','Pipe')` é a guarda GROSSA; a guarda FINA (ler o Card — 2.10) vive no
 * serviço. Devolve a entrada atual na Fase + os marcos calculados (a base que a saúde 2.13 consome).
 */
@Controller('cards/:cardId')
export class CardPhaseEntryController {
  constructor(private readonly base: CardPhaseEntryReadService) {}

  @Requer('ler', 'Pipe')
  @Get('phase-entry')
  verBaseTemporal(@Param('cardId') cardId: string): Promise<BaseTemporalVisao> {
    return this.base.verBaseTemporal(validarIdRota(cardId, 'cardId'));
  }
}
