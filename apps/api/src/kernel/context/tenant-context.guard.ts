import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { OrgContextResolver } from './org-context.resolver';
import { PRINCIPAL_PROVIDER, type PrincipalProvider } from './principal.provider';
import { RequestContext } from './request-context';
import { SEM_CONTEXTO_ORGANIZACIONAL } from './sem-contexto.decorator';

/** Header pelo qual o cliente PEDE uma Organização. Pedido — nunca autoridade. */
const HEADER_ORG = 'x-org-id';

/**
 * Guard GLOBAL de contexto organizacional. Deny-by-default: uma rota nova nasce protegida.
 *
 * Ele decide se a requisição prossegue e PREENCHE o escopo que o `RequestContextMiddleware` abriu.
 * Ele não abre o escopo — um guard retorna antes de o handler executar, então não tem como
 * envolver a continuação num `AsyncLocalStorage.run()`. Quem embrulha é o middleware; quem decide
 * é aqui.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContext: RequestContext,
    private readonly resolver: OrgContextResolver,
    @Inject(PRINCIPAL_PROVIDER) private readonly principais: PrincipalProvider,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const dispensada = this.reflector.getAllAndOverride<boolean>(SEM_CONTEXTO_ORGANIZACIONAL, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (dispensada) return true;

    const req = context.switchToHttp().getRequest<IncomingMessage>();

    const principal = await this.principais.resolver(req);
    if (!principal) {
      // 401, não 403: a diferença importa. 401 diz "não sei quem você é" (autentique-se); 403
      // diria "sei quem você é e você não pode" — o que seria mentira, e ainda vazaria a
      // informação de que a rota existe para alguém autenticado.
      //
      // Enquanto a Story 1.4 não chega, ESTE é o caminho de toda requisição. É o comportamento
      // desejado: sem sessão, não há contexto; sem contexto, não há acesso.
      throw new UnauthorizedException();
    }

    // O que o cliente PEDIU. O resolvedor confere contra a Membership; divergência é rejeição.
    const pedido = this.orgIdPedido(req);

    const contexto = await this.resolver.resolver(principal.accountId, pedido);
    this.requestContext.definir(contexto);

    return true;
  }

  /**
   * Lê o `orgId` pedido pelo cliente. Um header repetido chega como array — nesse caso não se
   * escolhe o primeiro: pedido ambíguo é pedido inválido, e "escolher um" é como se contrabandeia
   * valor por request smuggling.
   */
  private orgIdPedido(req: IncomingMessage): string | undefined {
    const bruto = req.headers[HEADER_ORG];
    if (bruto === undefined) return undefined;
    if (Array.isArray(bruto)) return '';
    return bruto;
  }
}
