import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'node:http';
import { PinoLogger } from 'nestjs-pino';
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
    private readonly logger: PinoLogger,
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
   * Lê o `orgId` pedido pelo cliente.
   *
   * **Header repetido é pedido AMBÍGUO, e ambíguo é inválido.** Escolher "o primeiro" (ou o último)
   * é a assimetria de que vive o request smuggling: o proxy valida um valor, a aplicação honra
   * outro.
   *
   * Cuidado com a forma que a duplicata assume: o Node só devolve **array** para `set-cookie`.
   * Qualquer outro header repetido chega como **uma única string juntada por `", "`** —
   * `"uuid-a, uuid-b"`. Um `Array.isArray()` sozinho, portanto, nunca dispara, e a rejeição
   * aconteceria só por acidente (a vírgula quebra a regex de UUID lá no resolvedor). Defesa que
   * depende de acidente é defesa que some no dia em que alguém "consertar" a regex.
   *
   * A normalização para minúsculas existe porque o PostgreSQL emite `uuid` sempre em minúsculas:
   * sem ela, um cliente que mandasse o UUID em maiúsculas (comum em .NET/Java) receberia 403 sendo
   * membro legítimo — e ainda geraria um evento `context.denied`, poluindo com ruído o único sinal
   * de segurança que esta Story produz.
   *
   * A ambiguidade é rejeitada AQUI, e não devolvendo `''` para o resolvedor tropeçar nele. O `''`
   * só era rejeitado porque `UUID.test('')` é falso — um acoplamento invisível entre dois arquivos.
   * Bastaria alguém acrescentar no resolvedor um `if (pedido === '') return undefined` — leitura
   * perfeitamente razoável de "não pediu nada" — para o header duplicado passar a significar
   * "nenhuma Organização pedida", e a requisição ser ACEITA. Seria o buraco que este método existe
   * para fechar, aberto por uma correção de aparência inocente.
   */
  private orgIdPedido(req: IncomingMessage): string | undefined {
    const bruto = req.headers[HEADER_ORG];
    if (bruto === undefined) return undefined;

    if (Array.isArray(bruto) || bruto.includes(',')) {
      this.logger.warn(
        { event: 'context.denied', motivo: 'x-org-id repetido (pedido ambíguo)' },
        'contexto organizacional negado',
      );
      throw new ForbiddenException();
    }

    return bruto.trim().toLowerCase();
  }
}
