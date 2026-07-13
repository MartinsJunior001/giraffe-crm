import { Injectable, type NestMiddleware } from '@nestjs/common';
import { RequestContext } from './request-context';

/**
 * Abre o escopo de contexto da requisição — e só isso.
 *
 * Ele não resolve nada e não autoriza nada. A única responsabilidade é garantir que existe um
 * escopo de `AsyncLocalStorage` envolvendo a requisição INTEIRA (inclusive os guards, que
 * precisam escrever nele) e que esse escopo **morre** com ela.
 *
 * Middleware é o único lugar que consegue fazer isso: ele recebe o `next` e pode embrulhá-lo. Um
 * guard retorna antes do handler; um interceptor rodaria depois dos guards, tarde demais para
 * que o próprio guard escreva no escopo.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContext) {}

  use(_req: unknown, _res: unknown, next: () => void): void {
    this.requestContext.executarNoEscopo(next);
  }
}
