import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../../kernel/authz/requer.decorator';
import { validarIdRota } from '../records.dto';
import { CardRecordLinkService, type VinculoVisao } from './card-record-link.service';
import { parseCriarVinculo } from './card-record-link.dto';

/**
 * Vínculo Card↔Registro pela raiz do **Card** (Story 3.9). `@Requer('ler','Pipe')` é a guarda GROSSA (403 sem
 * capacidade de leitura no CASL); a guarda FINA (operar o Card **E** operar o Database do Registro para mutação;
 * ler o Card para listar) vive no `CardRecordLinkService`. O vínculo nunca concede acesso — cada lado mantém sua
 * autz canônica; listar expõe só a referência `recordId`, nunca conteúdo do Registro.
 */
@Controller('cards/:cardId/record-links')
export class CardRecordLinksController {
  constructor(private readonly links: CardRecordLinkService) {}

  /** Vincula um Registro ao Card (idempotente). 201. */
  @Post()
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.CREATED)
  async vincular(@Param('cardId') cardId: string, @Body() body: unknown): Promise<VinculoVisao> {
    const { recordId } = parseCriarVinculo(body);
    return this.links.vincular(validarIdRota(cardId, 'cardId'), recordId);
  }

  /** Lista os Registros vinculados ao Card (só referências `recordId`). */
  @Get()
  @Requer('ler', 'Pipe')
  async listar(@Param('cardId') cardId: string): Promise<VinculoVisao[]> {
    return this.links.listarPorCard(validarIdRota(cardId, 'cardId'));
  }

  /** Desvincula o Registro do Card (idempotente). 200. */
  @Delete(':recordId')
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  async desvincular(
    @Param('cardId') cardId: string,
    @Param('recordId') recordId: string,
  ): Promise<{ removido: boolean }> {
    return this.links.desvincular(
      validarIdRota(cardId, 'cardId'),
      validarIdRota(recordId, 'recordId'),
    );
  }
}
