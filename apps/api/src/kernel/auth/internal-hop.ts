/**
 * Hop Web→API autenticado (débito D-01) — NÚCLEO PURO.
 *
 * ## Por que existe
 *
 * No padrão nativo do Coolify o IP do container da Web é DINÂMICO — `TRUSTED_PROXY_IPS` por IP fixo
 * deixou de ser durável. Sem substituto, a API teria de (a) confiar cegamente no `X-Forwarded-For`
 * (qualquer container comprometido forja o IP do cliente → G2 envenenado) ou (b) usar o IP do socket,
 * a própria Web (→ G2 num balde único). A saída é uma PROVA criptográfica por requisição: a Web assina
 * um cabeçalho interno que a API verifica ANTES de aceitar qualquer afirmação sobre o IP do cliente.
 *
 * ## O que a assinatura cobre (e por quê)
 *
 * `{ v, ts, ip, m, p }` — versão da chave, timestamp (ms), IP do cliente já validado pela Web, método
 * e caminho da requisição. O `m`+`p` AMARRAM a assinatura àquela chamada: uma prova capturada de um
 * `POST /api/auth/sign-in/email` não vale para nenhuma outra rota (barra replay cruzado). O `ts` dá a
 * janela curta de validade (anti-replay temporal).
 *
 * ## Fail-closed
 *
 * A verificação é a única autoridade: cabeçalho ausente, malformado, com assinatura inválida, fora da
 * janela (expirado) ou com método/caminho que não batem ⇒ `{ ok: false }`. Quem decide o efeito (usar
 * o IP provado, cair para o socket, ou rejeitar a requisição) é o chamador — ver `AuthController`.
 *
 * ## Sem dependência nova
 *
 * Reusa `node:crypto` (`createHmac` + `timingSafeEqual`), o mesmo primitivo do HMAC de login (G1) e do
 * evento canônico (2.16). O formato é determinístico e idêntico ao lado que assina (`apps/web`).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import { getEnv } from '../config/env';

/** Nome do cabeçalho interno. Prefixo `x-internal-` deixa claro que é serviço→serviço, nunca do browser. */
export const HEADER_HOP = 'x-internal-hop';

/** Versão do FORMATO do envelope (não confundir com a versão da CHAVE, que vai no próprio envelope). */
const FORMATO = 'h1';

/** Janela padrão de validade do timestamp (ms). Curta: o hop é local (Web→API na mesma rede). */
export const JANELA_PADRAO_MS = 30_000;

/** Tolerância de relógio adiantado do emissor (ms) — o par Web/API compartilha o host, mas folga barata. */
const SKEW_FUTURO_MS = 5_000;

export type PayloadHop = {
  /** Versão da CHAVE que assinou (para rotação: a API escolhe o segredo certo). */
  v: number;
  /** Timestamp de emissão, em ms (Date.now()). */
  ts: number;
  /** IP do cliente já validado pela Web (última entrada do XFF que o Traefik escreveu). */
  ip: string;
  /** Método HTTP em MAIÚSCULAS. */
  m: string;
  /** Caminho da requisição (pathname, sem query). */
  p: string;
};

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function deB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/** Base assinável: FORMATO + payload canônico (base64url). A assinatura cobre EXATAMENTE esta string. */
function baseAssinavel(payloadB64: string): string {
  return `${FORMATO}.${payloadB64}`;
}

function assinar(payloadB64: string, segredo: string): string {
  return createHmac('sha256', segredo).update(baseAssinavel(payloadB64)).digest('hex');
}

/**
 * Produz o valor do cabeçalho `x-internal-hop`. Usado pela Web (via o espelho em `apps/web`) e pelos
 * testes de integração da API. Formato: `h1.<payloadB64url>.<sigHex>`.
 */
export function assinarHop(payload: PayloadHop, segredo: string): string {
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${baseAssinavel(payloadB64)}.${assinar(payloadB64, segredo)}`;
}

export type ResultadoHop =
  | { ok: true; ip: string; keyVersion: number }
  | { ok: false; motivo: 'ausente' | 'malformado' | 'assinatura' | 'expirado' | 'rota' | 'ip' };

/** Compara dois hex de mesmo tamanho em tempo constante; tamanhos diferentes ⇒ falso sem vazar. */
function hexIgual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verifica o cabeçalho do hop, fail-closed. Retorna o IP PROVADO quando tudo confere.
 *
 * @param header  valor bruto de `x-internal-hop` (ou `undefined`/`null` se ausente).
 * @param method  método HTTP da requisição atual (comparado com `m`).
 * @param path    pathname da requisição atual (comparado com `p`).
 * @param segredos chaves aceitas: a atual e, durante a rotação, a anterior (AC6). Ordem irrelevante.
 * @param agora   Date.now() injetado (testável).
 * @param janelaMs validade do timestamp (default 30s).
 */
export function verificarHop(params: {
  header: string | null | undefined;
  method: string;
  path: string;
  segredos: readonly { versao: number; segredo: string }[];
  agora: number;
  janelaMs?: number;
}): ResultadoHop {
  const { header, method, path, segredos, agora } = params;
  const janelaMs = params.janelaMs ?? JANELA_PADRAO_MS;

  if (header === null || header === undefined || header === '')
    return { ok: false, motivo: 'ausente' };

  const partes = header.split('.');
  if (partes.length !== 3 || partes[0] !== FORMATO) return { ok: false, motivo: 'malformado' };
  const payloadB64 = partes[1]!;
  const sig = partes[2]!;

  let payload: PayloadHop;
  try {
    const obj = JSON.parse(deB64url(payloadB64).toString('utf8')) as unknown;
    if (typeof obj !== 'object' || obj === null) return { ok: false, motivo: 'malformado' };
    const c = obj as Record<string, unknown>;
    if (
      typeof c.v !== 'number' ||
      typeof c.ts !== 'number' ||
      typeof c.ip !== 'string' ||
      typeof c.m !== 'string' ||
      typeof c.p !== 'string'
    ) {
      return { ok: false, motivo: 'malformado' };
    }
    payload = { v: c.v, ts: c.ts, ip: c.ip, m: c.m, p: c.p };
  } catch {
    return { ok: false, motivo: 'malformado' };
  }

  // Assinatura primeiro: só chaves da versão declarada (rotação). Se nenhuma casa, é 'assinatura' —
  // nunca revelamos QUAL das checagens seguintes falharia numa prova não autenticada.
  const candidatos = segredos.filter((s) => s.versao === payload.v);
  const assinaturaOk = candidatos.some((s) => hexIgual(sig, assinar(payloadB64, s.segredo)));
  if (!assinaturaOk) return { ok: false, motivo: 'assinatura' };

  // Amarração à requisição: método + caminho. Barra reuso de uma prova de outra rota.
  if (payload.m !== method.toUpperCase() || payload.p !== path)
    return { ok: false, motivo: 'rota' };

  // Janela temporal: expirado (velho demais) ou adiantado além do skew ⇒ rejeitado (anti-replay).
  if (payload.ts < agora - janelaMs || payload.ts > agora + SKEW_FUTURO_MS) {
    return { ok: false, motivo: 'expirado' };
  }

  // O IP provado precisa ser, de fato, um IP — lixo assinado por engano não vira chave de rate limit.
  const ip = payload.ip.toLowerCase().startsWith('::ffff:')
    ? payload.ip.slice('::ffff:'.length)
    : payload.ip;
  if (isIP(ip) === 0) return { ok: false, motivo: 'ip' };

  return { ok: true, ip, keyVersion: payload.v };
}

export type ConfigHop =
  { modoHop: false } | { modoHop: true; segredos: { versao: number; segredo: string }[] };

/**
 * Lê a configuração do hop do ambiente. Ausência de `INTERNAL_HMAC_SECRET` = **modo direto** (dev/
 * teste/CI): a API resolve o IP como sempre. Presente = **modo hop**: as chaves (atual + anterior na
 * janela de rotação) que a verificação aceita. Lido sob demanda; o `getEnv()` já é cacheado.
 */
export function configHopDoAmbiente(): ConfigHop {
  const env = getEnv();
  if (env.INTERNAL_HMAC_SECRET === undefined) return { modoHop: false };
  const segredos = [{ versao: env.INTERNAL_HMAC_KEY_VERSION, segredo: env.INTERNAL_HMAC_SECRET }];
  if (
    env.INTERNAL_HMAC_PREVIOUS_SECRET !== undefined &&
    env.INTERNAL_HMAC_PREVIOUS_KEY_VERSION !== undefined
  ) {
    segredos.push({
      versao: env.INTERNAL_HMAC_PREVIOUS_KEY_VERSION,
      segredo: env.INTERNAL_HMAC_PREVIOUS_SECRET,
    });
  }
  return { modoHop: true, segredos };
}
