/**
 * Detecção de sessão e decisão de proteção de rota — lógica PURA, testável sem o runtime do Next.
 *
 * Isto é **UX, não autorização**. A presença do cookie só decide se o usuário vê a tela ou é mandado
 * ao Login. Quem de fato autoriza (ou nega) é sempre o backend (401/403) — o middleware nunca lê
 * dados nem revela recursos. Ver a Story 1.5, invariante 4.
 */

/** Nome do cookie de sessão do Better Auth. */
export const SESSION_COOKIE = 'better-auth.session_token';

/**
 * Em produção (cookies `Secure`), o Better Auth PREFIXA o nome com `__Secure-`. Um middleware que só
 * procurasse o nome de dev não veria a sessão em produção e mandaria todo mundo para o Login. Por isso
 * reconhecemos os dois nomes.
 */
export const SESSION_COOKIE_SECURE = `__Secure-${SESSION_COOKIE}`;

/**
 * `Max-Age` (segundos) do cookie de sessão — casa com `session.expiresIn` do Better Auth (7 dias).
 *
 * Serve para o proxy DESLIZAR o cookie do browser a cada navegação protegida. Sem isso, o cookie
 * seria setado no login com `Max-Age=7d` e nunca mais — e um usuário ATIVO seria deslogado 7 dias
 * após o login (teto absoluto), porque a jornada real (browser → BFF → rota de domínio) não passa por
 * `/api/auth/*` e nunca re-emitia o cookie, embora o `expiresAt` deslizasse no banco. A autoridade
 * continua sendo o banco (expiração por inatividade); o proxy só mantém o cookie do cliente em sincronia.
 */
export const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;

/** Prefixos de rota que exigem sessão. Proteção por prefixo, deny-by-default para o que casar. */
export const ROTAS_PROTEGIDAS = ['/painel'] as const;

export function rotaExigeSessao(pathname: string): boolean {
  return ROTAS_PROTEGIDAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/** Há cookie de sessão presente? Aceita o nome de dev e o `__Secure-` de produção. */
export function temSessao(nomesDeCookies: Iterable<string>): boolean {
  for (const nome of nomesDeCookies) {
    if (nome === SESSION_COOKIE || nome === SESSION_COOKIE_SECURE) return true;
  }
  return false;
}

/** Decisão do middleware: liberar ou mandar ao Login. UX apenas — o backend continua sendo a autoridade. */
export function decidirAcesso(
  pathname: string,
  nomesDeCookies: Iterable<string>,
): 'permitir' | 'login' {
  if (!rotaExigeSessao(pathname)) return 'permitir';
  return temSessao(nomesDeCookies) ? 'permitir' : 'login';
}

/**
 * Defesa contra CSRF nos route handlers de mutação (login/logout).
 *
 * Route Handlers do Next **não** têm proteção CSRF automática (só Server Actions têm), e o BFF chama a
 * API server-to-server com um Origin de confiança — então a defesa anti-login-CSRF do Better Auth é
 * contornada. Sem esta checagem, um site terceiro auto-submeteria um form cross-site com as CREDENCIAIS
 * DO ATACANTE, a Web faria relay do cookie do atacante para o navegador da vítima, e a vítima passaria a
 * operar dentro do tenant do atacante (login CSRF → vazamento cross-tenant). `SameSite=Lax` não protege
 * isso: o ataque não depende de enviar cookie da vítima, e sim de a RESPOSTA plantar um cookie novo.
 *
 * Regra (fail-closed): o POST só é aceito se for comprovadamente da MESMA ORIGEM. Preferimos o
 * `Sec-Fetch-Site` (Fetch Metadata); na ausência dele, exigimos `Origin` igual à própria origem. Sem
 * nenhum sinal, recusa — um POST de navegador legítimo sempre carrega ao menos um dos dois.
 */
export function ehMesmaOrigem(
  secFetchSite: string | null,
  origin: string | null,
  origemEsperada: string,
): boolean {
  if (secFetchSite !== null) return secFetchSite === 'same-origin';
  if (origin !== null) return origin === origemEsperada;
  return false;
}
