import { All, Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import { SemContextoOrganizacional } from '../context/sem-contexto.decorator';
import { normalizarIp, proxiesConfiaveisDoAmbiente, resolverIpCliente } from './client-ip';
import { configHopDoAmbiente, HEADER_HOP, verificarHop, type ConfigHop } from './internal-hop';
import { AUTH, type Auth } from './auth.tokens';

/**
 * O header pelo qual o Better Auth lê o IP (é o default dele).
 *
 * Nós o **sobrescrevemos** com o IP resolvido pela nossa camada — ver `client-ip.ts` (modo direto) e
 * `internal-hop.ts` (modo hop, D-01). O valor que o cliente enviou nunca chega ao Better Auth: se
 * chegasse, bastaria forjá-lo para trocar de identidade a cada requisição e o G2 nunca dispararia.
 */
const HEADER_IP = 'x-forwarded-for';

/** Resultado da resolução de IP para o handler de auth: um IP (talvez `undefined`) ou rejeição fail-closed. */
type ResolucaoIp = { rejeitar: false; ip: string | undefined } | { rejeitar: true };

/**
 * Monta o handler do Better Auth sob `/api/auth/*`.
 *
 * **Dispensado do guard de contexto organizacional, e tinha de ser**: quem ainda não fez login não
 * tem sessão, logo não tem Membership, logo não tem Organização. Exigir contexto da rota de login
 * seria exigir que o usuário já estivesse logado para conseguir logar.
 *
 * A dispensa é declarada **por método**, não na classe — a lição do CR-04 da Story 1.3: na classe,
 * toda rota futura acrescentada aqui nasceria fora do guard sem uma linha no diff dizendo isso.
 *
 * ## Resolução de IP (D-01)
 *
 * Esta é a ÚNICA rota que consome o IP do cliente (o G2, rate limit por origem, vive no Better Auth).
 * Dois modos, escolhidos pela presença de `INTERNAL_HMAC_SECRET`:
 *
 * - **direto** (dev/teste/CI, sem o segredo): o IP vem do socket + `TRUSTED_PROXY_IPS`, como sempre.
 * - **hop** (staging/produção atrás do proxy do Coolify): a Web PROVA o IP do cliente com um cabeçalho
 *   assinado por requisição. Sem prova válida, `X-Forwarded-For` não é honrado — e uma tentativa de
 *   declarar IP sem prova (ou uma prova inválida/expirada/replay) é **recusada com 403** (fail-closed).
 *   Uma chamada direta sem `X-Forwarded-For` (probe/loopback) cai para o socket: não forja nada.
 */
@Controller('api/auth')
export class AuthController {
  /** Lido uma vez: nem a lista de proxies nem a config do hop mudam em runtime. */
  private readonly proxiesConfiaveis = proxiesConfiaveisDoAmbiente();
  private readonly configHop: ConfigHop = configHopDoAmbiente();

  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @SemContextoOrganizacional()
  @All('*splat')
  async handler(@Req() req: ExpressRequest, @Res() res: ExpressResponse): Promise<void> {
    const resolucao = this.resolverIp(req);
    if (resolucao.rejeitar) {
      // Fail-closed: hop exigido, prova ausente/inválida/expirada. Resposta NEUTRA — não revela o
      // motivo (assinatura vs. janela vs. rota), para não dar ao atacante um oráculo da verificação.
      res.status(403).send();
      return;
    }

    const resposta = await this.auth.handler(paraRequestWeb(req, resolucao.ip));

    res.status(resposta.status);

    // `Set-Cookie` é o único header que o `Headers` do padrão web **funde por vírgula** ao iterar —
    // e cookie fundido é cookie corrompido (o segundo vira "atributo" do primeiro, e flags de
    // segurança como `HttpOnly`/`Secure` se perdem). `getSetCookie()` devolve cada um inteiro.
    // Hoje o login emite um cookie só; isto blinda contra o dia em que o Better Auth emitir mais
    // (cache de sessão, "lembrar-me", cookies com prefixo `__Host-`).
    for (const cookie of resposta.headers.getSetCookie()) res.append('set-cookie', cookie);
    resposta.headers.forEach((valor, nome) => {
      if (nome.toLowerCase() !== 'set-cookie') res.append(nome, valor);
    });

    res.send(await resposta.text());
  }

  /**
   * Resolve o IP do cliente para o Better Auth, ou sinaliza rejeição fail-closed (modo hop).
   *
   * Modo direto: comportamento histórico (socket + `TRUSTED_PROXY_IPS`), sem rejeição.
   * Modo hop: só uma prova assinada válida autoriza um IP declarado. Sem prova e sem `X-Forwarded-For`,
   * cai para o socket (probe/loopback/cliente direto que não forja nada).
   */
  private resolverIp(req: ExpressRequest): ResolucaoIp {
    if (!this.configHop.modoHop) {
      const bruto = req.headers[HEADER_IP];
      const ip = resolverIpCliente({
        peer: req.socket.remoteAddress,
        forwarded: Array.isArray(bruto) ? bruto.join(',') : bruto,
        proxiesConfiaveis: this.proxiesConfiaveis,
      });
      return { rejeitar: false, ip };
    }

    const bruto = req.headers[HEADER_HOP];
    const header = Array.isArray(bruto) ? bruto[0] : bruto;
    const path = new URL(req.originalUrl, 'http://interno').pathname;
    const r = verificarHop({
      header,
      method: req.method,
      path,
      segredos: this.configHop.segredos,
      agora: Date.now(),
    });
    if (r.ok) return { rejeitar: false, ip: r.ip };

    // Sem prova E sem X-Forwarded-For: ninguém tentou declarar um IP. É o probe/loopback/cliente
    // direto legítimo — usa o socket (o próprio peer, que não pode ser falsificado).
    const temXff = req.headers[HEADER_IP] !== undefined;
    if (r.motivo === 'ausente' && !temXff) {
      const peer = req.socket.remoteAddress;
      return { rejeitar: false, ip: peer === undefined ? undefined : normalizarIp(peer) };
    }

    // Declarou um IP (X-Forwarded-For ou hop) sem prova válida: recusa.
    return { rejeitar: true };
  }
}

/**
 * Adapta a requisição do Express para o `Request` do padrão web, que é o que o Better Auth consome.
 *
 * Headers repetidos chegam do Node como array; `append` preserva **todos**. Descartar os extras
 * seria a mesma assimetria que abre request smuggling — o proxy enxerga um conjunto de headers, a
 * aplicação enxerga outro.
 *
 * A **exceção** é o header de IP, reescrito com o valor JÁ RESOLVIDO pelo controller (socket ou hop).
 */
function paraRequestWeb(req: ExpressRequest, ip: string | undefined): Request {
  const host = req.get('host') ?? 'localhost';
  const url = new URL(req.originalUrl, `${req.protocol}://${host}`);

  const headers = new Headers();
  for (const [nome, valor] of Object.entries(req.headers)) {
    if (valor === undefined) continue;
    const chave = nome.toLowerCase();
    if (chave === HEADER_IP) continue; // resolvido pelo controller, a partir do socket ou do hop
    if (chave === HEADER_HOP) continue; // cabeçalho interno: consumido aqui, nunca repassado adiante
    // `content-length`/`transfer-encoding` descrevem o corpo ORIGINAL; nós o reserializamos
    // (`JSON.stringify` abaixo), então o tamanho muda. Encaminhá-los deixaria o header em desacordo
    // com o corpo — hoje o undici recalcula e salva, mas depender disso é frágil. Deixa o `Request`
    // recomputar a partir do corpo real.
    if (chave === 'content-length' || chave === 'transfer-encoding') continue;
    if (Array.isArray(valor)) for (const v of valor) headers.append(nome, v);
    else headers.append(nome, valor);
  }

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
