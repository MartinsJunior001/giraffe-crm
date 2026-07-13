/**
 * Chamadas à API interna, feitas SEMPRE no servidor (BFF).
 *
 * O browser fala apenas com a origem da Web; é este código, no servidor Next, que conversa com a API
 * interna (`API_BASE_URL`, sem `NEXT_PUBLIC_`) e faz o RELAY do cookie de sessão. Assim a API continua
 * inalcançável pelo browser, não há cookie cross-origin, e nada de segredo/URL interna vaza para o
 * cliente. O cookie do Better Auth é validado por ASSINATURA (independe de domínio), então guardá-lo
 * na origem da Web e reencaminhá-lo à API funciona.
 */

export type MotivoFalhaLogin = 'credenciais' | 'limite' | 'indisponivel';
export type ResultadoLogin =
  { ok: true; cookies: string[] } | { ok: false; motivo: MotivoFalhaLogin };

function lerSetCookies(res: Response): string[] {
  return res.headers.getSetCookie?.() ?? [];
}

/**
 * Autentica na API e devolve os `Set-Cookie` para reencaminhar ao browser.
 *
 * A falha é NEUTRA de propósito: qualquer resposta não-OK que não seja 429 vira `credenciais`, sem
 * distinguir "conta não existe" de "senha errada" — a neutralidade contra enumeração é herdada da API
 * (Story 1.4) e não pode ser desfeita aqui. O 429 vira `limite`; erro de rede vira `indisponivel`.
 */
export async function loginNaApi(
  baseUrl: string,
  email: string,
  senha: string,
  origin: string,
): Promise<ResultadoLogin> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      // `origin` é exigido pelo CSRF do Better Auth fora de teste; mandamos a origem da própria Web,
      // que está na allowlist (CORS_ALLOWED_ORIGINS/trustedOrigins).
      headers: { 'content-type': 'application/json', origin },
      body: JSON.stringify({ email, password: senha }),
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (res.status === 429) return { ok: false, motivo: 'limite' };
  if (!res.ok) return { ok: false, motivo: 'credenciais' };
  return { ok: true, cookies: lerSetCookies(res) };
}

/**
 * Encerra a sessão CORRENTE na API (RN-012) e devolve os `Set-Cookie` de limpeza para reencaminhar.
 *
 * Best-effort: se a API não responder, ainda assim o chamador limpa o cookie local e manda ao Login —
 * um logout que só falha porque a rede piscou seria pior que inútil.
 */
export async function logoutNaApi(
  baseUrl: string,
  cookie: string,
  origin: string,
): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/auth/sign-out`, {
      method: 'POST',
      // Manda o `origin` (na allowlist) como o login faz: em produção o Better Auth confere a Origin, e
      // um sign-out sem ela poderia ser recusado — logout que falha em silêncio é pior que inútil.
      headers: { 'content-type': 'application/json', origin, cookie },
      body: '{}',
      cache: 'no-store',
    });
    return lerSetCookies(res);
  } catch {
    return [];
  }
}

export type EstadoOrg =
  | { ok: true; orgId: string }
  | { ok: false; motivo: 'sem-sessao' | 'sem-organizacao' | 'indisponivel' };

/**
 * Confirma no SERVIDOR o contexto da Organização — a fonte de verdade é o backend, não o middleware.
 *
 * 401 = sem sessão válida (expirada/ausente) → volta ao Login. 403 = autenticado, mas sem Organização
 * ativa (Membership suspensa/removida, ou nenhuma) — estado honesto, não erro de credencial.
 */
export async function fetchOrgAtual(baseUrl: string, cookie: string): Promise<EstadoOrg> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/organizations/current`, {
      headers: { cookie },
      cache: 'no-store',
    });
  } catch {
    return { ok: false, motivo: 'indisponivel' };
  }
  if (res.status === 401) return { ok: false, motivo: 'sem-sessao' };
  if (res.status === 403) return { ok: false, motivo: 'sem-organizacao' };
  if (!res.ok) return { ok: false, motivo: 'indisponivel' };
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return body.id ? { ok: true, orgId: body.id } : { ok: false, motivo: 'sem-organizacao' };
}
