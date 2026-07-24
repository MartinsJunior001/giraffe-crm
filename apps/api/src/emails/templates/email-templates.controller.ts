import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Requer } from '../../kernel/authz/requer.decorator';
import { parseCriarTemplate, parseNovaVersao, validarIdRota } from './email-templates.dto';
import {
  EmailTemplatesService,
  type TemplateVersaoVisao,
  type TemplateVisao,
} from './email-templates.service';

/**
 * API INTERNA dos Templates de e-mail (Story 6.2). `@Requer('ler','Organizacao')` é a guarda GROSSA; a
 * fina (administrar = Admin da Org; consultar = ADMIN/MEMBER) vive no serviço (C3 congelado). `orgId`
 * NUNCA vem da rota/corpo. Criações → **201**; transições → **200** (idempotentes). Nenhuma rota de
 * exclusão (runtime sem GRANT de DELETE; `EmailTemplateVersion` é imutável pelo banco).
 */
@Controller()
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.CREATED)
  @Post('email-templates')
  criar(@Body() body: unknown): Promise<TemplateVisao> {
    return this.templates.criar(parseCriarTemplate(body));
  }

  @Requer('ler', 'Organizacao')
  @Get('email-templates')
  listar(): Promise<TemplateVisao[]> {
    return this.templates.listar();
  }

  @Requer('ler', 'Organizacao')
  @Get('email-templates/:templateId')
  obter(@Param('templateId') templateId: string) {
    return this.templates.obter(validarIdRota(templateId, 'templateId'));
  }

  @Requer('ler', 'Organizacao')
  @Get('email-templates/:templateId/versions')
  versoes(@Param('templateId') templateId: string): Promise<TemplateVersaoVisao[]> {
    return this.templates.listarVersoes(validarIdRota(templateId, 'templateId'));
  }

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.CREATED)
  @Post('email-templates/:templateId/versions')
  novaVersao(
    @Param('templateId') templateId: string,
    @Body() body: unknown,
  ): Promise<TemplateVersaoVisao> {
    return this.templates.novaVersao(
      validarIdRota(templateId, 'templateId'),
      parseNovaVersao(body),
    );
  }

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @Post('email-templates/:templateId/archive')
  arquivar(@Param('templateId') templateId: string): Promise<TemplateVisao> {
    return this.templates.arquivar(validarIdRota(templateId, 'templateId'));
  }

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @Post('email-templates/:templateId/restore')
  restaurar(@Param('templateId') templateId: string): Promise<TemplateVisao> {
    return this.templates.restaurar(validarIdRota(templateId, 'templateId'));
  }
}
