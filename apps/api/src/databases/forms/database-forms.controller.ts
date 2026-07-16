import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { FieldsService } from '../../pipes/forms/fields.service';
import {
  parseEditarCampo,
  parseOpcaoLabel,
  parseReordenarOpcao,
} from '../../pipes/forms/fields.dto';
import type { AlvoFormulario } from '../../pipes/forms/form-locate';
import {
  parseAdicionarCampo,
  parseReordenarCampo,
  validarIdRota,
} from '../../pipes/forms/forms.dto';
import {
  type CampoVisao,
  type FormularioVisao,
  FormsService,
} from '../../pipes/forms/forms.service';

/**
 * Formulário de Database (Story 3.3) — montagem (2.4) e evolução de Campos (2.5), API INTERNA. **Reutiliza o
 * Form Builder canônico** (`FormsService`/`FieldsService`) sem segundo builder: o único diferencial é o **alvo**
 * (`{ databaseId }`) e a autorização, que `form-authz` roteia para `database-authz` (3.2 — gerenciar = Admin da
 * Org / Admin do Database; MEMBER/VIEWER só leem; sem acesso → 404). `Database ≠ Pipe` (RN-061): rotas sob
 * `databases/:databaseId` e subject CASL `Database`.
 *
 * Todas `@Requer('ler','Database')` (guarda GROSSA, aberta na 3.2); a guarda FINA vive no serviço (DBT-AUTHZ-01).
 * Adicionar Campo → **201** (cria/materializa); reordenar/editar/arquivar/restaurar e o ciclo de opções → **200**.
 */
@Controller('databases/:databaseId')
export class DatabaseFormsController {
  constructor(
    private readonly forms: FormsService,
    private readonly fields: FieldsService,
  ) {}

  /** Alvo do Formulário de Database (valida o `:databaseId` de rota como UUID). */
  private alvo(databaseId: string): AlvoFormulario {
    return { databaseId: validarIdRota(databaseId, 'databaseId') };
  }

  // ── Montagem (2.4) ─────────────────────────────────────────────────────────────────────────────

  @Requer('ler', 'Database')
  @Get('form')
  async obter(@Param('databaseId') databaseId: string): Promise<FormularioVisao> {
    return this.forms.obterDeDatabase(validarIdRota(databaseId, 'databaseId'));
  }

  @Requer('ler', 'Database')
  @Post('form/fields')
  async adicionarCampo(
    @Param('databaseId') databaseId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.forms.adicionarCampo(this.alvo(databaseId), parseAdicionarCampo(body));
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/reorder')
  async reordenarCampo(
    @Param('databaseId') databaseId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    const { fieldId, afterFieldId } = parseReordenarCampo(body);
    return this.forms.reordenarCampo(this.alvo(databaseId), fieldId, afterFieldId);
  }

  // ── Evolução de Campo (2.5) ──────────────────────────────────────────────────────────────────

  @Requer('ler', 'Database')
  @Patch('form/fields/:fieldId')
  async editarCampo(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.editarCampo(
      this.alvo(databaseId),
      validarIdRota(fieldId, 'fieldId'),
      parseEditarCampo(body),
    );
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/:fieldId/archive')
  async arquivarCampo(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
  ): Promise<CampoVisao> {
    return this.fields.arquivarCampo(this.alvo(databaseId), validarIdRota(fieldId, 'fieldId'));
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/:fieldId/restore')
  async restaurarCampo(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
  ): Promise<CampoVisao> {
    return this.fields.restaurarCampo(this.alvo(databaseId), validarIdRota(fieldId, 'fieldId'));
  }

  // ── Opções de Seleção (2.5) ──────────────────────────────────────────────────────────────────

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/:fieldId/options')
  async adicionarOpcao(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.adicionarOpcaoCampo(
      this.alvo(databaseId),
      validarIdRota(fieldId, 'fieldId'),
      parseOpcaoLabel(body).label,
    );
  }

  @Requer('ler', 'Database')
  @Patch('form/fields/:fieldId/options/:optionId')
  async renomearOpcao(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.renomearOpcaoCampo(
      this.alvo(databaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
      parseOpcaoLabel(body).label,
    );
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/:fieldId/options/:optionId/reorder')
  async reordenarOpcao(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
    @Body() body: unknown,
  ): Promise<CampoVisao> {
    return this.fields.reordenarOpcaoCampo(
      this.alvo(databaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
      parseReordenarOpcao(body).afterOptionId,
    );
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/:fieldId/options/:optionId/archive')
  async arquivarOpcao(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
  ): Promise<CampoVisao> {
    return this.fields.arquivarOpcaoCampo(
      this.alvo(databaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
    );
  }

  @Requer('ler', 'Database')
  @HttpCode(HttpStatus.OK)
  @Post('form/fields/:fieldId/options/:optionId/remove')
  async removerOpcao(
    @Param('databaseId') databaseId: string,
    @Param('fieldId') fieldId: string,
    @Param('optionId') optionId: string,
  ): Promise<CampoVisao> {
    return this.fields.removerOpcaoCampo(
      this.alvo(databaseId),
      validarIdRota(fieldId, 'fieldId'),
      validarIdRota(optionId, 'optionId'),
    );
  }
}
