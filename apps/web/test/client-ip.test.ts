import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { derivarIpValidadoDoXff } from '@/lib/client-ip';
import { POST as loginPOST } from '@/app/api/session/route';

/**
 * Elo Web→API da cadeia de proxy confiável (D-01: Traefik → Web → API).
 *
 * O invariante: o que a Web encaminha à API é a ÚLTIMA entrada do X-Forwarded-For — a única
 * escrita por quem viu o socket (o Traefik ANEXA o peer real ao final) — e NUNCA a ponta
 * esquerda, que é a parte que um atacante controla. Lixo não vira header: fail-closed.
 */
describe('derivarIpValidadoDoXff — a última entrada é a única que o Traefik escreveu', () => {
  it('cadeia de um salto (o caso normal atrás do Traefik) ⇒ o próprio IP', () => {
    expect(derivarIpValidadoDoXff('203.0.113.7')).toBe('203.0.113.7');
  });

  it('XFF forjado pelo cliente ⇒ a forja fica na esquerda e é IGNORADA', () => {
    // Cliente mandou "1.2.3.4"; o Traefik anexou o IP real do socket ao final.
    expect(derivarIpValidadoDoXff('1.2.3.4, 203.0.113.7')).toBe('203.0.113.7');
    expect(derivarIpValidadoDoXff('9.9.9.9, 8.8.8.8, 203.0.113.7')).toBe('203.0.113.7');
  });

  it('header ausente (dev sem proxy) ⇒ undefined, nenhum header é enviado', () => {
    expect(derivarIpValidadoDoXff(null)).toBeUndefined();
  });

  it('última entrada que não é IP ⇒ undefined (lixo nunca vira header)', () => {
    expect(derivarIpValidadoDoXff('203.0.113.7, unknown')).toBeUndefined();
    expect(derivarIpValidadoDoXff('999.999.999.999')).toBeUndefined();
    expect(derivarIpValidadoDoXff('')).toBeUndefined();
    expect(derivarIpValidadoDoXff('  ,  ,  ')).toBeUndefined();
  });

  it('IPv6 e IPv4-mapeado são aceitos e normalizados', () => {
    expect(derivarIpValidadoDoXff('2001:db8::1')).toBe('2001:db8::1');
    expect(derivarIpValidadoDoXff('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });
});

describe('login — o relay encaminha SÓ o IP validado, nunca a cadeia', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function loginComXff(xff?: string): Promise<Record<string, string>> {
    vi.stubEnv('API_BASE_URL', 'http://api:3001');
    const fetchFalso = vi.fn(
      async () =>
        ({
          status: 200,
          ok: true,
          headers: { getSetCookie: () => [] },
          json: async () => ({}),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchFalso);

    const headers = new Headers({
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-site': 'same-origin',
    });
    if (xff !== undefined) headers.set('x-forwarded-for', xff);

    await loginPOST(
      new NextRequest(new URL('https://0.0.0.0:3000/api/session'), {
        method: 'POST',
        headers,
        body: new URLSearchParams({ email: 'ana@exemplo.test', senha: 'x' }),
      }),
    );
    const [, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    return init.headers as Record<string, string>;
  }

  it('forja na esquerda ⇒ a API recebe UM header com o IP real (última entrada)', async () => {
    const headers = await loginComXff('6.6.6.6, 203.0.113.7');
    expect(headers['x-forwarded-for']).toBe('203.0.113.7');
  });

  it('sem XFF ⇒ nenhum x-forwarded-for é enviado (a API cai no peer)', async () => {
    const headers = await loginComXff(undefined);
    expect('x-forwarded-for' in headers).toBe(false);
  });
});
