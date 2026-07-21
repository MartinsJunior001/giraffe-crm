import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import type { Response } from 'express';
import { proxiesConfiaveisDoAmbiente, resolverIpCliente } from '../../kernel/auth/client-ip';
import {
  PRINCIPAL_PROVIDER,
  type PrincipalProvider,
} from '../../kernel/context/principal.provider';
import { SemContextoOrganizacional } from '../../kernel/context/sem-contexto.decorator';
import { InviteAcceptService, type AceiteVisao } from './invite-accept.service';
import { parseAceitarConvite } from './invite-accept.dto';
import { RateLimitExcedidoError } from './invite-rate-limit';

/**
 * Aceite de Convite (Story 8.3) — superfície do CONVIDADO, distinta da gestão administrativa
 * (`organizations/invites`, 8.2).
 *
 * **`@SemContextoOrganizacional()`** (molde da 1.9): a rota dispensa o CONTEXTO de Organização porque o
 * convidado ainda NÃO é membro do destino — exigir contexto o trancaria num 403 sem saída. O que ela
 * **não** dispensa é a AUTENTICAÇÃO: o principal é resolvido aqui, explicitamente; sem sessão → 401. A
 * Org e o papel saem do Convite (resolvido pelo hash do token); a Account, da sessão. Nada do cliente.
 *
 * **Não-enumeração:** token inexistente/obsoleto/estado não aceitável → **404 uniforme**; token válido
 * com identidade incompatível (o requerente possui o link, mas está logado como outra conta) → **403**.
 * Rate limit de aceite excedido → **429 + `Retry-After`**; Membership suspensa → **409**.
 */
@Controller('invites')
export class InviteAcceptController {
  constructor(
    private readonly aceite: InviteAcceptService,
    @Inject(PRINCIPAL_PROVIDER) private readonly principais: PrincipalProvider,
  ) {}

  @SemContextoOrganizacional()
  @HttpCode(HttpStatus.OK)
  @Post('accept')
  async aceitar(
    @Req() req: IncomingMessage,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AceiteVisao> {
    // 200, não 201: o aceite pode reativar uma Membership existente (REMOVED) ou ser idempotente — não
    // é sempre "criar recurso". A demonstração de "juntou-se" é a Membership devolvida.
    const principal = await this.principais.resolver(req);
    if (!principal) throw new UnauthorizedException();

    const { token } = parseAceitarConvite(body);
    const ip = this.ipCliente(req);

    try {
      return await this.aceite.aceitar(token, principal.accountId, ip);
    } catch (err) {
      if (err instanceof RateLimitExcedidoError) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
        throw new HttpException(
          { motivo: 'RATE_LIMITED', retryAfterSeconds: err.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }
  }

  /** IP confiável do socket (nunca `X-Forwarded-For` cru) — chave de rate limit não falsificável. */
  private ipCliente(req: IncomingMessage): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    return resolverIpCliente({
      peer: req.socket?.remoteAddress,
      forwarded: Array.isArray(forwarded) ? forwarded.join(',') : forwarded,
      proxiesConfiaveis: proxiesConfiaveisDoAmbiente(),
    });
  }
}
