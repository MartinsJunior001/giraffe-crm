import { Controller, Get, Param } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../records.dto';
import { CardRecordLinkService, type VinculoVisao } from './card-record-link.service';

/**
 * Vínculo Card↔Registro pela raiz do **Registro** (Story 3.9) — só LEITURA. `@Requer('ler','Database')` é a
 * guarda GROSSA; a fina (ler o Database dono) vive no serviço. Expõe só a referência `cardId` de cada vínculo
 * ativo — nunca conteúdo do Card (o vínculo não concede acesso ao Card nem ao seu histórico).
 */
@Controller('databases/:databaseId/records/:recordId/card-links')
export class RecordCardLinksController {
  constructor(private readonly links: CardRecordLinkService) {}

  /** Lista os Cards vinculados ao Registro (só referências `cardId`). */
  @Get()
  @Requer('ler', 'Database')
  async listar(
    @Param('databaseId') databaseId: string,
    @Param('recordId') recordId: string,
  ): Promise<VinculoVisao[]> {
    return this.links.listarPorRegistro(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(recordId, 'recordId'),
    );
  }
}
