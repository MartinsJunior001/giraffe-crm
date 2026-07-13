import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as loginPOST } from '@/app/api/session/route';
import { POST as logoutPOST } from '@/app/logout/route';

/**
 * Prova, no nível do route handler, a defesa contra login/logout CSRF (achado do Blind Security):
 * um POST CROSS-SITE é recusado com 403 ANTES de tocar a API — sem isso, um form de terceiro plantaria
 * a sessão do atacante no navegador da vítima (login CSRF → vazamento cross-tenant).
 */
function postCrossSite(path: string): NextRequest {
  const headers = new Headers({
    'sec-fetch-site': 'cross-site',
    origin: 'https://evil.test',
    'content-type': 'application/x-www-form-urlencoded',
  });
  return new NextRequest(new URL(`http://localhost:3000${path}`), { method: 'POST', headers });
}

describe('CSRF nos route handlers de mutação', () => {
  it('login cross-site ⇒ 403 (não autentica, não faz relay de cookie)', async () => {
    const res = await loginPOST(postCrossSite('/api/session'));
    expect(res.status).toBe(403);
    // Não pode ter plantado cookie de sessão nenhum.
    expect((res.headers.getSetCookie?.() ?? []).some((c) => /session_token/i.test(c))).toBe(false);
  });

  it('logout cross-site ⇒ 403 (não força logout da vítima)', async () => {
    const res = await logoutPOST(postCrossSite('/logout'));
    expect(res.status).toBe(403);
  });
});
