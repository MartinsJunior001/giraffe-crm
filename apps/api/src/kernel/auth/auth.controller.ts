import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { SemContextoOrganizacional } from '../context/sem-contexto.decorator';
import { proxiesConfiaveisDoAmbiente, resolverIpCliente } from './client-ip';
import { AUTH, type Auth } from './auth.tokens';

/**
 * O header pelo qual o Better Auth lê o IP (é o default dele).
 *
 * Nós o **sobrescrevemos** com o IP resolvido a partir do socket — ver `client-ip.ts`. O valor que
 * o cliente enviou nunca chega ao Better Auth: se chegasse, bastaria forjá-lo para trocar de
 * identidade a cada requisição e o G2 nunca dispararia.
 */
const HEADER_IP = 'x-forwarded-for';

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
  /** Lido uma vez: a lista de proxies não muda em runtime, e reler o ambiente por requisição seria
   * trabalho repetido no caminho quente do login. */
  private readonly proxiesConfiaveis = proxiesConfiaveisDoAmbiente();

  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @SemContextoOrganizacional()
  @All('*splat')
  async handler(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    const resposta = await this.auth.handler(paraRequestWeb(req, this.proxiesConfiaveis));

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
 *
 * A **exceção** é o header de IP, que é reescrito com o valor resolvido a partir do socket.
 */
function paraRequestWeb(req: ExpressRequest, proxiesConfiaveis: readonly string[]): Request {
  const host = req.get('host') ?? 'localhost';
  const url = new URL(req.originalUrl, `${req.protocol}://${host}`);

  const headers = new Headers();
  for (const [nome, valor] of Object.entries(req.headers)) {
    if (valor === undefined) continue;
    if (nome.toLowerCase() === HEADER_IP) continue; // resolvido abaixo, a partir do socket
    if (Array.isArray(valor)) for (const v of valor) headers.append(nome, v);
    else headers.append(nome, valor);
  }

  const bruto = req.headers[HEADER_IP];
  const ip = resolverIpCliente({
    peer: req.socket.remoteAddress,
    // Node junta headers repetidos por vírgula (salvo `set-cookie`), que é exatamente o formato de
    // uma cadeia de encaminhamento — então array e string colapsam no mesmo separador.
    forwarded: Array.isArray(bruto) ? bruto.join(',') : bruto,
    proxiesConfiaveis,
  });

  // `set`, não `append`: o Better Auth passa a ver UM valor, o nosso. O que o cliente mandou morre
  // aqui.
  if (ip !== undefined) headers.set(HEADER_IP, ip);

  const temCorpo = req.method !== 'GET' && req.method !== 'HEAD';

  return new Request(url, {
    method: req.method,
    headers,
    // O Express já consumiu e parseou o corpo; reserializar é o preço de conviver com os dois
    // mundos (streams do Node e Fetch API).
    body: temCorpo ? JSON.stringify((req.body as unknown) ?? {}) : undefined,
  });
}
