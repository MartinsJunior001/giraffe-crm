/**
 * Resolução do IP do cliente — a base do G2.
 *
 * ## Por que isto existe (e não confiamos no Better Auth para isso)
 *
 * O `getIp()` do Better Auth resolve o IP **exclusivamente a partir de headers**: ele nunca vê o
 * socket. Com `trustedProxies` vazio, ele aceita um `X-Forwarded-For` de valor único como se fosse
 * verdade — e um teste de spoofing provou o efeito: mandando um IP forjado diferente a cada
 * requisição, o limite por origem **nunca disparava**. O G2 virava decoração.
 *
 * E configurar `trustedProxies` lá não fecha o buraco: quem alcançar o contêiner **direto**, sem
 * passar pelo proxy, forja o header do mesmo jeito, porque a biblioteca não tem como saber quem é o
 * peer da conexão. Em rede Docker, alcançar o contêiner direto não é hipótese exótica.
 *
 * O endereço do socket é o único dado que o cliente não pode falsificar (ele precisa receber os
 * pacotes de volta), e quem o enxerga é a nossa camada HTTP. Logo, a decisão é nossa: aqui.
 *
 * ## A regra
 *
 * - Se o peer da conexão **não** é um proxy confiável, o IP é o do socket e o `X-Forwarded-For` é
 *   **ignorado por completo** — quem fala direto conosco não tem autoridade para dizer quem é.
 * - Se o peer **é** um proxy confiável, percorremos a cadeia da **direita para a esquerda** pulando
 *   proxies conhecidos: o primeiro salto não confiável é o cliente. A ponta esquerda é justamente a
 *   parte que o atacante controla (ele a envia; os proxies só acrescentam à direita) — por isso ela
 *   nunca é lida primeiro.
 */

import { getEnv } from '../config/env';

/**
 * Lista de proxies confiáveis vinda do ambiente. **Vazia por padrão** — e isso é a decisão.
 *
 * São endereços dos NOSSOS proxies, e só. Nunca uma faixa privada ampla ("o proxy está na rede
 * interna"): isso declararia confiável qualquer contêiner da rede, inclusive um comprometido.
 */
export function proxiesConfiaveisDoAmbiente(): string[] {
  return getEnv()
    .TRUSTED_PROXY_IPS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Converte o formato IPv4-mapeado do Node (`::ffff:127.0.0.1`) para IPv4 puro. */
export function normalizarIp(ip: string): string {
  const limpo = ip.trim().toLowerCase();
  return limpo.startsWith('::ffff:') ? limpo.slice('::ffff:'.length) : limpo;
}

/**
 * Devolve o IP do cliente, ou `undefined` se não houver peer (só acontece em socket já fechado).
 *
 * `proxiesConfiaveis` são endereços **exatos** — não faixas. A lista vazia (o default) significa
 * "não há proxy na frente": nenhum `X-Forwarded-For` é honrado.
 */
export function resolverIpCliente(params: {
  peer: string | undefined;
  forwarded: string | undefined;
  proxiesConfiaveis: readonly string[];
}): string | undefined {
  const { forwarded, proxiesConfiaveis } = params;

  const peer = params.peer === undefined ? undefined : normalizarIp(params.peer);
  if (peer === undefined) return undefined;

  const confiaveis = new Set(proxiesConfiaveis.map(normalizarIp));

  // Quem falou conosco não é proxy confiável: o que ele afirma sobre si mesmo não vale nada.
  if (!confiaveis.has(peer)) return peer;

  if (forwarded === undefined) return peer;

  const cadeia = forwarded
    .split(',')
    .map((ip) => normalizarIp(ip))
    .filter(Boolean);

  for (let i = cadeia.length - 1; i >= 0; i--) {
    const salto = cadeia[i];
    if (salto === undefined) continue;
    if (confiaveis.has(salto)) continue;
    return salto;
  }

  // Cadeia vazia, ou só de proxies confiáveis: o melhor que sabemos é o próprio peer.
  return peer;
}
