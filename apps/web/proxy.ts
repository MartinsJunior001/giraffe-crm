import { NextResponse, type NextRequest } from 'next/server';
import { getPublicOrigin } from '@/lib/env';
import {
  SESSION_COOKIE,
  SESSION_COOKIE_SECURE,
  SESSION_MAX_AGE_S,
  decidirAcesso,
  rotaExigeSessao,
} from '@/lib/session';
import { HSTS_VALOR, ehEsquemaHttps, gerarNonce, montarCsp } from '@/lib/cabecalhos-seguranca';

/**
 * Proteção de rota + deslize do cookie + cabeçalhos de segurança dinâmicos
 * (Next 16: convenção `proxy`, que sucede `middleware`).
 *
 * Três responsabilidades. As duas primeiras são UX (a negação REAL é sempre do backend, 401/403,
 * confirmada no servidor pela própria página); a terceira é a borda de segurança (TECH-S1):
 *
 * 1. **Proteção**: sem cookie de sessão → manda ao `/login`. Não lê dados, não decide autorização.
 * 2. **Deslize do cookie**: re-emite o cookie de sessão com `Max-Age` fresco a cada navegação
 *    protegida. Sem isto, o cookie viveria só 7 dias a partir do LOGIN (o browser nunca chama
 *    `/api/auth/*` na jornada BFF), e um usuário ativo seria deslogado no 7º dia mesmo com a sessão
 *    deslizada no banco — o "teto absoluto" que o épico diz não existir. O valor/assinatura do cookie
 *    não mudam (só o `Max-Age`); quem expira por inatividade continua sendo o banco.
 * 3. **CSP com nonce + HSTS**: emitidos aqui, e não no `next.config.ts`, porque dependem da
 *    requisição — o nonce precisa ser novo a cada resposta e o HSTS só faz sentido sobre HTTPS.
 *
 * O `matcher` foi ampliado de `/painel/:path*` para todas as rotas de documento: um cabeçalho de
 * segurança que valesse só na área logada deixaria o `/login` — a página que recebe credencial —
 * como a única sem CSP. A proteção de rota **não** mudou de alcance: `decidirAcesso` continua
 * consultando `ROTAS_PROTEGIDAS`, e o deslize do cookie segue condicionado à rota protegida.
 */
export function proxy(req: NextRequest): NextResponse {
  const nomes = req.cookies.getAll().map((c) => c.name);

  // Uma única montagem por requisição: o MESMO valor vai para o header de requisição (de onde o
  // Next lê o nonce) e para o de resposta (que o browser aplica). Montar duas vezes abriria a porta
  // para os dois divergirem — e uma CSP que não casa com o nonce do documento bloqueia a aplicação.
  const nonce = gerarNonce();
  const https = ehEsquemaHttps(req.headers.get('x-forwarded-proto'), req.nextUrl.protocol);
  const csp = montarCsp({ nonce, producao: process.env.NODE_ENV === 'production', https });

  if (decidirAcesso(req.nextUrl.pathname, nomes) === 'login') {
    // Redirect ABSOLUTO sobre a ORIGEM PÚBLICA configurada — nem `nextUrl.clone()` (atrás de
    // proxy o host do `nextUrl` é o bind interno `0.0.0.0:3000`, fora do ar), nem `Location`
    // relativa (nos ROUTE HANDLERS ela passa intacta e funciona, mas AQUI o wrapper do servidor
    // do Next parseia a Location do middleware como URL absoluta e responde 500 ERR_INVALID_URL
    // — visto em staging; o teste unitário não pega porque chama `proxy()` sem o wrapper).
    const redirecionamento = NextResponse.redirect(new URL('/login', getPublicOrigin()));
    aplicarCabecalhosDinamicos(redirecionamento, csp, https);
    return redirecionamento;
  }

  // O nonce viaja no header de REQUISIÇÃO: é dali que o Next o lê para aplicá-lo aos scripts e
  // estilos que ele próprio injeta no documento. Sem este repasse, a CSP bloquearia a própria
  // aplicação — o framework não teria como saber qual nonce o browser vai exigir.
  const headersDaRequisicao = new Headers(req.headers);
  headersDaRequisicao.set('x-nonce', nonce);
  headersDaRequisicao.set('Content-Security-Policy', csp);

  const res = NextResponse.next({ request: { headers: headersDaRequisicao } });
  if (rotaExigeSessao(req.nextUrl.pathname)) deslizarCookieDeSessao(req, res);
  aplicarCabecalhosDinamicos(res, csp, https);
  return res;
}

/**
 * Escreve na resposta os cabeçalhos que dependem da requisição.
 *
 * HSTS **só sobre HTTPS**: a RFC 6797 manda o browser ignorar o cabeçalho recebido em transporte
 * não seguro, então emiti-lo sobre HTTP seria ruído que ainda faria um teste local "provar" algo
 * que nenhum browser honra.
 */
function aplicarCabecalhosDinamicos(res: NextResponse, csp: string, https: boolean): void {
  res.headers.set('Content-Security-Policy', csp);
  if (https) res.headers.set('Strict-Transport-Security', HSTS_VALOR);
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

/**
 * Alcance do proxy: **todo documento**, para que a CSP cubra também `/login` e a home.
 *
 * Excluídos de propósito: `_next/static` e `_next/image` (assets imutáveis — gastar um nonce por
 * arquivo servido não protege nada e custa por requisição), `favicon.ico` e `/healthz` (liveness
 * do container: precisa continuar barata e sem depender desta camada).
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|healthz).*)'],
};
