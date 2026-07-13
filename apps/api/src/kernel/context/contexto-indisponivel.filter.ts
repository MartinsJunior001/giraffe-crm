import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { PinoLogger } from 'nestjs-pino';
import { ContextoIndisponivelError } from './request-context';

/**
 * Torna VISÍVEL a falha estrutural mais perigosa desta arquitetura.
 *
 * `ContextoIndisponivelError` nunca é culpa do usuário: ele significa que um handler tentou ler o
 * contexto organizacional numa requisição que não tinha nenhum. E isso só acontece por um de dois
 * motivos, ambos defeitos de programação nossos:
 *
 *   1. o middleware não abriu o escopo naquela rota (registro incompleto), ou
 *   2. a rota foi dispensada do guard mas o handler lê contexto assim mesmo.
 *
 * Sem este filtro, os dois viram um **500 anônimo**, indistinguível de um erro de banco ou de um
 * bug qualquer de domínio — e a falha que mais precisa ser notada é justamente a que some no meio
 * do ruído. Não dá para consertar o que não se consegue contar.
 *
 * O que ele NÃO faz: converter em 4xx. Um 4xx diria ao cliente que ele errou — mentira, e ainda o
 * convidaria a "tentar de novo com outros dados", que não vai adiantar nada. Continua sendo 500,
 * porque quebramos nós.
 *
 * O corpo permanece o genérico do Nest: o motivo vai para o log do operador, não para o cliente.
 * Dizer "contexto organizacional indisponível" na resposta descreveria a arquitetura interna para
 * quem estiver sondando.
 */
@Catch(ContextoIndisponivelError)
export class ContextoIndisponivelFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(erro: ContextoIndisponivelError, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<{ method?: string; url?: string }>();
    const res = http.getResponse<ServerResponse>();

    // `error`, não `warn`: uma requisição de domínio rodou sem contexto. Se este evento aparecer em
    // produção, alguma rota está fora da proteção — e a resposta certa é acordar alguém, não somar
    // uma linha num painel.
    //
    // Registra o método e o CAMINHO (sem query string, que carrega dado do usuário) — é o que
    // permite localizar a rota desprotegida. `motivo` distingue "não havia escopo" de "havia escopo,
    // mas o guard não resolveu": os dois têm causas diferentes.
    this.logger.error(
      {
        event: 'context.missing',
        method: req.method ?? null,
        path: (req.url ?? '').split('?')[0],
        motivo: erro.message,
      },
      'handler leu contexto organizacional numa requisição que não tem contexto',
    );

    res.statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ statusCode: 500, message: 'Internal Server Error' }));
  }
}
