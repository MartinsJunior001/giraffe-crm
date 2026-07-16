import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginPOST } from '@/app/api/session/route';
import { POST as logoutPOST } from '@/app/logout/route';
import { proxy } from '@/proxy';
import { getPublicOrigin } from '@/lib/env';

/**
 * Regressão do bug de staging: atrás de proxy, `req.nextUrl.origin` é o BIND interno do container
 * (`https://0.0.0.0:3000`), não a origem pública. Três efeitos, todos cobertos aqui:
 *
 *   1. redirect absoluto montado com `nextUrl` mandava o browser para `https://0.0.0.0:3000/...`
 *      (fora do ar) → agora os redirects são RELATIVOS;
 *   2. o `Origin` do relay BFF ia como `https://0.0.0.0:3000` e o `trustedOrigins` do Better Auth
 *      recusava o login → agora vem de `WEB_PUBLIC_ORIGIN` (configuração);
 *   3. o fallback do CSRF comparava o `Origin` do browser com o bind interno (nunca casaria) →
 *      agora compara com a origem pública configurada.
 *
 * As requisições dos testes usam DELIBERADAMENTE `https://0.0.0.0:3000` como URL — o cenário real
 * do container — e provam que esse host não vaza em nenhum header de resposta.
 */

const ORIGEM_PUBLICA = 'https://crm-staging.exemplo.test';
const BIND_INTERNO = 'https://0.0.0.0:3000';

function postInterno(path: string, headers: Record<string, string>, body?: URLSearchParams) {
  return new NextRequest(new URL(`${BIND_INTERNO}${path}`), {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded', ...headers }),
    body: body ?? new URLSearchParams({ email: 'ana@exemplo.test', senha: 'x' }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getPublicOrigin — origem pública é configuração, com falha honesta', () => {
  it('normaliza para a ORIGEM (descarta path e barra final)', () => {
    expect(getPublicOrigin('https://crm.exemplo.com/')).toBe('https://crm.exemplo.com');
    expect(getPublicOrigin('https://crm.exemplo.com/painel')).toBe('https://crm.exemplo.com');
    expect(getPublicOrigin('https://crm.exemplo.com:8443')).toBe('https://crm.exemplo.com:8443');
  });

  it('em produção, ausente ⇒ erro honesto citando só o NOME da variável', () => {
    // `undefined` explícito NÃO serve aqui: o default de parâmetro reaplicaria
    // `process.env.WEB_PUBLIC_ORIGIN`, que o CI exporta — o ambiente contaminaria o teste.
    // O caso "ausente" determinístico é a string vazia (é o que `${VAR:-}` produz).
    expect(() => getPublicOrigin('', 'production')).toThrowError(/WEB_PUBLIC_ORIGIN ausente/);
    expect(() => getPublicOrigin('   ', 'production')).toThrowError(/WEB_PUBLIC_ORIGIN ausente/);
  });

  it('fora de produção, ausente ⇒ padrão localhost (pnpm dev sem configuração)', () => {
    expect(getPublicOrigin('', 'test')).toBe('http://localhost:3000');
    expect(getPublicOrigin('', 'development')).toBe('http://localhost:3000');
  });

  it('valor que não é URL absoluta ⇒ erro honesto (nunca origem lixo em header)', () => {
    expect(() => getPublicOrigin('crm.exemplo.com', 'production')).toThrowError(
      /WEB_PUBLIC_ORIGIN inválida/,
    );
  });
});

describe('login — o bind interno não vaza em Location nem em Origin', () => {
  it('falha de login ⇒ redirect RELATIVO (sem 0.0.0.0), mesmo com nextUrl interno', async () => {
    // API inalcançável de propósito: o caminho de falha é o que monta o redirect de erro.
    vi.stubEnv('API_BASE_URL', 'http://127.0.0.1:9');
    const res = await loginPOST(postInterno('/api/session', { 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login?erro=indisponivel');
  });

  it('o Origin enviado à API é a WEB_PUBLIC_ORIGIN configurada, não o bind interno', async () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', ORIGEM_PUBLICA);
    vi.stubEnv('API_BASE_URL', 'http://api:3001');
    const fetchFalso = vi.fn(async () => {
      return {
        status: 200,
        ok: true,
        headers: { getSetCookie: () => ['better-auth.session_token=abc; HttpOnly'] },
        json: async () => ({}),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchFalso);

    const res = await loginPOST(postInterno('/api/session', { 'sec-fetch-site': 'same-origin' }));

    expect(fetchFalso).toHaveBeenCalledOnce();
    const [, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).origin).toBe(ORIGEM_PUBLICA);
    // Sucesso: redirect relativo ao /painel com o relay do cookie.
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/painel');
    expect(res.headers.getSetCookie().some((c) => /session_token/.test(c))).toBe(true);
  });

  it('CSRF por fallback de Origin: compara com a origem PÚBLICA, não com o nextUrl', async () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', ORIGEM_PUBLICA);
    vi.stubEnv('API_BASE_URL', 'http://127.0.0.1:9');
    // Sem sec-fetch-site (proxy/agente antigo): o Origin do browser é a origem pública real.
    // Com a comparação antiga (nextUrl = bind interno), este POST legítimo seria 403.
    const res = await loginPOST(postInterno('/api/session', { origin: ORIGEM_PUBLICA }));
    expect(res.status).toBe(303);
  });

  it('cross-site continua recusado (403) com a origem configurada', async () => {
    vi.stubEnv('WEB_PUBLIC_ORIGIN', ORIGEM_PUBLICA);
    const res = await loginPOST(
      postInterno('/api/session', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.test' }),
    );
    expect(res.status).toBe(403);
  });
});

describe('logout — mesmos invariantes do login', () => {
  it('redirect RELATIVO ao /login, sem host interno', async () => {
    vi.stubEnv('API_BASE_URL', 'http://127.0.0.1:9');
    const res = await logoutPOST(postInterno('/logout', { 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/login');
  });
});

describe('proxy — proteção de rota redireciona RELATIVO', () => {
  it('sem cookie, a Location é /login sem esquema/host (nunca o bind interno)', () => {
    const res = proxy(new NextRequest(new URL(`${BIND_INTERNO}/painel`)));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('/login');
  });
});
