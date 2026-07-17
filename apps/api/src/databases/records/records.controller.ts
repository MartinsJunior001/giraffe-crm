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
import { type CicloVidaRegistroVisao, RecordLifecycleService } from './record-lifecycle.service';
import { parseListarQuery } from './records-query.dto';
import { type RecordPaginaVisao, RecordsReadService } from './records-read.service';
import { parseCriar, parseEditar, validarIdRota } from './records.dto';
import { type RecordVisao, RecordsService } from './records.service';

/**
 * Ciclo de vida do Registro (Story 3.4) + visualização/tabela (Story 3.5), API INTERNA. Rotas sob
 * `databases/:databaseId` (o Registro pertence a 1 Database — RN-063; `Card ≠ Registro`). Todas
 * `@Requer('ler','Database')` (guarda GROSSA, aberta na 3.2); a guarda FINA (OPERAR o Database para mutar; LER
 * para a tabela) vive nos serviços (DBT-AUTHZ-01).
 *
 * Criar → **201** (idempotente). Obter/editar/arquivar/restaurar/listar → **200**. Sem rota de exclusão (runtime
 * sem GRANT DELETE). Sem timeline de Histórico (3.6).
 */
@Controller('databases/:databaseId')
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly lifecycle: RecordLifecycleService,
    private readonly leitura: RecordsReadService,
  ) {}

  @Requer('ler', 'Database')
  @Post('records')
  async criar(
    @Param('databaseId') databaseId: string,
    @Body() body: unknown,
  ): Promise<RecordVisao> {
    const dto = parseCriar(body);
    return this.records.criar(validarIdRota(databaseId, 'databaseId'), dto);
  }

  /** Tabela de Registros (Story 3.5): paginação/ordenação/filtros. Poder: ler (ler ≠ operar). */
  @Requer('ler', 'Database')
  @Get('records')
  async listar(
    @Param('databaseId') databaseId: string,
    @Query() query: Record<string, unknown>,
  ): Promise<RecordPaginaVisao> {
    const entrada = parseListarQuery(query);
    return this.leitura.listar(validarIdRota(databaseId, 'databaseId'), entrada);
  }

  @Requer('ler', 'Database')
  @Get('records/:recordId')
  async obter(
    @Param('databaseId') databaseId: string,
    @Param('recordId') recordId: string,
  ): Promise<RecordVisao> {
    return this.records.obter(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(recordId, 'recordId'),
    );
  }

  @Requer('ler', 'Database')
  @Patch('records/:recordId')
  async editar(
    @Param('databaseId') databaseId: string,
    @Param('recordId') recordId: string,
    @Body() body: unknown,
  ): Promise<RecordVisao> {
    const dto = parseEditar(body);
    return this.records.editarValores(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(recordId, 'recordId'),
      dto,
    );
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('records/:recordId/archive')
  async arquivar(
    @Param('databaseId') databaseId: string,
    @Param('recordId') recordId: string,
  ): Promise<CicloVidaRegistroVisao> {
    return this.lifecycle.arquivar(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(recordId, 'recordId'),
    );
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('records/:recordId/restore')
  async restaurar(
    @Param('databaseId') databaseId: string,
    @Param('recordId') recordId: string,
  ): Promise<CicloVidaRegistroVisao> {
    return this.lifecycle.restaurar(
      validarIdRota(databaseId, 'databaseId'),
      validarIdRota(recordId, 'recordId'),
    );
  }
}
