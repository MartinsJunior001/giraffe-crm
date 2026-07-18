import { createHmac } from 'node:crypto';

/**
 * Hop Web→API autenticado (D-01) — lado que ASSINA (a Web).
 *
 * A Web recebe o IP real do cliente pelo `X-Forwarded-For` que o Traefik anexou (ver
 * `derivarIpValidadoDoXff`) e, em vez de encaminhá-lo cru, o entrega à API dentro de um envelope
 * ASSINADO por HMAC. A API verifica a assinatura antes de honrar qualquer afirmação sobre o IP —
 * assim a confiança deixa de depender do IP (dinâmico) do container da Web.
 *
 * O formato é IDÊNTICO ao verificador da API (`apps/api/.../internal-hop.ts`): `h1.<payloadB64url>.<sigHex>`,
 * assinatura HMAC-SHA256 sobre `h1.<payloadB64url>`. Núcleo pequeno e determinístico, duplicado de
 * propósito (não há pacote compartilhado entre os apps); um teste de vetor em cada lado guarda a paridade.
 *
 * Executa SEMPRE no servidor Next (o segredo é variável de servidor). Reusa `node:crypto`, sem dep nova.
 */

const FORMATO = 'h1';

export type PayloadHop = { v: number; ts: number; ip: string; m: string; p: string };

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Produz o valor do cabeçalho `x-internal-hop` para a requisição BFF→API descrita em `payload`. */
export function assinarHop(payload: PayloadHop, segredo: string): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const base = `${FORMATO}.${payloadB64}`;
  const sig = createHmac('sha256', segredo).update(base).digest('hex');
  return `${base}.${sig}`;
}

/**
 * Monta o cabeçalho a enviar (`{ 'x-internal-hop': ... }`) para uma chamada BFF→API, OU `{}` quando
 * não há hop configurado ou não há IP validado. Centraliza a decisão para os chamadores (login/logout).
 */
export function cabecalhoHop(params: {
  hmac: { secret: string; keyVersion: number } | undefined;
  ipCliente: string | undefined;
  method: string;
  path: string;
  agora?: number;
}): Record<string, string> {
  const { hmac, ipCliente, method, path } = params;
  if (hmac === undefined || ipCliente === undefined) return {};
  const header = assinarHop(
    {
      v: hmac.keyVersion,
      ts: params.agora ?? Date.now(),
      ip: ipCliente,
      m: method.toUpperCase(),
      p: path,
    },
    hmac.secret,
  );
  return { 'x-internal-hop': header };
}
