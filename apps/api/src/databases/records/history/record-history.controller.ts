import { Controller, Get, Param, Query } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../records.dto';
import { type PaginaHistorico, RecordHistoryReadService } from './record-history-read.service';
import { parseCursor, parseLimite } from './record-history.dto';

/**
 * Histórico do Registro (Story 3.6), API INTERNA — **somente leitura**. Rota sob `databases/:databaseId/records/
 * :recordId` (o Registro pertence a 1 Database — RN-063; `Card ≠ Registro`). `@Requer('ler','Database')` é a guarda
 * GROSSA (403 sem capacidade de leitura no CASL); a guarda FINA (acesso ATUAL ao Database dono → 404 sem acesso;
 * histórico não concede) vive no `RecordHistoryReadService` via `exigirLerDatabase`. GET, nada muda — a trilha é
 * read-only e imutável (append-only desde 3.4).
 */
@Controller('databases/:databaseId/records/:recordId')
export class RecordHistoryController {
  constructor(private readonly historico: RecordHistoryReadService) {}

  /** A timeline do Registro, paginada por cursor determinístico (`?cursor=&limite=`). */
  @Requer('ler', 'Database')
  @Get('history')
  async verHistorico(
    @Param('databaseId') databaseId: string,
    @Param('recordId') recordId: string,
    @Query('cursor') cursor?: string,
    @Query('limite') limite?: string,
  ): Promise<PaginaHistorico> {
    return this.historico.verHistorico(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(recordId, 'recordId'),
      parseCursor(cursor),
      parseLimite(limite),
    );
  }
}
