import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import {
  parseEditarCampo,
  parseOpcaoLabel,
  parseReordenarOpcao,
  validarIdRota,
} from './fields.dto';
import { FieldsService } from './fields.service';
import type { AlvoFormulario } from './form-locate';
import type { CampoVisao } from './forms.service';

/**
 * Evolução de Campo (Story 2.5), API INTERNA. Como configurar Formulário é **config do Pipe** (D3.2), as
 * rotas ficam sob `pipes/:pipeId`, espelhadas para o Formulário **inicial** e o **de Fase** (poder resolvido
 * pelo Pipe dono da Fase). Todas `@Requer('ler','Pipe')` (guarda grossa); a guarda FINA (gerenciar → 403
 * para MEMBER/VIEWER; sem acesso → 404) vive no `FieldsService` (DBT-AUTHZ-01).
 *
 * Toda operação é mutação de linha existente → **200** (nenhuma criação de linha; nenhuma rota de exclusão —
 * remover opção é UPDATE do `typeConfig`). `type` não é editável; opções evoluem só por rotas dedicadas.
 */
@Controller('pipes/:pipeId')
export class FieldsController {
  constructor(private readonly fields: FieldsService) {}

  // ── Formulário inicial do Pipe ───────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Patch('forms/initial/fields/:fieldId')
  async editarInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.editarCampo(
      this.inicial(pipeId),
      validarIdRota(fieldId, 'fieldId'),
      parseEditarCampo(body),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/:fieldId/archive')
  async arquivarInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
  ): Promise<CampoVisao> {
    return this.fields.arquivarCampo(this.inicial(pipeId), validarIdRota(fieldId, 'fieldId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/:fieldId/restore')
  async restaurarInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
  ): Promise<CampoVisao> {
    return this.fields.restaurarCampo(this.inicial(pipeId), validarIdRota(fieldId, 'fieldId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/:fieldId/options')
  async adicionarOpcaoInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.adicionarOpcaoCampo(
      this.inicial(pipeId),
      validarIdRota(fieldId, 'fieldId'),
      parseOpcaoLabel(body).label,
    );
  }

  @Requer('ler', 'Pipe')
  @Patch('forms/initial/fields/:fieldId/options/:optionId')
  async renomearOpcaoInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.renomearOpcaoCampo(
      this.inicial(pipeId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
      parseOpcaoLabel(body).label,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/:fieldId/options/:optionId/reorder')
  async reordenarOpcaoInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.reordenarOpcaoCampo(
      this.inicial(pipeId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
      parseReordenarOpcao(body).afterOptionId,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/:fieldId/options/:optionId/archive')
  async arquivarOpcaoInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
  ): Promise<CampoVisao> {
    return this.fields.arquivarOpcaoCampo(
      this.inicial(pipeId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('forms/initial/fields/:fieldId/options/:optionId/remove')
  async removerOpcaoInicial(
    @Param('pipeId') pipeId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
  ): Promise<CampoVisao> {
    return this.fields.removerOpcaoCampo(
      this.inicial(pipeId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
    );
  }

  // ── Formulário de Fase ───────────────────────────────────────────────────────────────────────

  @Requer('ler', 'Pipe')
  @Patch('phases/:phaseId/form/fields/:fieldId')
  async editarDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.editarCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
      parseEditarCampo(body),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/:fieldId/archive')
  async arquivarDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
  ): Promise<CampoVisao> {
    return this.fields.arquivarCampo(this.fase(pipeId, phaseId), validarIdRota(fieldId, 'fieldId'));
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/:fieldId/restore')
  async restaurarDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
  ): Promise<CampoVisao> {
    return this.fields.restaurarCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/:fieldId/options')
  async adicionarOpcaoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.adicionarOpcaoCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
      parseOpcaoLabel(body).label,
    );
  }

  @Requer('ler', 'Pipe')
  @Patch('phases/:phaseId/form/fields/:fieldId/options/:optionId')
  async renomearOpcaoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.renomearOpcaoCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
      parseOpcaoLabel(body).label,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/:fieldId/options/:optionId/reorder')
  async reordenarOpcaoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.reordenarOpcaoCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
      parseReordenarOpcao(body).afterOptionId,
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/:fieldId/options/:optionId/archive')
  async arquivarOpcaoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
  ): Promise<CampoVisao> {
    return this.fields.arquivarOpcaoCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
    );
  }

  @Requer('ler', 'Pipe')
  @HttpCode(HttpStatus.OK)
  @Post('phases/:phaseId/form/fields/:fieldId/options/:optionId/remove')
  async removerOpcaoDeFase(
    @Param('pipeId') pipeId: string,
    @Param('phaseId') phaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
  ): Promise<CampoVisao> {
    return this.fields.removerOpcaoCampo(
      this.fase(pipeId, phaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
    );
  }

  // ── Helpers de alvo (validam o pipeId/phaseId de rota como UUID) ──────────────────────────────

  private inicial(pipeId: string): AlvoFormulario {
    return { pipeId: validarIdRota(pipeId, 'pipeId') };
  }

  private fase(pipeId: string, phaseId: string): AlvoFormulario {
    return { pipeId: validarIdRota(pipeId, 'pipeId'), phaseId: validarIdRota(phaseId, 'phaseId') };
  }
}
