import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Requer } from '../../kernel/authz/requer.decorator';
import { ConflitoConviteError, InvitesService, type ConviteVisao } from './invites.service';
import { RateLimitExcedidoError } from './invite-rate-limit';
import { parseCriarConvite, validarUuidDeRota } from './invites.dto';

/**
 * Rotas de Convite (Story 8.2), superfície de API INTERNA sob `organizations/`.
 *
 * `@Requer('administrar','Organizacao')` é a guarda GROSSA — só o Admin da Org chega (a 8.1 abriu
 * essa ability apenas ao ADMIN). A Organização vem do CONTEXTO; nenhuma rota aceita `orgId`.
 *
 * **Mapeamento de erro no boundary HTTP** (o serviço lança erros de DOMÍNIO, sem `HttpException`):
 * `RateLimitExcedidoError` → **429 + `Retry-After`**; `ConflitoConviteError` → **409** com o motivo;
 * `NotFoundException`/`BadRequestException` sobem como estão. Respostas não-enumerantes: Convite de
 * outra Org é 404, não 403.
 *
 * **Step-up para convidar como ADMIN** (epics §616): o mecanismo de step-up (re-autenticação) NÃO
 * existe ainda na base. Fail-closed: convite com `role=ADMIN` é recusado com `STEP_UP_REQUIRED` (403)
 * até o step-up existir — inseguro seria o contrário (permitir sem a re-autenticação exigida).
 */
@Controller('organizations/invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Requer('administrar', 'Organizacao')
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async criar(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConviteVisao> {
    const { email, role } = parseCriarConvite(body);
    if (role === 'ADMIN') {
      // Gate fail-closed: sem mecanismo de step-up, não se convida Admin (dependência futura).
      throw new ForbiddenException({ motivo: 'STEP_UP_REQUIRED' });
    }
    return this.mapear(() => this.invites.criar(email, role), res);
  }

  @Requer('administrar', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @Post(':id/resend')
  async reenviar(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConviteVisao> {
    return this.mapear(() => this.invites.reenviar(validarUuidDeRota(id, 'id')), res);
  }

  @Requer('administrar', 'Organizacao')
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  async cancelar(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ConviteVisao> {
    return this.mapear(() => this.invites.cancelar(validarUuidDeRota(id, 'id')), res);
  }

  /** Traduz os erros de domínio no boundary HTTP, incluindo o header `Retry-After` do 429. */
  private async mapear(fn: () => Promise<ConviteVisao>, res: Response): Promise<ConviteVisao> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof RateLimitExcedidoError) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
        throw new HttpException(
          { motivo: 'RATE_LIMITED', retryAfterSeconds: err.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (err instanceof ConflitoConviteError) {
        throw new ConflictException({ motivo: err.motivo });
      }
      throw err;
    }
  }
}
