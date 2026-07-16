import { Controller, Get, Param, Query } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../cards.dto';
import { parseCursor, parseLimite } from '../kanban.dto';
import { type PaginaHistorico, CardHistoryReadService } from './card-history-read.service';

/**
 * Histórico do Card (Story 2.17), API INTERNA — **somente leitura**. `@Requer('ler','Pipe')` é a guarda GROSSA
 * (403 sem capacidade de leitura no CASL); a guarda FINA (acesso ATUAL ao Card → 404 sem acesso; histórico não
 * concede) vive no `CardHistoryReadService` via `exigirLerCard`. Rota GET, nada muda — a trilha é read-only.
 */
@Controller('cards/:cardId')
export class CardHistoryController {
  constructor(private readonly historico: CardHistoryReadService) {}

  /** A timeline do Card, paginada por cursor determinístico (`?cursor=&limite=`). */
  @Requer('ler', 'Pipe')
  @Get('history')
  async verHistorico(
    @Param('cardId') cardId: string,
    @Query('cursor') cursor?: string,
    @Query('limite') limite?: string,
  ): Promise<PaginaHistorico> {
    return this.historico.verHistorico(
      validarIdRota(cardId, 'cardId'),
      parseCursor(cursor),
      parseLimite(limite),
    );
  }
}
