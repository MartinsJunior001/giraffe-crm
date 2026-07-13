import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '@/proxy';
import { SESSION_COOKIE, SESSION_COOKIE_SECURE } from '@/lib/session';

/**
 * Prova o AC4 no nível da FUNÇÃO `proxy()` (não só a lógica pura): a extração de cookies do
 * `NextRequest`, a decisão e a construção do redirect ao `/login`. Se o proxy lesse o pathname/cookie
 * errado, ou montasse o redirect para o lugar errado, a lógica pura continuaria verde e só este teste
 * pegaria.
 */
function req(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set('cookie', cookie);
  return new NextRequest(new URL(`http://localhost:3000${path}`), { headers });
}

describe('proxy — proteção de rota (integração da função)', () => {
  it('rota protegida SEM cookie de sessão → redireciona ao /login', () => {
    const res = proxy(req('/painel'));
    // NextResponse.redirect usa 307 por padrão.
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/login$/);
  });

  it('rota protegida COM cookie de sessão (dev) → segue e DESLIZA o cookie (Max-Age fresco, sem Secure)', () => {
    const res = proxy(req('/painel', `${SESSION_COOKIE}=abc.def%2Bghi`));
    expect(res.headers.get('location')).toBeNull();

    const set = (res.headers.getSetCookie?.() ?? []).find((c) =>
      c.startsWith(`${SESSION_COOKIE}=`),
    );
    expect(set).toBeDefined();
    // Valor/assinatura preservados (round-trip de codificação fiel) e Max-Age re-emitido (deslize).
    expect(set!).toContain('abc.def%2Bghi');
    expect(set!).toMatch(/Max-Age=604800/);
    expect(set!).toMatch(/HttpOnly/i);
    expect(set!).toMatch(/SameSite=lax/i);
    // Em dev, o cookie NÃO é Secure (senão o browser em http o recusaria).
    expect(set!).not.toMatch(/;\s*Secure/i);
  });

  it('rota protegida COM cookie `__Secure-` (produção) → segue e re-emite COM Secure', () => {
    const res = proxy(req('/painel/sub', `${SESSION_COOKIE_SECURE}=abc`));
    expect(res.headers.get('location')).toBeNull();

    const set = (res.headers.getSetCookie?.() ?? []).find((c) =>
      c.startsWith(`${SESSION_COOKIE_SECURE}=`),
    );
    expect(set).toBeDefined();
    expect(set!).toMatch(/Max-Age=604800/);
    expect(set!).toMatch(/;\s*Secure/i); // `__Secure-` exige Secure
    expect(set!).toMatch(/HttpOnly/i);
  });
});
