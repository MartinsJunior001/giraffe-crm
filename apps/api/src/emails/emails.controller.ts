import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Requer } from '../kernel/authz/requer.decorator';
import { parseCriarEmail, parseEditarEmail, validarIdRota } from './emails.dto';
import { type EmailVisao, EmailsService } from './emails.service';

/**
 * API INTERNA do Composer de e-mail (Story 6.1). `@Requer('ler','Organizacao')` é a guarda GROSSA (piso de
 * qualquer Membership ativa — C3 congelado); as capacidades FINAS (compor com/sem Card, autor-ou-Admin na
 * leitura) vivem no serviço via `pipe-authz`/papel (DBT-AUTHZ-01). `orgId` NUNCA vem da rota/corpo.
 *
 * Criação → **201**; edição/transições → **200** (idempotentes). Nenhuma rota de exclusão (o runtime não
 * tem GRANT de DELETE em `EmailMessage`; descartar = state). SEM rota de envio real (6.4, AD-28).
 */
@Controller()
export class EmailsController {
  constructor(private readonly emails: EmailsService) {}

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.CREATED)
  @Post('emails')
  criar(@Body() body: unknown): Promise<EmailVisao> {
    return this.emails.criar(parseCriarEmail(body));
  }

  @Requer('ler', 'Organizacao')
  @Get('emails/:emailId')
  obter(@Param('emailId') emailId: string): Promise<EmailVisao> {
    return this.emails.obter(validarIdRota(emailId, 'emailId'));
  }

  @Requer('ler', 'Organizacao')
  @Patch('emails/:emailId')
  editar(@Param('emailId') emailId: string, @Body() body: unknown): Promise<EmailVisao> {
    return this.emails.editar(validarIdRota(emailId, 'emailId'), parseEditarEmail(body));
  }

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @Post('emails/:emailId/submit')
  submeter(@Param('emailId') emailId: string): Promise<EmailVisao> {
    return this.emails.submeter(validarIdRota(emailId, 'emailId'));
  }

  @Requer('ler', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @Post('emails/:emailId/discard')
  descartar(@Param('emailId') emailId: string): Promise<EmailVisao> {
    return this.emails.descartar(validarIdRota(emailId, 'emailId'));
  }
}
