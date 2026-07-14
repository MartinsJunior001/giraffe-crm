import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { IncomingMessage } from 'node:http';
import { proxiesConfiaveisDoAmbiente, resolverIpCliente } from '../../kernel/auth/client-ip';
import { SemContextoOrganizacional } from '../../kernel/context/sem-contexto.decorator';
import { parseSubmissaoPublica, validarPublicId } from './public-submissions.dto';
import { PublicSubmissionService } from './public-submission.service';

/**
 * Endpoint PÚBLICO da submissão do Formulário inicial (Story 2.8). **Sem autenticação e sem contexto**:
 * `@SemContextoOrganizacional()` dispensa o `TenantContextGuard`, e a ausência de `@Requer` faz o `AuthzGuard`
 * não exigir nada. O tenant é resolvido **no servidor** pelo `publicId` opaco (nunca do cliente).
 *
 * O IP confiável é resolvido do **socket** (não do `X-Forwarded-For` cru — `client-ip.ts`), para o rate limit.
 * A resposta é sempre uma confirmação opaca; erros são uniformes (404 para link inválido/revogado, 400 genérico
 * para valores inválidos, 429 para excesso) — nunca vazam dado interno.
 */
@Controller('public')
export class PublicSubmissionController {
  constructor(private readonly submissao: PublicSubmissionService) {}

  @SemContextoOrganizacional()
  @Post('forms/:publicId/submit')
  async submeter(
    @Param('publicId') publicId: string,
    @Body() body: unknown,
    @Req() req: IncomingMessage,
  ): Promise<{ ok: true }> {
    const id = validarPublicId(publicId);
    const dto = parseSubmissaoPublica(body);
    const ip = this.ipCliente(req);
    return this.submissao.submeter(id, ip, dto);
  }

  /** IP confiável do cliente: socket + cadeia XFF só quando o peer é um proxy confiável (nunca falsificável). */
  private ipCliente(req: IncomingMessage): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    return resolverIpCliente({
      peer: req.socket?.remoteAddress,
      forwarded: Array.isArray(forwarded) ? forwarded.join(',') : forwarded,
      proxiesConfiaveis: proxiesConfiaveisDoAmbiente(),
    });
  }
}
