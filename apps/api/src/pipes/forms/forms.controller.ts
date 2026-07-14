import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { parseAdicionarCampo, parseReordenarCampo, validarIdRota } from './forms.dto';
import { type CampoVisao, type FormularioVisao, FormsService } from './forms.service';

/**
 * Domínio Formulário (Story 2.4), API INTERNA. Configurar Formulário (inicial e de Fase) é **config do Pipe**
 * (D3.2) — logo as rotas ficam sob `pipes/:pipeId`. Nenhuma recebe `orgId` (vem do contexto do servidor);
 * nenhuma de exclusão, de publicar (2.6) ou de editar/arquivar Campo (2.5).
 *
 * Todas declaram `@Requer('ler','Pipe')` — a guarda GROSSA só confere que o tipo é acessível a qualquer
 * Membership ativa. A guarda FINA (obter exige ao menos leitura → 404 sem acesso; adicionar/reordenar exigem
 * gerenciar → 403 para MEMBER/VIEWER) vive no `FormsService` (DBT-AUTHZ-01), reusando a resolução da 2.3.
 *
 * O Formulário **de Fase** resolve o poder pelo Pipe dono da Fase (a config da Fase é config do mesmo Pipe).
 */
@Controller('pipes/:pipeId')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  // ── Formulário inicial do Pipe ───────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Get('forms/initial')
  async obterInicial(@Param('pipeId') pipeId: string): Promise<FormularioVisao> {
    return this.forms.obterInicial(validarIdRota(pipeId, 'pipeId'));
  }

  @Requer('ler', 'Pipe')
  @Post('forms/initial/fields')
  async adicionarCampoInicial(
    @Param('pipeId') pipeId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.forms.adicionarCampo(
      { pipeId: validarIdRota(pipeId, 'pipeId') },
      parseAdicionarCampo(body),
    );
  }

  // Reordenar é UPDATE de posição de um Campo existente — devolve 200, não cria nada.
  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/reorder')
  async reordenarCampoInicial(
    @Param('pipeId') pipeId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    const { fieldId, afterFieldId } = parseReordenarCampo(body);
    return this.forms.reordenarCampo(
      { pipeId: validarIdRota(pipeId, 'pipeId') },
      fieldId,
      afterFieldId,
    );
  }

  // ── Formulário de Fase ───────────────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Get('phases/:phaseId/form')
  async obterDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
  ): Promise<FormularioVisao> {
    return this.forms.obterDeFase(
      validarIdRota(pipeId, 'pipeId'),
      validarIdRota(phaseId, 'phaseId'),
    );
  }

  @Requer('ler', 'Pipe')
  @Post('phases/:phaseId/form/fields')
  async adicionarCampoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.forms.adicionarCampo(
      { pipeId: validarIdRota(pipeId, 'pipeId'), phaseId: validarIdRota(phaseId, 'phaseId') },
      parseAdicionarCampo(body),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/reorder')
  async reordenarCampoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    const { fieldId, afterFieldId } = parseReordenarCampo(body);
    return this.forms.reordenarCampo(
      { pipeId: validarIdRota(pipeId, 'pipeId'), phaseId: validarIdRota(phaseId, 'phaseId') },
      fieldId,
      afterFieldId,
    );
  }
}
