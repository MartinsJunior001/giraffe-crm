import { NextResponse, type NextRequest } from 'next/server';
import { getPublicOrigin } from '@/lib/env';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_S,
  decidirAcesso,
} from '@/lib/session';

/**
 * Proteção de rota + deslize do cookie — (Next 16: convenção `proxy`, que sucede `middleware`).
 *
 * Duas responsabilidades, ambas UX (a negação REAL é sempre do backend, 401/403, confirmada no
 * servidor pela própria página):
 *
 * 1. **Proteção**: sem cookie de sessão → manda ao `/login`. Não lê dados, não decide autorização.
 * 2. **Deslize do cookie**: re-emite o cookie de sessão com `Max-Age` fresco a cada navegação
 *    protegida. Sem isto, o cookie viveria só 7 dias a partir do LOGIN (o browser nunca chama
 *    `/api/auth/*` na jornada BFF), e um usuário ativo seria deslogado no 7º dia mesmo com a sessão
 *    deslizada no banco — o "teto absoluto" que o épico diz não existir. O valor/assinatura do cookie
 *    não mudam (só o `Max-Age`); quem expira por inatividade continua sendo o banco.
 */
export function proxy(req: NextRequest): NextResponse {
  const nomes = req.cookies.getAll().map((c) => c.name);
  if (decidirAcesso(req.nextUrl.pathname, nomes) === 'login') {
    // Redirect ABSOLUTO sobre a ORIGEM PÚBLICA configurada — nem `nextUrl.clone()` (atrás de
    // proxy o host do `nextUrl` é o bind interno `0.0.0.0:3000`, fora do ar), nem `Location`
    // relativa (nos ROUTE HANDLERS ela passa intacta e funciona, mas AQUI o wrapper do servidor
    // do Next parseia a Location do middleware como URL absoluta e responde 500 ERR_INVALID_URL
    // — visto em staging; o teste unitário não pega porque chama `proxy()` sem o wrapper).
    return NextResponse.redirect(new URL('/login', getPublicOrigin()));
  }

  const res = NextResponse.next();
  deslizarCookieDeSessao(req, res);
  return res;
}

/** Re-emite o cookie de sessão presente com `Max-Age` fresco, preservando valor, assinatura e flags. */
function deslizarCookieDeSessao(req: NextRequest, res: NextResponse): void {
  const cookie = req.cookies.get(SESSION_COOKIE_SECURE) ?? req.cookies.get(SESSION_COOKIE);
  if (!cookie) return;
  res.cookies.set({
    name: cookie.name,
    value: cookie.value, // decode↔encode do Next é inverso fiel — a assinatura é preservada
    httpOnly: true,
    // O prefixo `__Secure-` só existe em cookie `Secure`; re-emitir sem `Secure` faria o browser
    // recusá-lo. Em dev (nome sem prefixo) o cookie é não-secure e continua usável.
    secure: cookie.name.startsWith('__Secure-'),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_S,
  });
}

export const config = {
  matcher: ['/painel/:path*'],
};
