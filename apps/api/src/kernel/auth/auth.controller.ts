import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { SemContextoOrganizacional } from '../context/sem-contexto.decorator';
import { AUTH, type Auth } from './auth.tokens';

/**
 * Monta o handler do Better Auth sob `/api/auth/*`.
 *
 * **Dispensado do guard de contexto organizacional, e tinha de ser**: quem ainda não fez login não
 * tem sessão, logo não tem Membership, logo não tem Organização. Exigir contexto da rota de login
 * seria exigir que o usuário já estivesse logado para conseguir logar.
 *
 * A dispensa é declarada **por método**, não na classe — a lição do CR-04 da Story 1.3: na classe,
 * toda rota futura acrescentada aqui nasceria fora do guard sem uma linha no diff dizendo isso.
 */
@Controller('api/auth')
export class AuthController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @SemContextoOrganizacional()
  @All('*splat')
  async handler(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    const resposta = await this.auth.handler(paraRequestWeb(req));

    res.status(resposta.status);
    resposta.headers.forEach((valor, nome) => res.append(nome, valor));

    res.send(await resposta.text());
  }
}

/**
 * Adapta a requisição do Express para o `Request` do padrão web, que é o que o Better Auth consome.
 *
 * Headers repetidos chegam do Node como array; `append` preserva **todos**. Descartar os extras
 * seria a mesma assimetria que abre request smuggling — o proxy enxerga um conjunto de headers, a
 * aplicação enxerga outro.
 */
function paraRequestWeb(req: ExpressRequest): Request {
  const host = req.get('host') ?? 'localhost';
  const url = new URL(req.originalUrl, `${req.protocol}://${host}`);

  const headers = new Headers();
  for (const [nome, valor] of Object.entries(req.headers)) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) for (const v of valor) headers.append(nome, v);
    else headers.append(nome, valor);
  }

  const temCorpo = req.method !== 'GET' && req.method !== 'HEAD';

  return new Request(url, {
    method: req.method,
    headers,
    // O Express já consumiu e parseou o corpo; reserializar é o preço de conviver com os dois
    // mundos (streams do Node e Fetch API).
    body: temCorpo ? JSON.stringify((req.body as unknown) ?? {}) : undefined,
  });
}
