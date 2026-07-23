import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Requer } from '../kernel/authz/requer.decorator';
import {
  parseCriarSolicitacao,
  parseEditarSolicitacao,
  parseResponsavel,
  parseVinculoCard,
  validarIdRota,
} from './solicitacoes.dto';
import { type SolicitacaoVisao, SolicitacoesService } from './solicitacoes.service';
import { type SolicitacaoLeituraVisao, SolicitacoesReadService } from './solicitacoes-read.service';

/**
 * API INTERNA das Solicitações (Story 5.2). `@Requer('ler','Pipe')` é a guarda GROSSA (o subject é o Pipe
 * dono); a guarda FINA (operar o Pipe para mutar; ler para consultar) vive no serviço via `pipe-authz`
 * (DBT-AUTHZ-01) — sem tocar o guard/`ability.ts` (C3 congelado). `orgId` NUNCA vem da rota/corpo.
 *
 * Criação → **201**; transições/edições/atribuições → **200** (não criam recurso). Nenhuma rota de exclusão
 * (o runtime não tem GRANT de DELETE em `Solicitacao`; arquivar/resolver = state).
 */
@Controller()
export class SolicitacoesController {
  constructor(
    private readonly solicitacoes: SolicitacoesService,
    private readonly read: SolicitacoesReadService,
  ) {}

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.CREATED)
  @Post('pipes/:pipeId/solicitacoes')
  criar(@Param('pipeId') pipeId: string, @Body() body: unknown): Promise<SolicitacaoVisao> {
    return this.solicitacoes.criar(validarIdRota(pipeId, 'pipeId'), parseCriarSolicitacao(body));
  }

  @Requer('ler', 'Pipe')
  @Get('pipes/:pipeId/solicitacoes')
  listar(
    @Param('pipeId') pipeId: string,
    @Query('incluirArquivadas') incluirArquivadas?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ): Promise<{ solicitacoes: SolicitacaoLeituraVisao[]; total: number }> {
    return this.read.listar(validarIdRota(pipeId, 'pipeId'), {
      incluirArquivadas: incluirArquivadas === 'true',
      take: take !== undefined ? Number(take) : undefined,
      skip: skip !== undefined ? Number(skip) : undefined,
    });
  }

  @Requer('ler', 'Pipe')
  @Get('solicitacoes/:solicitacaoId')
  obter(@Param('solicitacaoId') solicitacaoId: string): Promise<SolicitacaoLeituraVisao> {
    return this.read.obter(validarIdRota(solicitacaoId, 'solicitacaoId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Patch('solicitacoes/:solicitacaoId')
  editar(
    @Param('solicitacaoId') solicitacaoId: string,
    @Body() body: unknown,
  ): Promise<SolicitacaoVisao> {
    return this.solicitacoes.editar(
      validarIdRota(solicitacaoId, 'solicitacaoId'),
      parseEditarSolicitacao(body),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put('solicitacoes/:solicitacaoId/responsavel')
  atribuirResponsavel(
    @Param('solicitacaoId') solicitacaoId: string,
    @Body() body: unknown,
  ): Promise<SolicitacaoVisao> {
    return this.solicitacoes.atribuirResponsavel(
      validarIdRota(solicitacaoId, 'solicitacaoId'),
      parseResponsavel(body).responsavelMembershipId,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Put('solicitacoes/:solicitacaoId/card')
  vincularCard(
    @Param('solicitacaoId') solicitacaoId: string,
    @Body() body: unknown,
  ): Promise<SolicitacaoVisao> {
    return this.solicitacoes.vincularCard(
      validarIdRota(solicitacaoId, 'solicitacaoId'),
      parseVinculoCard(body).cardId,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('solicitacoes/:solicitacaoId/resolve')
  resolver(@Param('solicitacaoId') solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.solicitacoes.resolver(validarIdRota(solicitacaoId, 'solicitacaoId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('solicitacoes/:solicitacaoId/reopen')
  reabrir(@Param('solicitacaoId') solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.solicitacoes.reabrir(validarIdRota(solicitacaoId, 'solicitacaoId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('solicitacoes/:solicitacaoId/archive')
  arquivar(@Param('solicitacaoId') solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.solicitacoes.arquivar(validarIdRota(solicitacaoId, 'solicitacaoId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('solicitacoes/:solicitacaoId/restore')
  restaurar(@Param('solicitacaoId') solicitacaoId: string): Promise<SolicitacaoVisao> {
    return this.solicitacoes.restaurar(validarIdRota(solicitacaoId, 'solicitacaoId'));
  }
}
