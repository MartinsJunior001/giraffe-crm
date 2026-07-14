import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { validarIdRota } from './fields.dto';
import type { AlvoFormulario } from './form-locate';
import {
  type EstadoPublicacao,
  FormPublicationService,
  type VersaoDetalhe,
} from './publication.service';

/**
 * Publicação de Formulário (Story 2.6), API INTERNA. Publicar/despublicar é **config do Pipe** (D3.2) — as
 * rotas ficam sob `pipes/:pipeId`, espelhadas para o Formulário **inicial** e o **de Fase** (poder resolvido
 * pelo Pipe dono da Fase). Todas `@Requer('ler','Pipe')` (guarda grossa); a guarda FINA (gerenciar para
 * publicar/despublicar; leitura para ver estado/histórico → 403/404) vive no `FormPublicationService`.
 *
 * `publish` **cria** uma `FormVersion` → **201**. `unpublish` é mudança de estado → **200**. Não há rota de
 * exclusão nem de edição de versão: a versão publicada é imutável (o banco recusa UPDATE/DELETE nela).
 */
@Controller('pipes/:pipeId')
export class FormPublicationController {
  constructor(private readonly publicacao: FormPublicationService) {}

  // ── Formulário inicial do Pipe ───────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Post('forms/initial/publish')
  async publicarInicial(@Param('pipeId') pipeId: string): Promise<VersaoDetalhe> {
    return this.publicacao.publicar(this.inicial(pipeId));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/unpublish')
  async despublicarInicial(@Param('pipeId') pipeId: string): Promise<EstadoPublicacao> {
    return this.publicacao.despublicar(this.inicial(pipeId));
  }

  @Requer('ler', 'Pipe')
  @Get('forms/initial/publication')
  async estadoInicial(@Param('pipeId') pipeId: string): Promise<EstadoPublicacao> {
    return this.publicacao.estado(this.inicial(pipeId));
  }

  @Requer('ler', 'Pipe')
  @Get('forms/initial/versions/:version')
  async versaoInicial(
    @Param('pipeId') pipeId: string,
    @Param('version') version: string,
  ): Promise<VersaoDetalhe> {
    return this.publicacao.versao(this.inicial(pipeId), validarVersao(version));
  }

  // ── Formulário de Fase ───────────────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Post('phases/:phaseId/form/publish')
  async publicarDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<VersaoDetalhe> {
    return this.publicacao.publicar(this.fase(pipeId, phaseId));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/unpublish')
  async despublicarDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<EstadoPublicacao> {
    return this.publicacao.despublicar(this.fase(pipeId, phaseId));
  }

  @Requer('ler', 'Pipe')
  @Get('phases/:phaseId/form/publication')
  async estadoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<EstadoPublicacao> {
    return this.publicacao.estado(this.fase(pipeId, phaseId));
  }

  @Requer('ler', 'Pipe')
  @Get('phases/:phaseId/form/versions/:version')
  async versaoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('version') version: string,
  ): Promise<VersaoDetalhe> {
    return this.publicacao.versao(this.fase(pipeId, phaseId), validarVersao(version));
  }

  // ── Helpers de alvo (validam o pipeId/phaseId de rota como UUID) ──────────────────────────────

  private inicial(pipeId: string): AlvoFormulario {
    return { pipeId: validarIdRota(pipeId, 'pipeId') };
  }

  private fase(pipeId: string, phaseId: string): AlvoFormulario {
    return { pipeId: validarIdRota(pipeId, 'pipeId'), phaseId: validarIdRota(phaseId, 'phaseId') };
  }
}

/** Valida `:version` de rota como inteiro positivo antes de tocar o banco. */
function validarVersao(version: string): number {
  const n = Number(version);
  if (!Number.isInteger(n) || n < 1) throw new BadRequestException('version inválida');
  return n;
}
